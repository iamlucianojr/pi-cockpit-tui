# pi-cockpit-tui

One terminal UI extension for [pi](https://github.com/badlogic/pi-mono): footers, widgets,
task tracking and theme switching, all toggleable at runtime from a single `/cockpit` command.

> Not affiliated with the unrelated `pi-cockpit` package on npm.

![pi-cockpit-tui in action](https://raw.githubusercontent.com/iamlucianojr/pi-cockpit-tui/main/assets/demo.gif)

## Install

```bash
pi install npm:pi-cockpit-tui
```

## What you get

Nine visual features that would otherwise be nine separate extensions, sharing one config
file and one hot-reloadable settings command.

### Footers

Only one footer is active at a time. Switch live with `/cockpit footer <mode>`.

| Mode | Shows |
|---|---|
| `minimal` | Model, project, session name, context bar. One line. |
| `tool-counter` | Model, context bar, tokens, cost, git status, per-tool call tally. Two lines. |
| `tilldone` | Task list with progress, active and completed tasks. |
| `none` | Nothing. |

The `tool-counter` footer runs a single `git status --porcelain=v2 --branch` per refresh,
cached with a 2 second TTL and invalidated whenever a `write`, `edit` or `bash` tool runs.
It renders branch, ahead and behind, staged, unstaged, untracked, conflicted, stash count,
last commit age, and any in-progress rebase, merge, cherry-pick, revert or bisect:

```
⎇ main ↑3 ↓1 ●5 +2 ?1 ⚑1 …7m  ⚠ rebase
```

When the terminal is too narrow, detail is dropped by priority. The branch is never dropped.

### Task tracking

A `tilldone` tool the model can call to declare and update its plan, plus a current-task
widget above the editor and a full-list overlay.

```js
tilldone({ action: "new-list", text: "Ship v2 API", description: "Auth and limits" })
tilldone({ action: "add", texts: ["audit auth middleware", "add rate limiting"] })
tilldone({ action: "toggle", id: 1 })   // idle -> inprogress -> done -> idle
tilldone({ action: "list" })
tilldone({ action: "clear" })
```

`/tilldone` opens the overlay, running it again closes it. Tasks are per session and reset
when you start a new one.

### Everything else

| Feature | What it does |
|---|---|
| `tab-status` | Terminal tab title tracks agent state: `:new`, `:running...`, `:✅`, `:⚡`, `:⏰` |
| `tool-counter-widget` | Coloured per-tool call badges above the editor |
| `theme-cycler` | `Alt+T` and `Alt+Shift+T` cycle themes, `/theme` opens a picker, optional swatch flash |
| `subagent-widget` | Live status widget per background subagent |
| `purpose-gate` | Asks for a session intent, then pins it as a banner and injects it into the system prompt |

## Commands

| Command | Description |
|---|---|
| `/cockpit` | Settings UI |
| `/cockpit footer <mode>` | Switch footer without opening the UI |
| `/cockpit toggle <key>` | Flip any boolean setting |
| `/tilldone` | Open or close the task overlay |
| `/theme [name]` | Theme picker, or set one directly |
| `/sub <task>` | Spawn a background subagent |
| `/subcont <id> <msg>` | Continue a subagent session |
| `/subrm <id>`, `/subclear` | Remove one or all subagent widgets |

A feature turned off in `/cockpit` still registers its commands, but they tell you they are
disabled rather than acting.

## Configuration

Read from `.pi/cockpit.json` in the project, falling back to `~/.pi/cockpit.json`. Any key
you omit takes its default. Changes made through `/cockpit` are written back to the project
file and applied immediately, no restart.

```json
{
  "footerMode": "minimal",
  "toolCounterWidget": false,
  "purposeGate": false,
  "subagentWidget": true,
  "themeSwatch": true,
  "tabStatus": true,
  "tilldone": false,
  "themeCycler": true
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `footerMode` | `"minimal" \| "tool-counter" \| "tilldone" \| "none"` | `"minimal"` | Active footer |
| `toolCounterWidget` | boolean | `false` | Badge row above the editor |
| `purposeGate` | boolean | `false` | Intent dialog on session start |
| `subagentWidget` | boolean | `true` | Per-subagent status widgets |
| `themeSwatch` | boolean | `true` | Colour swatch flash after a theme change |
| `tabStatus` | boolean | `true` | Terminal tab title |
| `tilldone` | boolean | `false` | Task tool, widget and overlay |
| `themeCycler` | boolean | `true` | `Alt+T` shortcuts and `/theme` |

Invalid values are ignored rather than rejected, so a typo falls back to the default instead
of breaking startup. Setting `footerMode: "tilldone"` without `tilldone: true` falls back to
`minimal`.

## Development

```bash
npm run typecheck
npm test
```

Tests are plain `node:test`, no framework. They cover the context bar, git porcelain
parsing, footer truncation, config validation and the task state machine. `npm publish`
runs both first.

Source: [github.com/iamlucianojr/pi-cockpit-tui](https://github.com/iamlucianojr/pi-cockpit-tui)

To re-record the demo you need [vhs](https://github.com/charmbracelet/vhs):

```bash
vhs assets/demo.tape
```

## Requirements

Node 22.6 or newer, since the extension ships TypeScript sources that pi loads directly.

## License

MIT
