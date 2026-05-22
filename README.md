# IdeaCard

[English](./README.md) | [简体中文](./README-zh.md)

IdeaCard is a tray-first desktop notebook for capturing short-lived ideas, writing them in Markdown, and keeping them as local files you can search, edit, back up, or sync with your own tools.

## Why IdeaCard

IdeaCard is built for the moment when an idea appears before you are ready to open a full notes app. It keeps a small quick-capture card one shortcut away, then gives you a larger library window for cleanup, search, and editing later.

It is intentionally local-first: every idea is saved as a standalone Markdown file with metadata, not locked inside a database.

## Features

### Quick capture

- Open the quick-capture card from the tray icon or the global shortcut.
- Default shortcut: `Ctrl+Shift+I`.
- Edit a title and rich Markdown body in a compact floating card.
- Drag the quick card without losing your draft.
- Auto-save only when the quick card truly loses focus.
- Use `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown` to move between a new blank card and existing saved cards.
- See the current card position and last update time in the quick card footer.

### Main library

- Open the main window from the tray menu or the quick-capture button.
- Browse all saved idea cards, sorted by latest update.
- Search by title or body text.
- Open a card in an editor dialog.
- Auto-save edits while working in the main editor.
- Delete cards from the library.
- Refresh the library from disk.

### Markdown editor

The editor supports a practical subset of Markdown and provides an insert menu for common blocks.

- Paragraphs and headings.
- Bold, italic, inline code, Markdown links, and bare `http`, `https`, or `www` URLs.
- `Ctrl + click` on a rendered link opens it in the system browser.
- Ordered and unordered lists.
- Task lists with clickable checkboxes.
- Completed task items are shown with a strikethrough.
- Empty list items keep their marker until you press delete/backspace again.
- Block quotes.
- Code blocks.
- Horizontal dividers.
- Tables.
- Comment callouts saved as `> [!comment]`.
- `@` opens the insert menu for comment, table, quote, code, task list, unordered list, ordered list, and divider blocks.
- Block toolbar for deleting supported block-level content.
- Long notes scroll normally in both quick capture and the main editor.

### Local files and settings

- Each idea is saved as an individual `.md` file.
- Files include JSON metadata for `id`, `title`, `created_at`, and `updated_at` in front matter.
- Choose the storage directory from Settings.
- Settings are stored in the system application config directory.
- On first launch, IdeaCard tries `IdeaCenter` next to the executable.
- If that location is not writable, it falls back to `.IdeaCard/IdeaCenter` in the user's home directory.
- The global shortcut can be changed in Settings.

## Stored file format

IdeaCard writes cards like this:

```md
---
{
  "id": "Example-202605222133",
  "title": "Example",
  "created_at": "1779466380000",
  "updated_at": "1779466380000"
}
---
# Your note

- [ ] A task
- [x] A completed task
```

The body remains ordinary Markdown, so it can be edited with other tools.

## Quick start

### Prerequisites

- Node.js
- Rust
- Tauri 2 system dependencies for your operating system

### Install dependencies

```bash
npm install
```

### Run in development

Frontend dev server only:

```bash
npm run dev
```

Desktop app with Tauri:

```bash
npm run tauri:dev
```

### Build

Build the frontend:

```bash
npm run build
```

Build the desktop package:

```bash
npm run tauri:build
```

## Tech stack

- Tauri 2 for the desktop shell, tray menu, native windows, file access, packaging, and global shortcut integration.
- React 18 and TypeScript for the interface.
- Vite for development and frontend builds.
- Rust for storage, settings, tray behavior, and native commands.
- lucide-react for icons.

## Project structure

```text
.
|-- src/
|   |-- App.tsx
|   |-- main.tsx
|   `-- styles.css
|-- src-tauri/
|   |-- src/
|   |   |-- lib.rs
|   |   `-- main.rs
|   |-- Cargo.toml
|   `-- tauri.conf.json
|-- public/
|-- package.json
|-- vite.config.ts
`-- README.md
```

## Current limitations

- No built-in cloud sync. Use your own sync folder if you want cross-device storage.
- No published release packages in this repository yet; build locally with `npm run tauri:build`.
- The shortcut parser supports common modifier-plus-letter or modifier-plus-digit shortcuts.
- The Markdown editor intentionally supports a focused subset of Markdown rather than every Markdown extension.

## Contributing

Small, focused changes are easiest to review. Before opening a pull request, run:

```bash
npm run build
```

## License

MIT. See [LICENSE](./LICENSE).
