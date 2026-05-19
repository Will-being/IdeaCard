# IdeaCard

[English](./README.md) | [简体中文](./README-zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Tray-first Markdown cards for capturing ideas before they disappear.

IdeaCard is a lightweight desktop app built with Tauri, React, and TypeScript. It opens a compact quick-capture card from the system tray or a global shortcut, saves your title and Markdown note when the card truly loses focus, and keeps every idea as a plain `.md` file you can back up, sync, search, or edit elsewhere.

## Features

- **Fast capture from the tray**: left-click the tray icon or use the tray menu to open quick capture, open the main window, or quit.
- **Global shortcut**: `Ctrl+Shift+I` opens quick capture by default, and the shortcut can be changed in Settings.
- **Draft-safe quick card**: move the quick-capture window without losing typed content; saving happens when the card actually loses focus.
- **Markdown-first storage**: each idea is saved as an individual Markdown file with JSON front matter for `id`, title, creation time, and update time.
- **Card navigation**: use `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown` in quick capture to switch between a new card and existing cards while normal arrow-key text editing still works.
- **Library view**: browse, search by title or body, edit, save, and delete cards from the main window.
- **Configurable storage**: choose where IdeaCard stores Markdown cards from the Settings screen.
- **Sensible first-run path**: IdeaCard first tries `IdeaCenter` next to the executable, then falls back to `.IdeaCard/IdeaCenter` in the user's home directory.

## Workflow

IdeaCard has two focused surfaces:

- **Quick Capture**: a small transparent, decoration-free card for writing down an idea immediately.
- **Main Window**: a management view for searching, editing, and deleting saved cards.

The app is intentionally file-friendly. Saved cards remain ordinary Markdown files, so they work well with sync folders, backup tools, full-text search, and external editors.

## Quick Start

### Prerequisites

- Node.js
- Rust
- System dependencies required by Tauri 2

### Install

```bash
npm install
```

### Run in Development

Run the frontend only:

```bash
npm run dev
```

Run the desktop app with Tauri:

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

## Data and Settings

Settings are stored in the system app configuration directory as `settings.json`.

On first launch, IdeaCard chooses a default storage directory in this order:

1. `IdeaCenter` next to the app executable.
2. `.IdeaCard/IdeaCenter` in the user's home directory, if the executable directory is not writable.

Every idea card is written as a standalone `.md` file in the selected storage directory.

## Tech Stack

- Tauri 2 for the desktop shell, tray integration, window management, native commands, and packaging.
- React 18 and TypeScript for the frontend.
- Vite for local development and production builds.
- Rust for file I/O, settings management, global shortcut registration, and tray behavior.
- lucide-react for interface icons.

## Project Structure

```text
.
|-- index.html
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- vite.config.ts
|-- public/
|   `-- icon.png
|-- src/
|   |-- App.tsx
|   |-- main.tsx
|   |-- styles.css
|   `-- vite-env.d.ts
`-- src-tauri/
    |-- Cargo.toml
    |-- Cargo.lock
    |-- build.rs
    |-- tauri.conf.json
    |-- capabilities/
    |   `-- default.json
    |-- icons/
    `-- src/
        |-- lib.rs
        `-- main.rs
```

## Current Limitations

- Prebuilt release packages are not included in this repository yet; use `npm run tauri:build` to package locally.
- IdeaCard stores local Markdown files and does not provide built-in cloud sync.
- The quick-capture shortcut parser currently supports common modifier-plus-letter/digit combinations.

## Contributing

Small, focused changes are easiest to review. Please run the relevant build or verification command before opening a pull request:

```bash
npm run build
```

## License

MIT License. See [LICENSE](./LICENSE).
