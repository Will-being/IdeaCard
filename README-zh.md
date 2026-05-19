# IdeaCard

[English](./README.md) | [简体中文](./README-zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

一个托盘优先的 Markdown 灵感卡片桌面应用，让想法在消失之前先被记下来。

IdeaCard 基于 Tauri、React 和 TypeScript 构建。它可以通过系统托盘或全局快捷键打开一个轻量的快速记录卡片；你输入标题和 Markdown 正文后，卡片在真正失焦时自动保存。所有灵感都会保存为普通 `.md` 文件，方便备份、同步、搜索，也可以用其他编辑器继续处理。

## 功能亮点

- **托盘快速记录**：左键点击托盘图标打开快速记录，也可以通过托盘菜单打开主窗口或退出应用。
- **全局快捷键**：默认使用 `Ctrl+Shift+I` 打开快速记录窗口，并可在设置中修改。
- **移动不丢草稿**：拖动快速记录窗口时不会清空已输入内容；只有卡片真正失焦后才会保存。
- **Markdown 文件优先**：每张卡片保存为独立 Markdown 文件，文件头包含 `id`、标题、创建时间和更新时间。
- **卡片切换**：在快速记录窗口中使用 `Ctrl + 方向键` 在新卡片和历史卡片之间切换，普通方向键仍保留给输入框移动光标。
- **主窗口管理**：浏览全部卡片，按标题或正文搜索，编辑、保存和删除卡片。
- **可配置存储目录**：可在设置页面选择 Markdown 卡片的保存位置。
- **合理的默认路径**：首次启动时优先在应用可执行文件旁创建 `IdeaCenter`，如果没有写入权限则回退到用户目录下的 `.IdeaCard/IdeaCenter`。

## 工作流

IdeaCard 主要包含两个界面：

- **快速记录窗口**：透明、无系统边框的小卡片，适合随手输入想法。
- **主窗口**：用于搜索、浏览、编辑和删除已保存卡片。

应用刻意保持文件友好。所有卡片都会保留为普通 Markdown 文件，因此可以配合同步盘、备份工具、全文搜索工具或其他编辑器使用。

## 快速开始

### 环境要求

- Node.js
- Rust
- Tauri 2 所需的系统依赖

### 安装依赖

```bash
npm install
```

### 本地开发

仅启动前端开发服务：

```bash
npm run dev
```

启动 Tauri 桌面应用：

```bash
npm run tauri:dev
```

### 构建

构建前端：

```bash
npm run build
```

构建桌面安装包：

```bash
npm run tauri:build
```

## 数据与设置

应用设置保存在系统应用配置目录中的 `settings.json`。

首次启动时，IdeaCard 会按以下顺序选择默认存储目录：

1. 应用可执行文件所在目录旁的 `IdeaCenter`。
2. 如果安装目录不可写，则使用用户目录下的 `.IdeaCard/IdeaCenter`。

每张灵感卡片都会保存为所选目录中的独立 `.md` 文件。

## 技术栈

- Tauri 2：桌面外壳、托盘集成、窗口管理、原生命令和打包。
- React 18 与 TypeScript：前端界面与类型检查。
- Vite：本地开发与生产构建。
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

## 当前限制

- 仓库暂未提供预构建安装包；如需本地打包，请运行 `npm run tauri:build`。
- IdeaCard 使用本地 Markdown 文件存储，目前不内置云同步。
- 快速记录快捷键解析器目前支持常见的“修饰键 + 字母/数字”组合。

## 参与贡献

小而聚焦的改动最容易审阅。提交变更前建议先运行相关构建或验证命令：

```bash
npm run build
```

## 许可证

MIT License。详见 [LICENSE](./LICENSE)。
