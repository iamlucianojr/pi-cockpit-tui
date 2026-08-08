# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-08-08

### Added
- Source repository at github.com/iamlucianojr/pi-cockpit-tui, wired into `repository`, `homepage` and `bugs`.

### Fixed
- Demo image now uses an absolute URL so it renders on npmjs.com.

## [0.1.1] - 2026-08-07

### Added
- README rewritten with a recorded demo, git status legend, command and config tables.
- Package description and keywords for npm discovery.

## [0.1.0] - 2026-08-07

### Fixed
- Minimal footer crashed with `RangeError` when context usage went above 100%. The progress bar is now clamped, matching the tool-counter footer.
- Tilldone footer always showed "no tasks". It read a state object that was never updated; it now reads the tilldone module's real state.
- `/tilldone` overlay could not be closed and detached from state after `new-list`/`clear`. It now toggles open/closed and reads state through a getter.
- `/subcont` registered a widget under a throwaway id that was never cleared, leaving a dead widget after every continue.
- Purpose gate could trap a session: cancelling the prompt re-asked forever while all input was blocked. Cancelling now disarms the gate.

### Changed
- Commands and the tilldone tool now report when their feature is disabled in `/cockpit` instead of silently working.
- The context bar moved to `modules/footer/bar.ts` and is shared by both footers. Duplicating it is what let one footer ship without a clamp.
- Added a `node:test` suite (`npm test`) covering the bar, git porcelain parsing, footer truncation, config validation and the task state machine.
- `prepublishOnly` now runs typecheck and tests, so a broken build cannot be published. Declared `engines.node` and real peer dependency ranges.

### Removed
- `modules/resource-manager.ts` and the `/cockpit-resources|enable|disable` commands. The registry hardcoded one specific machine's extension set and called `process.exit(0)` on the host agent.

### Added
- `modules/footer/git.ts` — shared git-info source. One `git status --porcelain=v2 --branch` call per refresh, 2s TTL cache, refreshed on `tool_execution_end` for `write`/`edit`/`bash` and via 30s interval. Surfaces branch, ahead/behind, staged/unstaged/untracked/conflicted, stash count, last-commit age, and in-progress operation (rebase/merge/cherry-pick/revert/bisect).
- Tool-counter footer line 2 now renders compact git status: `⏇ main ↑3 ↓1 ‥5 +2 ?1 …7m ⚠ rebase` with priority-based truncation when width is tight.

### Changed
- Tool-counter footer no longer relies on `footerData.getGitBranch()` alone; full status is always live without needing a branch flip to refresh.
- Footer ticks every 2s to surface staged/unstaged changes between renders.

## [0.1.0] - 2026-04-29

### Added

- Initial release — unified terminal UI extension replacing 9 separate extensions
- **tab-status** — terminal tab title reflects agent state (new / running / ✅ / ⚡ / ⏰)
- **Footer modes** — `minimal` (model + context %), `tool-counter` (2-line model+tokens+cost / branch+tools), `tilldone` (task list), `none` (hidden)
- **tool-counter-widget** — coloured per-tool call badge row above the editor
- **theme-cycler** — Ctrl+X / Ctrl+Q cycle themes, `/theme` picker, auto-dismiss swatch
- **subagent-widget** — per-subagent live status widget; `/sub`, `/subcont`, `/subrm`, `/subclear` commands
- **purpose-gate** — intent dialog on session start, persistent purpose widget, blocks input until set
- **tilldone** — full task lifecycle tool (`new-list`, `add`, `toggle`, `remove`, `update`, `list`, `clear`), inprogress-task widget, `/tilldone` overlay, agent-end nudge
- **`/cockpit` command** — hot-reload config toggle UI; also supports `/cockpit footer <mode>` and `/cockpit toggle <key>`
- Config files: `.pi/cockpit.json` (project) with `~/.pi/cockpit.json` global fallback
