# IdeaCard

> A lightweight tray-first desktop app for capturing ideas as Markdown cards.

IdeaCard is built with Tauri, React, and TypeScript. It stays out of the way until you need it: open a borderless quick-capture window from the tray or a global shortcut, write a title and Markdown note, then let the app save it automatically. When it is time to organize, open the main window to browse, search, edit, and delete your idea cards.

[中文说明](./README-zh.md)

## Features

- Tray-first workflow: left-click the tray icon to open quick capture, or use the tray menu to open the main window and quit the app.
- Global shortcut: `Ctrl+Shift+I` opens the quick-capture window by default and can be changed in Settings.
- Quick capture: a compact borderless window for fast title and Markdown input, with auto-save on blur.
- Card navigation: use `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown` in quick capture to move between a new card and existing cards while preserving normal arrow-key text editing.
- Main library: browse all cards, search by title or body, edit content, save changes, and delete cards.
- Markdown storage: every idea is stored as an individual `.md` file with JSON front matter for `id`, title, creation time, and update time.
- Configurable storage: choose where Markdown cards are saved from the Settings screen.
- Sensible default storage: on first launch, IdeaCard tries to create `IdeaCenter` next to the app executable, then falls back to `.IdeaCard/IdeaCenter` in the user's home directory if the install directory is not writable.

## Screens and Workflow

IdeaCard has two app surfaces:

- Quick Capture opens as a transparent, decoration-free note window for fast entry.
- Main Window opens as the full management view for searching and editing saved cards.

Saved cards remain plain Markdown files, so they can be synced, backed up, searched, or edited with external tools.

## Tech Stack

- Tauri 2 for the desktop shell, tray integration, window management, native commands, and packaging.
- React 18 for the frontend interface.
- TypeScript for frontend type checking.
- Vite for frontend development and production builds.
- Rust for local file I/O, settings management, global shortcut registration, and tray behavior.
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

## Getting Started

### Prerequisites

- Node.js
- Rust
- System dependencies required by Tauri 2

### Install Dependencies

```bash
npm install
```

### Run the Frontend Dev Server

```bash
npm run dev
```

### Run the Tauri App in Development

```bash
npm run tauri:dev
```

## Build

Build the frontend:

```bash
npm run build
```

Build the desktop app package:

```bash
npm run tauri:build
```

## Data and Settings

Settings are stored in the system app configuration directory as `settings.json`. On first launch, IdeaCard creates default settings and chooses a storage path:

1. Try to create `IdeaCenter` in the app executable directory.
2. If that fails, fall back to `.IdeaCard/IdeaCenter` in the user's home directory.

Each idea card is saved as a standalone Markdown file in the selected storage directory.

## License

This project currently includes a `LICENSE` file. Update this section with the exact license name before publishing the repository publicly.
