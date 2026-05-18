# IdeaCard

> 一个托盘优先的轻量桌面灵感卡片应用，将想法保存为 Markdown 文件。

IdeaCard 基于 Tauri、React 和 TypeScript 构建。它默认安静地待在系统托盘里；当你需要记录灵感时，可以通过托盘或全局快捷键打开一个无边框的快速记录窗口，输入标题和 Markdown 内容后自动保存。需要整理时，再进入主界面查看、搜索、编辑和删除卡片。

[English README](./README.md)

## 功能特性

- 托盘优先：左键点击托盘图标打开快速记录窗口，托盘菜单可进入主界面或退出应用。
- 全局快捷键：默认使用 `Ctrl+Shift+I` 打开快速记录窗口，可在设置页修改。
- 快速记录窗口：轻量无边框窗口，支持标题和 Markdown 正文输入，失焦后自动保存并隐藏。
- 卡片切换：快速记录窗口中使用 `Ctrl + 方向键` 在新卡片和历史卡片之间切换，普通方向键仍保留给输入框光标移动。
- 主界面管理：查看全部灵感卡片，按标题或正文搜索，编辑、保存和删除卡片。
- Markdown 文件存储：每张卡片保存为独立 `.md` 文件，文件头包含 `id`、标题、创建时间和更新时间。
- 可配置存储目录：可在设置页选择 Markdown 卡片保存位置。
- 默认保存路径：首次启动时优先在应用可执行文件所在目录创建 `IdeaCenter`；如果安装目录无写权限，则自动回退到用户目录下的 `.IdeaCard/IdeaCenter`。

## 界面与工作流

IdeaCard 主要包含两个界面：

- 快速记录窗口：透明、无系统边框，适合随手输入。
- 主界面：用于搜索、浏览、编辑和删除已经保存的卡片。

所有卡片都保留为普通 Markdown 文件，因此可以配合同步盘、备份工具、全文搜索工具或其他编辑器使用。

## 技术栈

- Tauri 2：桌面容器、托盘、窗口管理、原生命令和打包。
- React 18：前端界面。
- TypeScript：前端类型检查。
- Vite：前端开发与构建。
- Rust：本地文件读写、设置管理、全局快捷键注册和托盘行为。
- lucide-react：界面图标。

## 项目结构

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

## 本地开发

### 环境要求

- Node.js
- Rust
- Tauri 2 所需系统依赖

### 安装依赖

```bash
npm install
```

### 启动前端开发服务

```bash
npm run dev
```

### 启动 Tauri 开发模式

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

## 数据与设置

应用设置保存在系统应用配置目录的 `settings.json` 中。首次启动时，如果设置文件不存在，应用会生成默认设置并选择卡片保存路径：

1. 尝试在应用可执行文件所在目录创建 `IdeaCenter`。
2. 如果创建失败，回退到用户目录下的 `.IdeaCard/IdeaCenter`。

每张灵感卡片都会保存为所选目录中的独立 Markdown 文件。

## 许可证

MIT
