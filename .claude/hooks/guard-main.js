// PreToolUse hook (see .claude/settings.json): refuses any push to main, so
// every change goes through a pull request (CLAUDE.md). It is a local
// backstop only: a claude.ai project thread runs no repository hooks, and the
// lasting guard belongs in a GitHub ruleset on main.
// Blocks `git push` that names main as the target (quoted or not), `--all`
// and `--mirror` (they push main too), any `git push` from a checkout of main
// (following `cd dir`, `pushd dir` and `git -C dir`), `gh api` writes to main
// (contents without a branch or with `branch=main`, and `git/refs/heads/main`),
// and GitHub MCP writes to main or to the default branch by omission. It reads the command as text, so a command that
// merely quotes a push to main, such as an echo or a commit message, is
// blocked too; reword it. A branch named through a shell variable is not
// seen. Merging a PR is not affected. Exit code 2 blocks the call and shows
// the message to Claude.
const { execFileSync } = require('child_process');
const path = require('path');

// `git push`, also after global options (`-C dir`, `-c key=value`, `--git-dir dir`, `--no-pager`, `-P`).
const GIT_PUSH =
  /^.*?\bgit((\s+(-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix)\s+\S+)|(\s+-[\w-]+(=\S+)?))*\s+push\b/;
const MAIN_REF = /(^|[\s:+])(refs\/heads\/)?main(?=\s|$)/;

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
    const parts = (args.command || '').replace(/['"]/g, '').split(/&&|\|\||[;&|()`\n]/);
    let cwd = call.cwd || process.cwd();
    for (const part of parts) {
      const cd = part.match(/^\s*(?:cd|pushd)\s+(\S+)\s*$/);
      if (cd) {
        cwd = path.resolve(cwd, cd[1].replace(/^~(?=\/|$)/, process.env.HOME || '~'));
        continue;
      }
      if (/\bgh\s+api\b/.test(part) && ghApiWritesMain(part)) block('gh api write to main');
      if (!GIT_PUSH.test(part)) continue;
      const rest = part.replace(GIT_PUSH, ' ');
      // main as a ref of its own: `origin main`, `HEAD:main`, `:main`,
      // `+main`, `refs/heads/main`; never a branch that merely contains it.
      if (MAIN_REF.test(rest)) block('git push to main');
      if (/\s--(all|mirror)\b/.test(rest)) block('git push --all or --mirror, which push main too');
      const dashC = part.match(/\bgit\s+(?:\S+\s+)*?-C\s+(\S+)/);
      const repo = dashC ? path.resolve(cwd, dashC[1]) : cwd;
      if (currentBranch(repo) === 'main') {
        block('git push from a checkout of main (create a branch first)');
      }
    }
  } else if (/^mcp__github__(push_files|create_or_update_file|delete_file)$/.test(tool)) {
    const branch = String(args.branch || '').replace(/^refs\/heads\//, '');
    if (branch === '' || branch === 'main') block(`${tool} on main`);
  }
  process.exit(0);
});

function ghApiWritesMain(part) {
  const method = part.match(/(?:-X|--method)[\s=]+(\w+)/);
  const writes = method ? method[1].toUpperCase() !== 'GET' : /\s(-f|-F|--field|--raw-field|--input)[\s=]/.test(part);
  if (!writes) return false;
  if (/\/git\/refs\/heads\/main(?=[\s/?]|$)/.test(part)) return true;
  if (!/\/contents\//.test(part)) return false;
  const branch = part.match(/\bbranch=(?:refs\/heads\/)?(\S+)/);
  return !branch || branch[1] === 'main';
}

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
