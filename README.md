# pi-cockpit-tui

Unified terminal UI extension for [pi](https://github.com/badlogic/pi-mono).

Replaces 9 separate visual extensions with one hot-reload-configurable package:

| Feature | What it does |
|---|---|
| **tab-status** | Terminal tab title: `:new` / `:running...` / `:✅` / `:⚡` / `:⏰` |
| **footer: minimal** | 1-line footer — model name + context % bar |
| **footer: tool-counter** | 2-line footer — model+tokens+cost / cwd+branch+tool tally |
| **footer: tilldone** | Footer shows task list + progress |
| **footer: none** | Hides the footer entirely |
| **tool-counter-widget** | Coloured per-tool call badge row above the editor |
| **theme-cycler** | Alt+T / Alt+Shift+T cycle themes; `/theme` picker; colour swatch flash |
| **subagent-widget** | Live status widget per running subagent (`/sub`, `/subcont`, `/subrm`, `/subclear`) |
| **purpose-gate** | Intent dialog on session start; persistent purpose banner; blocks input until answered (cancel the prompt to disarm) |
| **tilldone** | Task lifecycle tool + current-task widget + `/tilldone` overlay |

## Install

```bash
pi install npm:pi-cockpit-tui
```

## Quick start

```bash
# Open the settings toggle UI
/cockpit

# One-shot commands
/cockpit footer minimal
/cockpit footer tool-counter
/cockpit toggle tilldone
/cockpit toggle purpose-gate
```

## Configuration

Config is read from `.pi/cockpit.json` in the project directory, with `~/.pi/cockpit.json` as a global fallback. Any key omitted falls back to the default.

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
| `toolCounterWidget` | boolean | `false` | Badge row above editor |
| `purposeGate` | boolean | `false` | Intent dialog on session start |
| `subagentWidget` | boolean | `true` | Per-subagent status widgets |
| `themeSwatch` | boolean | `true` | Colour swatch flash after theme change |
| `tabStatus` | boolean | `true` | Terminal tab title |
| `tilldone` | boolean | `false` | Task management tool + widget |
| `themeCycler` | boolean | `true` | Alt+T / Alt+Shift+T shortcuts + `/theme` command |

## Subagent commands

| Command | Description |
|---|---|
| `/sub <task>` | Spawn a background subagent |
| `/subcont <id> <message>` | Continue a subagent's session |
| `/subrm <id>` | Remove subagent widget |
| `/subclear` | Clear all subagent widgets |

## TillDone tool

```
tilldone({ action: "new-list", text: "Sprint 3", description: "Auth refactor" })
tilldone({ action: "add", texts: ["Write tests", "Update docs"] })
tilldone({ action: "toggle", id: 1 })   // idle → inprogress → done → idle
tilldone({ action: "list" })
tilldone({ action: "clear" })
```

Use `/tilldone` to open a live overlay showing all tasks. Run it again to close.

A feature turned off in `/cockpit` still registers its commands, but they report that
they are disabled rather than acting.

## Development

```bash
npm run typecheck
npm test
```

## License

MIT
