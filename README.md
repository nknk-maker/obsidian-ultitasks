# UltiTasks

A lightweight task manager for [Obsidian](https://obsidian.md) that works directly on standard
markdown checkboxes in your notes — no separate database, no special syntax beyond a few inline
`@key(value)` attributes.

![UltiTasks screenshot](assets/screenshot.png)

## Features

- **Inline tasks, plain markdown.** Any `- [ ] ...` checkbox in any note is a task. Attributes like
  priority, due date, and repeat are just `@key(value)` tokens appended to the line — the note stays
  readable and portable.
- **Sidebar navigation** with four views:
  - **Inbox** — every open task, grouped by the note it lives in.
  - **Priority** — open tasks grouped High → Medium → Low → No priority.
  - **Date** — open tasks grouped into Overdue / Today / the next 7 days.
  - **Completed** — done tasks grouped by completion date, most recent first.
- **List view** for browsing and checking off tasks, with priority/date/repeat badges and a
  one-click jump back to the source line in your note.
- **Edit panel** that always shows the task under your cursor — set priority, schedule a date/time,
  toggle all-day, or set a repeat rule without leaving the keyboard.
- **Recurring tasks.** Checking off a task with a repeat rule (daily/weekly/monthly/yearly) marks the
  current line done and inserts the next occurrence right after it, with the date advanced
  automatically.
- **Live sync.** The sidebar and edit panel update automatically as you edit notes in the main
  editor, and vice versa.

## Task syntax

```markdown
- [ ] Write the quarterly report @priority(high) @date(2026-08-01) @time(09:00) @repeat(weekly)
- [x] Renew domain @done(2026-07-10)
```

| Attribute     | Values                                            | Notes                                  |
| ------------- | -------------------------------------------------- | --------------------------------------- |
| `@priority`   | `high`, `medium`, `low`                            | Omit for no priority                    |
| `@date`       | `YYYY-MM-DD`                                       | The task's scheduled date               |
| `@time`       | `HH:MM` (24-hour)                                  | Requires `@date`; omit for an all-day task |
| `@repeat`     | `never`, `daily`, `weekly`, `monthly`, `yearly`    | Requires `@date`                        |
| `@done`       | `YYYY-MM-DD`                                       | Set automatically when a task is checked |

Everything else on the line is treated as the task's name.

## Installation

This plugin isn't yet on the Obsidian community plugin store. To install manually:

1. Download or build `main.js`, `manifest.json`, and `styles.css` (see [Development](#development)).
2. Copy them into `<your-vault>/.obsidian/plugins/ultitasks/`.
3. Reload Obsidian and enable **UltiTasks** in Settings → Community plugins.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production build
```

The build (via `esbuild.config.mjs`) bundles `src/main.ts` into `main.js` at the project root, which
Obsidian loads directly alongside `manifest.json` and `styles.css`.
