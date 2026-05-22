# IdeaCard

[English](./README.md) | [简体中文](./README-zh.md)

IdeaCard 是一款以系统托盘为入口的桌面灵感卡片工具。它适合快速捕捉一闪而过的想法，用 Markdown 书写，并把内容保存为本地文件，方便搜索、编辑、备份或同步。

## 为什么使用 IdeaCard

很多想法出现时，并不适合立刻打开完整的笔记软件。IdeaCard 提供一个轻量的快速记录卡片，用托盘或快捷键随时唤起；之后再到主窗口里整理、搜索和继续编辑。

IdeaCard 采用本地优先的存储方式：每条灵感都是独立 Markdown 文件，而不是被锁在数据库里。

## 功能

### 快速记录

- 通过托盘图标或全局快捷键打开快速记录卡片。
- 默认快捷键：`Ctrl+Shift+I`。
- 在小卡片里编辑标题和 Markdown 正文。
- 拖动快速记录卡片时不会丢失草稿。
- 只有快速记录卡片真正失焦后才会自动保存。
- 使用 `Ctrl + ArrowLeft/ArrowRight/ArrowUp/ArrowDown` 在空白新卡片和已保存卡片之间切换。
- 快速记录底部会显示当前卡片位置和最近更新时间。

### 主窗口

- 从托盘菜单或快速记录入口打开主窗口。
- 浏览全部已保存灵感卡片，按最近更新时间排序。
- 按标题或正文内容搜索。
- 在弹窗编辑器中打开卡片。
- 主窗口编辑时自动保存。
- 删除已有卡片。
- 从磁盘刷新卡片列表。

### Markdown 编辑器

编辑器支持常用 Markdown，并提供插入菜单来快速创建结构化内容。

- 段落和标题。
- 加粗、斜体、行内代码、Markdown 链接，以及裸写的 `http`、`https` 或 `www` URL。
- 对渲染后的链接使用 `Ctrl + 点击` 会在系统浏览器中打开。
- 有序列表和无序列表。
- 待办列表，复选框可直接点击。
- 已完成的待办项会显示删除线。
- 空列表项会先保留序号或项目符号，再次按删除/退格才移除标记。
- 引用块。
- 代码块。
- 水平分割线。
- 表格。
- 评论块，保存为 `> [!comment]` 格式。
- 输入 `@` 可打开插入菜单，快速插入评论、表格、引用、代码、待办列表、无序列表、有序列表和分割线。
- 支持块级工具栏，用于删除支持的内容块。
- 快速记录和主窗口编辑器都支持长内容正常滚动。

### 本地文件与设置

- 每条灵感保存为独立 `.md` 文件。
- 文件头中包含 `id`、`title`、`created_at` 和 `updated_at` JSON 元数据。
- 可在设置中选择灵感卡片存储目录。
- 设置保存在系统应用配置目录。
- 首次启动时，IdeaCard 会优先使用可执行文件旁的 `IdeaCenter`。
- 如果该位置不可写，则回退到用户主目录下的 `.IdeaCard/IdeaCenter`。
- 可在设置中修改全局快捷键。

## 文件格式

IdeaCard 写出的卡片大致如下：

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

正文部分仍然是普通 Markdown，因此也可以用其他编辑器继续处理。

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

## 技术栈

- Tauri 2：桌面外壳、托盘菜单、原生窗口、文件访问、打包和全局快捷键。
- React 18 与 TypeScript：界面与类型检查。
- Vite：开发服务和前端构建。
- Rust：存储、设置、托盘行为和原生命令。
- lucide-react：界面图标。

## 项目结构

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
`-- README-zh.md
```

## 当前限制

- 不内置云同步；如果需要跨设备同步，可以把存储目录放在你自己的同步盘中。
- 仓库中暂未发布预构建安装包；可使用 `npm run tauri:build` 本地构建。
- 快捷键解析器目前支持常见的“修饰键 + 字母”或“修饰键 + 数字”组合。
- Markdown 编辑器刻意保持为常用子集，并不覆盖所有 Markdown 扩展。

## 参与贡献

修改范围尽量小而集中，便于审阅。提交前请运行：

```bash
npm run build
```

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
