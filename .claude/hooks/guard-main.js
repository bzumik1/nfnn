// PreToolUse hook (see .claude/settings.json): refuses any push to main, so
// every change goes through a pull request (CLAUDE.md). Branch
// protection would do this on GitHub, but on a private repo it needs Pro.
// Blocks `git push` that names main as the target (quoted or not), `--all`
// and `--mirror` (they push main too), any `git push` while main is checked
// out, and GitHub MCP writes that commit straight to main. It reads the
// command as text, so a command that merely quotes a push to main, such as
// an echo or a commit message, is blocked too; reword it.
// Merging a PR is not affected. Exit code 2 blocks the call and shows the
// message to Claude.
const { execFileSync } = require('child_process');

// `git push`, also with `-C dir` or `-c key=value` before the subcommand.
const GIT_PUSH = /^.*?\bgit(\s+-[Cc]\s+\S+)*\s+push\b/;

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let call;
  try {
    call = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const tool = call.tool_name || '';
  const args = call.tool_input || {};

  if (tool === 'Bash') {
    // Quotes go first, so `'main'` and `bash -c '...'` count; then every way
    // to chain commands, subshells and `$(...)` included.
    const pushes = (args.command || '')
      .replace(/['"]/g, '')
      .split(/&&|\|\||[;&|()`\n]/)
      .filter((part) => GIT_PUSH.test(part));
    for (const push of pushes) {
      const rest = push.replace(GIT_PUSH, ' ');
      // main as a ref of its own: `origin main`, `HEAD:main`, `:main`,
      // `+main`, `refs/heads/main`; never a branch that merely contains it.
      if (/(^|[\s:+])(refs\/heads\/)?main(?=\s|$)/.test(rest)) {
        block('git push to main');
      }
      if (/\s--(all|mirror)\b/.test(rest)) {
        block('git push --all or --mirror, which push main too');
      }
      if (currentBranch(call.cwd) === 'main') {
        block('git push while main is checked out');
      }
    }
  } else if (/^mcp__github__(push_files|create_or_update_file|delete_file)$/.test(tool)) {
    if (String(args.branch || '').replace(/^refs\/heads\//, '') === 'main') block(`${tool} on main`);
  }
  process.exit(0);
});

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function block(what) {
  process.stderr.write(
    `Blocked: ${what}. A push to main publishes the Docker images, so every ` +
      'change goes through a branch and a pull request (CLAUDE.md). ' +
      'Push a descriptively named branch and open a PR instead.\n'
  );
  process.exit(2);
}
