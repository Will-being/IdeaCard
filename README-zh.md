<p align="center">
  <img src="public/icon.png" alt="IdeaCard" width="96" height="96">
</p>

<h1 align="center">IdeaCard</h1>

<p align="center">
  一款从系统托盘快速唤起、把灵感保存为本地 Markdown 卡片的桌面笔记工具。
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

## 这是什么

IdeaCard 面向那些“不值得打开完整笔记软件、但又不想丢掉”的短暂想法。它提供一个可从系统托盘或全局快捷键唤起的快速记录卡片，也提供一个主窗口用于后续搜索、编辑和整理。

它采用本地优先的存储方式：每张卡片都会保存为独立的 `.md` 文件，并在 front matter 中写入 JSON 元数据。你的内容不会被锁在数据库里，也可以用已有工具备份、同步或继续编辑。

## 功能

- 以系统托盘为入口，包含快速记录窗口和独立的主窗口。
- 默认全局快捷键：`Ctrl+Shift+I`。
- 快速记录支持标题、Markdown 正文、无边框可拖动窗口，以及失焦后保存。
- 使用 `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown` 在空白记录卡和已保存卡片之间切换。
- 主窗口按最近更新时间排序，支持标题/正文搜索、刷新、编辑和删除。
- 在主窗口编辑弹窗中输入时自动保存。
- 可在设置中修改存储目录和全局快捷键。
- 每张卡片保存为本地 Markdown 文件，并带有 `id`、`title`、`created_at`、`updated_at` 元数据。

## Markdown 支持

编辑器支持一组适合日常灵感记录的 Markdown 能力：

- 段落和标题。
- 加粗、斜体、行内代码、Markdown 链接，以及裸写的 `http`、`https` 或 `www` URL。
- 对渲染后的链接使用 `Ctrl + 点击` 会在系统浏览器中打开。
- 有序列表、无序列表，以及可点击复选框的待办列表。
- 引用块、代码块、水平分割线和表格。
- 评论块会保存为 `> [!comment]`。
- 输入 `@` 可打开插入菜单，插入评论、表格、引用、代码、待办列表、无序列表、有序列表和分割线。
- 支持块级工具栏，用于删除支持的内容块。
- 快速记录窗口和主窗口编辑器都支持长内容正常滚动。

## 存储位置

- 首次启动时，IdeaCard 会尝试在可执行文件旁创建 `IdeaCenter`。
- 如果该位置不可写，则回退到用户主目录下的 `.IdeaCard/IdeaCenter`。
- 设置保存在系统应用配置目录中。
- 你可以在设置中选择其他存储目录。

## 快速开始

### 环境要求

- Node.js
- Rust
- 当前操作系统所需的 Tauri 2 系统依赖

### 安装依赖

```bash
npm install
```

### 开发运行

只启动前端开发服务：

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

## 技术栈

- Tauri 2：桌面外壳、托盘菜单、原生窗口、文件访问、打包和全局快捷键。
- React 18 与 TypeScript：界面与类型检查。
- Vite：开发服务和前端构建。
- Rust：存储、设置、托盘行为和原生命令。
- lucide-react：界面图标。


## 当前限制

- 不内置云同步；如需跨设备同步，可以把存储目录放在自己的同步文件夹中。
- 快捷键解析器目前支持常见的“修饰键 + 字母”或“修饰键 + 数字”组合。
- Markdown 编辑器刻意保持为实用子集，并不覆盖所有 Markdown 扩展。

## 参与贡献

修改范围尽量小而集中，便于审阅。提交前请运行：

```bash
npm run build
```

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
