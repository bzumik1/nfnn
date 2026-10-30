---
name: thread-workflow
description: Keep every open PR of a claude.ai project thread moving - confirm a CI run after each push, never end a turn waiting without a scheduled check, branch from main instead of stacking, avoid conflicts in hot files, share the container's CPU, and keep working while a decision card is open
---
# Thread workflow

A project thread wakes only on events: Jakub's message, a PR event it subscribed to, a finished background task, a reminder it scheduled. GitHub sends no event for a run that never starts and nothing after a red run, so a thread that ends its turn "waiting for CI" can wait for days (#157: 5 days after a flaky failure; #162: 31 h on a conflicting PR).

## After every push to a PR branch
1. `subscribe_pr_activity` (idempotent). If the result says another session holds the PR's events, rely on the scheduled checks below and tell the coordinator.
2. Within about 3 minutes, for the pushed head SHA, read the PR's `mergeable_state` (`unknown` right after a push: ask again a minute later) and look for a `PR check` run of that SHA (GitHub tools: `actions_list` with `list_workflow_runs` for `pr-check.yml` and the branch):
   - `dirty`: GitHub runs no workflow on a PR that conflicts with its base. Rebase onto `origin/main` now, resolve, `git push --force-with-lease`, start again.
   - Base other than `main`: `pr-check.yml` and `roadmap-check.yml` run only for PRs to `main`. Retarget the PR to `main` (see Branches) or keep it a draft and say why it has no CI.
   - Only `docs/`, `.claude/` or Markdown changed: no check comes by design. Read the whole diff again, then merge (`CLAUDE.md`).
   - No run otherwise: look at githubstatus.com and again after 10 minutes, then tell Jakub; keep the scheduled check.
3. Never end a turn that waits on CI unless a run of the head SHA was seen and a `send_later` check is scheduled about 20 minutes after the push, naming the PR and the SHA. Each check acts or schedules the next one (10 minutes later while the run is in progress, up to 35 minutes after the push; after that, treat it as no run). A check that fires after the merge only confirms it and stops.
4. When the run ends:
   - Green, with the reviews the task requires done: merge as `CLAUDE.md` allows.
   - Red in code or tests the PR touches, or reproducible locally: fix it. Read the failed job's log as soon as that job fails; the run itself lasts until the backend job ends.
   - Red in a step on the known-flaky list below, or in a job the diff cannot affect whose step was green on `main` the same day: re-run the failed jobs once through the GitHub tools (`actions_run_trigger` with `rerun_failed_jobs`) and comment the run link on the PR. Never an empty commit, never close and reopen. The same step failing again is not flaky: investigate, and if the cause is outside the PR, ask the coordinator to give one thread the fix.
5. Tell Jakub, in one message with the PR link and the one thing he must do, only when: the fix needs him (a setting, a secret, GitHub settings, the server); no run started 10 minutes after a clean push; the same flaky step failed twice in a day; or a PR has waited more than 2 hours on something no thread can unblock.

Known flaky (remove a line when its fix merges):
- `stack`, "Start the production stack": the backend restarts once while a fresh postgres still runs initdb and `docker compose up --wait` gives up. The fix belongs in the CI step or `backend/docker-entrypoint.sh`, never `service_healthy` (`deploy-ci.md`, ZimaOS starts the app once).

## Branches
- One task, one branch from the latest `origin/main`, one worktree (`git worktree add /home/user/wt/<task> -b claude/<task> origin/main`), one PR to `main`. Run `git config rerere.enabled true` once per clone, so a conflict resolved once is replayed on every later rebase.
- Stack a branch on another only when it cannot compile or pass without that branch's code; prefer a small PR for the shared piece that merges first. A stacked PR still targets `main` (a PR to another branch gets no CI), stays a draft until its parent merges, names the parent PR in its body, and then moves with `git rebase --onto origin/main <old parent tip>`.
- While a PR waits on CI or review, work on the next task in its own worktree.
- Generated files (recordings, goldens) are never merged by hand: on a conflict take `main`'s version, rerun the generator, commit.

## Overlaps and rebases
- Before opening a PR, compare its files with the other open PRs (GitHub tools: `list_pull_requests`, then `pull_request_read` with `get_files`). On an overlap in code, the PR that will be green first merges first; the other does not push until then, and rebases once after that merge. An overlap only in docs needs no waiting.
- A rebase without a conflict in code (none, or only in docs) needs no new local test run: push it, CI runs everything. A conflict in code reruns what `CLAUDE.md` "Done means" requires for the code it touched.
- Hot files take new entries in their place, never appended at the end, so two PRs edit different lines:
  - `docs/roadmap.md`: a feature already listed changes its status or PR cell in place; a feature that moves (when it ships or Jakub decides, as the file's introduction says) goes into its sorted place in the target table or list (task number, phase), not after the last row.
  - `docs/api-contract.md`, `system-overview.md`, `frontend-overview.md`, `security-overview.md`: inside the section of its context or resource, in that section's order.
  - `frontend/e2e/accessibility.spec.ts` and `e2e/theme.spec.ts`: beside the cases or routes of the same area (public pages, `/darce`, `/sprava`), in their order.
  - `messages_cs.properties` and `messages_en.properties`: beside the keys with the same prefix.

## Sharing the container
- At most one full backend suite per container at a time (two at once took over 14 minutes each): wrap it in `flock /tmp/nfnn-full-suite.lock`, for example `TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX=mirror.gcr.io/ LC_ALL=C.UTF-8 LANG=C.UTF-8 flock /tmp/nfnn-full-suite.lock ./gradlew test --init-script /tmp/mirror.gradle.kts`. Narrow runs while iterating need no lock.

## Decisions with Jakub
- Jakub wants one question at a time (2026-10-23): one decision card with a recommended option, the most blocking first. Post the next card in the same turn that receives the answer; if he answers in words, close the card (`close_decision`).
- While a card is open, build the recommended option on its branch and do every task that does not depend on the answer; the card's consequence says so ("Pracuji podle doporučení, dokud nerozhodneš."). A step that cannot be undone waits for the answer.
