<p align="center">
  <img src="public/icon.png" alt="IdeaCard" width="96" height="96">
</p>

<h1 align="center">IdeaCard</h1>

<p align="center">
  A tray-first desktop notebook for capturing ideas as local Markdown cards.
</p>

<p align="center">
  English | <a href="./README-zh.md">简体中文</a>
</p>

## What It Is

IdeaCard is a lightweight desktop app for moments when an idea arrives before you want to open a full notes app. It gives you a small quick-capture card from the system tray or a global shortcut, then a larger library window for searching, editing, and cleaning up notes later.

It is local-first by design: every card is stored as an individual `.md` file with JSON metadata in front matter, so your notes stay readable outside the app and can be backed up or synced with tools you already use.

## Features

- Tray-first workflow with a quick-capture window and a separate main library window.
- Default global shortcut: `Ctrl+Shift+I`.
- Quick capture with editable title, Markdown body, draggable borderless window, and save-on-blur behavior.
- Optional clipboard auto-read when opening quick capture with the global shortcut; the setting takes effect immediately after toggling it.
- Keyboard navigation between the blank capture card and saved cards with `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown`.
- Library view sorted by latest update time, with title/body search, refresh, edit, and delete actions.
- Auto-save while editing a card in the main editor dialog.
- Configurable storage directory and global shortcut in Settings.
- Local Markdown files with metadata for `id`, `title`, `created_at`, and `updated_at`.

## Clipboard Capture

Clipboard capture is opt-in. Enable **Read clipboard when opened by shortcut** in Settings, then open the quick-capture window with the configured global shortcut. If the draft is empty and the clipboard contains text, IdeaCard fills the body with that text.

The switch is synchronized across the main and quick-capture windows immediately, so you do not need to restart the app or wait for the next focus refresh after changing it.

## Markdown Support

The editor supports a focused Markdown subset for everyday idea notes:

- Paragraphs and headings.
- Bold, italic, inline code, Markdown links, and bare `http`, `https`, or `www` URLs.
- `Ctrl + click` on a rendered link opens it in the system browser.
- Ordered lists, unordered lists, and task lists with clickable checkboxes.
- Block quotes, code blocks, horizontal dividers, and tables.
- Comment callouts saved as `> [!comment]`.
- `@` insert menu for comment, table, quote, code, task list, unordered list, ordered list, and divider blocks.
- Block toolbar for deleting supported block-level content.
- Normal scrolling for long notes in both quick capture and the main editor.

## Storage

- On first launch, IdeaCard tries to create `IdeaCenter` next to the executable.
- If that location is not writable, it falls back to `.IdeaCard/IdeaCenter` in the user's home directory.
- Settings are stored in the system application config directory.
- You can choose another storage directory from Settings.

## Quick Start

### Prerequisites

- Node.js
- Rust
- Tauri 2 system dependencies for your operating system

### Install Dependencies

```bash
npm install
```

### Run In Development

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

## Tech Stack

- Tauri 2 for the desktop shell, tray menu, native windows, file access, packaging, and global shortcut integration.
- React 18 and TypeScript for the interface.
- Vite for development and frontend builds.
- Rust for storage, settings, tray behavior, and native commands.
- lucide-react for UI icons.


## Current Limitations

- No built-in cloud sync; use a sync folder if you want cross-device storage.
- The shortcut parser supports common modifier-plus-letter or modifier-plus-digit shortcuts.
- The Markdown editor intentionally supports a practical subset of Markdown, not every Markdown extension.

## Contributing

Small, focused changes are easiest to review. Before opening a pull request, run:

```bash
npm run build
```

## License

MIT. See [LICENSE](./LICENSE).
