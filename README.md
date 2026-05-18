# IdeaCard

IdeaCard 是一个基于 Tauri、React 和 TypeScript 构建的桌面灵感卡片应用。它主打托盘常驻和快速记录：需要记下一段想法时，通过托盘或全局快捷键打开一个无边框的小窗口，输入标题和 Markdown 内容后自动保存；需要整理时，再进入主界面查看、搜索、编辑和删除卡片。

## 功能特性

- 托盘常驻：托盘左键打开快速记录窗口，托盘菜单可进入主界面或退出应用。
- 全局快捷键：默认 `Ctrl+Shift+I` 打开快速记录窗口，可在设置页修改。
- 快速记录窗口：轻量无边框窗口，支持标题和 Markdown 正文输入，失焦后自动保存并隐藏。
- 卡片切换：快速记录窗口中使用 `Ctrl + ↑/↓/←/→` 在新卡片和历史卡片之间切换，普通方向键保留给输入框光标移动。
- 主界面管理：查看全部灵感卡片，按标题或正文搜索，编辑、保存和删除卡片。
- Markdown 文件存储：每张卡片保存为独立 `.md` 文件，文件头包含 `id`、标题、创建时间和更新时间。
- 可配置存储目录：设置页可选择 Markdown 保存位置。
- 安装目录优先的默认保存路径：首次启动时优先在应用安装目录创建 `IdeaCenter`；如果安装目录无写权限，则自动回退到用户目录下的 `.IdeaCard/IdeaCenter`。

## 技术栈

- Tauri 2：桌面容器、托盘、窗口管理和原生命令。
- React 18：前端界面。
- TypeScript：前端类型检查。
- Vite：前端开发与构建。
- Rust：本地文件读写、设置管理、全局快捷键注册。
- lucide-react：界面图标。

## 项目结构

```text
.
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── icon.png
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── vite-env.d.ts
└── src-tauri/
    ├── Cargo.toml
    ├── Cargo.lock
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    ├── icons/
    └── src/
        ├── lib.rs
        └── main.rs
```

## 本地开发

准备环境：

- Node.js
- Rust
- Tauri 2 所需系统依赖

安装依赖：

```bash
npm install
```

启动前端开发服务器：

```bash
npm run dev
```

启动 Tauri 开发模式：

```bash
npm run tauri:dev
```

## 构建

构建前端：

```bash
npm run build
```

构建桌面安装包：

```bash
npm run tauri:build
```

构建产物位于 `dist/` 和 `src-tauri/target/`，这些目录可以重新生成，不应提交到 Git。

## 数据与设置

应用设置保存在系统应用配置目录的 `settings.json` 中。首次启动时，如果设置文件不存在，应用会生成默认设置：

1. 尝试在应用可执行文件所在目录创建 `IdeaCenter`。
2. 如果创建失败，回退到用户目录下的 `.IdeaCard/IdeaCenter`。

用户在设置页手动选择保存目录后，应用会尊重该目录，不会在后续启动时自动迁移已有卡片。

灵感卡片以 Markdown 文件保存，示例：

```markdown
---
{
  "id": "Example-20260519-103000",
  "title": "Example",
  "created_at": "1779167400000",
  "updated_at": "1779167400000"
}
---
这里是 Markdown 正文。
```

## Git 提交范围

本仓库应提交源码、配置、锁文件和必要资源，包括：

- `src/`
- `src-tauri/src/`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/`
- `src-tauri/icons/`
- `public/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.gitignore`
- `README.md`

以下内容属于可再生或本地运行产物，不应提交：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `.omx/`
- `.playwright-mcp/`
- `*.log`
