import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog, open } from "@tauri-apps/plugin-dialog";
import {
  Code2,
  Eraser,
  FolderOpen,
  Grid2X2,
  GripHorizontal,
  List,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Minus,
  Plus,
  Quote,
  Search,
  Settings,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  Dispatch,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

type AppSettings = {
  storage_dir: string;
  quick_open_shortcut: string;
  auto_read_clipboard: boolean;
};

type QuickWindowOpenedPayload = {
  source: "shortcut" | "manual" | string;
};

type StorageMigrationResult = {
  settings: AppSettings;
  moved_count: number;
  old_dir_removed: boolean;
};

type IdeaCard = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type Draft = {
  id?: string;
  title: string;
  body: string;
};

type Section = "ideas" | "settings";
type Unlisten = () => void;
type MarkdownInsertOption = {
  id: string;
  label: string;
  description: string;
  icon: typeof MessageSquare;
};
type MarkdownBlockElement = HTMLElement & {
  dataset: HTMLElement["dataset"] & {
    mdBlock?: string;
    mdType?: string;
  };
};

const emptyDraft: Draft = {
  title: "",
  body: "",
};

const initialMode = new URLSearchParams(window.location.search).get("view") === "main" ? "main" : "quick";
const closeAnimationMs = 90;
const cardNavigationKeys = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]);
const commentCalloutMarker = "> [!comment]";
const urlPattern = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?])/g;
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const visibleMarkdownInsertOptions: MarkdownInsertOption[] = [
  {
    id: "comment",
    label: "评论",
    description: "灰底评论块",
    icon: MessageSquare,
  },
  {
    id: "table",
    label: "表格",
    description: "三列表格",
    icon: Table2,
  },
  {
    id: "quote",
    label: "引用",
    description: "引用块",
    icon: Quote,
  },
  {
    id: "code",
    label: "代码",
    description: "代码块",
    icon: Code2,
  },
  {
    id: "task-list",
    label: "待办",
    description: "可勾选任务",
    icon: ListChecks,
  },
  {
    id: "unordered-list",
    label: "列表",
    description: "无序列表",
    icon: List,
  },
  {
    id: "ordered-list",
    label: "编号",
    description: "有序列表",
    icon: ListOrdered,
  },
  {
    id: "divider",
    label: "分割线",
    description: "水平分割线",
    icon: Minus,
  },
];
const formatDate = (value: string) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "刚刚";
  return dateTimeFormatter.format(new Date(timestamp));
};

const formatEndTimeForName = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const getPreview = (body: string) => {
  const text = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^>\s*\[!comment\]\s*$/gim, "评论:")
    .replace(/[#>*_`[\]()~-]/g, "")
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim();
      return trimmed ? [trimmed] : [];
    })
    .join(" ");
  return text || "还没有内容";
};

const hasDraftContent = (draft: Draft) => Boolean(draft.title.trim() || draft.body.trim());

const normalizeClipboardText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

const stripEndTimeSuffix = (title: string) => title.replace(/-\d{8}-\d{6}$/, "");

const isQuickCaptureNavigationShortcut = (event: ReactKeyboardEvent<HTMLElement>) =>
  event.ctrlKey && !event.altKey && !event.metaKey && cardNavigationKeys.has(event.key);

const getNavigationDirection = (key: string): 1 | -1 =>
  key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;

const draftFromIdea = (idea: IdeaCard): Draft => ({
  id: idea.id,
  title: stripEndTimeSuffix(idea.title),
  body: idea.body,
});

const draftsMatch = (left: Draft, right: Draft) =>
  (left.id ?? "") === (right.id ?? "") && left.title === right.title && left.body === right.body;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeAttribute = (value: string) => escapeHtml(value).replace(/'/g, "&#39;");

const normalizeMarkdownLine = (value: string) => value.replace(/\u00a0/g, " ").trim();
const normalizeMarkdownBlock = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeCodeBlock = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/^\n+|\n+$/g, "");

const isTableDivider = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isMarkdownBlockStart = (line: string) => {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^>\s*/.test(trimmed) ||
    /^([-*+]\s+|\d+\.\s+)/.test(trimmed) ||
    /^-\s+\[[ xX]\]\s+/.test(trimmed) ||
    /^-{3,}$/.test(trimmed)
  );
};

const splitTableRow = (line: string) => {
  const content = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\\" && next === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim().replace(/<br\s*\/?>/gi, "\n"));
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim().replace(/<br\s*\/?>/gi, "\n"));
  return cells;
};

const renderInlineMarkdown = (value: string, preserveLineBreaks = false) => {
  let html = escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, "\n");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<a data-md-link="true" href="$2">$1</a>');
  html = html.replace(urlPattern, (_match, prefix: string, rawUrl: string) => {
    const href = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl;
    return `${prefix}<a data-md-link="true" href="${escapeAttribute(href)}">${rawUrl}</a>`;
  });
  if (preserveLineBreaks) html = html.replace(/\n/g, "<br>");
  return html;
};

const paragraphHtml = (text: string) =>
  text.trim() ? `<p>${renderInlineMarkdown(text, true)}</p>` : "<p><br></p>";

const markdownToHtml = (value: string) => {
  if (!value.trim()) return "";

  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre data-md-block="true" data-md-type="code" data-placeholder="代码"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (trimmed.toLowerCase() === commentCalloutMarker) {
      const commentLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].startsWith(">")) {
        commentLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(
        `<div class="markdown-render-comment" data-md-block="true" data-md-type="comment" data-placeholder="写下你的评论">${paragraphHtml(commentLines.join("\n"))}</div>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      const headerCells = splitTableRow(line);
      const bodyRows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        bodyRows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(
        `<table data-md-block="true"><thead><tr>${headerCells.map((cell) => `<th>${renderInlineMarkdown(cell, true)}</th>`).join("")}</tr></thead><tbody>${bodyRows
          .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell, true)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }

    if (/^-\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+\[[ xX]\]\s+/.test(lines[index].trim())) {
        const checked = /^-\s+\[[xX]\]\s+/.test(lines[index].trim());
        const text = lines[index].trim().replace(/^-\s+\[[ xX]\]\s+/, "");
        items.push(`<li data-md-task="${checked ? "checked" : "open"}"><input data-md-control="true" contenteditable="false" type="checkbox" ${checked ? "checked" : ""} tabindex="-1"><span data-md-task-text="true">${renderInlineMarkdown(text, true)}</span></li>`);
        index += 1;
      }
      html.push(`<ul data-md-block="true" data-md-type="task-list">${items.join("")}</ul>`);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[index].trim().replace(/^[-*+]\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${paragraphHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length && !isMarkdownBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    html.push(paragraphHtml(paragraphLines.join("\n")));
  }

  return html.join("");
};

const multilineElementTags = new Set(["p", "div"]);

const serializeInlineNode = (
  node: Node,
  options: { preserveBlocks?: boolean; literalCode?: boolean } = {},
): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.getAttribute("data-md-control")) return "";

  const tagName = node.tagName.toLowerCase();
  const content = serializeChildNodes(node, options);
  switch (node.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return `**${content}**`;
    case "em":
    case "i":
      return `*${content}*`;
    case "code":
      return options.literalCode ? content : `\`${content}\``;
    case "a":
      return `[${content}](${node.getAttribute("href") ?? ""})`;
    case "br":
      return "\n";
    default:
      if (options.preserveBlocks && multilineElementTags.has(tagName)) {
        return `${content.replace(/\n+$/g, "")}\n`;
      }
      return content;
  }
};

const serializeChildNodes = (
  element: Element,
  options: { preserveBlocks?: boolean; literalCode?: boolean } = {},
) =>
  Array.from(element.childNodes).reduce((result, child) => {
    if (
      options.preserveBlocks &&
      child instanceof HTMLElement &&
      multilineElementTags.has(child.tagName.toLowerCase()) &&
      result &&
      !result.endsWith("\n")
    ) {
      return `${result}\n${serializeInlineNode(child, options)}`;
    }
    return result + serializeInlineNode(child, options);
  }, "");

const serializeInlineElement = (element: Element) =>
  normalizeMarkdownLine(serializeChildNodes(element));

const serializeMultilineElement = (
  element: Element,
  options: { literalCode?: boolean } = {},
) => normalizeMarkdownBlock(serializeChildNodes(element, { preserveBlocks: true, ...options }));

const serializeCodeElement = (element: Element) =>
  normalizeCodeBlock(serializeChildNodes(element, { preserveBlocks: true, literalCode: true }));

const serializeTableCell = (element: Element) =>
  serializeMultilineElement(element)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");

const serializeEditableMarkdown = (root: HTMLElement) => {
  const blocks: string[] = [];

  Array.from(root.children).forEach((element) => {
    const tag = element.tagName.toLowerCase();
    const text = serializeInlineElement(element);

    if (element.getAttribute("data-md-type") === "comment") {
      const commentText = serializeMultilineElement(element);
      if (!commentText) return;
      blocks.push(`${commentCalloutMarker}\n${commentText.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}`);
      return;
    }

    if (tag.match(/^h[1-6]$/)) {
      blocks.push(`${"#".repeat(Number(tag[1]))} ${text}`);
      return;
    }

    if (tag === "blockquote") {
      const quoteText = serializeMultilineElement(element);
      if (!quoteText) return;
      blocks.push(quoteText.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
      return;
    }

    if (tag === "pre") {
      const codeText = serializeCodeElement(element);
      if (!codeText.trim()) return;
      blocks.push(`\`\`\`\n${codeText}\n\`\`\``);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const taskList = element.getAttribute("data-md-type") === "task-list";
      const items = Array.from(element.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((child, index) => {
          const taskTextElement = taskList
            ? child.querySelector<HTMLElement>("[data-md-task-text='true']")
            : null;
          const itemText = serializeInlineElement(taskTextElement ?? child)
            .replace(/^\s*/, "")
            .replace(/^[-*+]\s+/, "")
            .replace(/^\d+\.\s+/, "")
            .replace(/^\[[ xX]\]\s+/, "");
          if (!itemText) return "";
          if (taskList) {
            const checkbox = child.querySelector<HTMLInputElement>("input[type='checkbox']");
            const checked = child.getAttribute("data-md-task") === "checked" || checkbox?.checked;
            return `- [${checked ? "x" : " "}] ${itemText}`;
          }
          return tag === "ol" ? `${index + 1}. ${itemText}` : `- ${itemText}`;
        })
        .filter(Boolean);
      if (!items.length) return;
      blocks.push(items.join("\n"));
      return;
    }

    if (tag === "table") {
      const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
        Array.from(row.children).map((cell) => serializeTableCell(cell)),
      );
      const header = rows[0] ?? [];
      const body = rows.slice(1);
      const hasTableContent = rows.flat().some((cell) => cell.trim());
      if (!hasTableContent) return;
      blocks.push(
        [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n"),
      );
      return;
    }

    if (tag === "hr") {
      blocks.push("---");
      return;
    }

    if (text) {
      blocks.push(text);
    }
  });

  return blocks.join("\n\n");
};

const getCaretOffset = (root: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.textContent?.length ?? 0;

  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(root);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return beforeRange.toString().length;
};

const setCaretOffset = (root: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let current = walker.nextNode();

  while (current) {
    const length = current.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(current, Math.max(0, remaining));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    current = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const getClosestMarkdownBlock = (node: Node | null, root: HTMLElement | null) => {
  if (!node || !root) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const block = element?.closest<MarkdownBlockElement>("[data-md-block='true']");
  return block && root.contains(block) ? block : null;
};

const editableTailTags = new Set(["blockquote", "hr", "ol", "pre", "table", "ul"]);

const isPlainEditableParagraph = (element: Element | null) =>
  element?.tagName.toLowerCase() === "p" && !element.getAttribute("data-md-block");

const needsEditableTail = (editor: HTMLElement) => {
  const last = editor.lastElementChild;
  if (!last || !normalizeMarkdownLine(editor.textContent ?? "")) return false;
  const tag = last.tagName.toLowerCase();
  return last.getAttribute("data-md-block") === "true" || editableTailTags.has(tag);
};

const ensureEditableTail = (editor: HTMLElement) => {
  if (!needsEditableTail(editor)) return null;
  const last = editor.lastElementChild;
  if (isPlainEditableParagraph(last) && last?.getAttribute("data-md-tail") === "true") return last as HTMLParagraphElement;

  const tail = document.createElement("p");
  tail.dataset.mdTail = "true";
  tail.innerHTML = "<br>";
  editor.appendChild(tail);
  return tail;
};

const placeCaretInElement = (element: HTMLElement, collapseToEnd = false) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(!collapseToEnd);
  selection.removeAllRanges();
  selection.addRange(range);
};

const placeCaretInListItem = (item: HTMLLIElement, collapseToEnd = false) => {
  const selection = window.getSelection();
  if (!selection) return;

  const taskText = item.querySelector<HTMLElement>("[data-md-task-text='true']");
  const range = document.createRange();

  if (taskText) {
    if (!taskText.childNodes.length) {
      taskText.appendChild(document.createElement("br"));
    }
    range.selectNodeContents(taskText);
    range.collapse(!collapseToEnd);
  } else {
    range.selectNodeContents(item);
    range.collapse(!collapseToEnd);
  }

  selection.removeAllRanges();
  selection.addRange(range);
};

const syncTaskCheckboxState = (checkbox: HTMLInputElement, checked: boolean) => {
  checkbox.checked = checked;
  checkbox.toggleAttribute("checked", checked);
  const item = checkbox.closest<HTMLLIElement>("li");
  if (item) {
    item.dataset.mdTask = checked ? "checked" : "open";
  }
  return item;
};

const refocusListItem = (item: HTMLLIElement) => {
  window.setTimeout(() => {
    if (!item.isConnected) return;
    placeCaretInListItem(item);
  }, 0);
};

const getClosestListItem = (node: Node | null, root: HTMLElement | null) => {
  if (!node || !root) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const item = element?.closest<HTMLLIElement>("li");
  return item && root.contains(item) ? item : null;
};

const getClosestList = (node: Node | null, root: HTMLElement | null) => {
  const item = getClosestListItem(node, root);
  const list = item?.parentElement;
  return list && (list.tagName.toLowerCase() === "ul" || list.tagName.toLowerCase() === "ol") ? list : null;
};

const normalizeListItemText = (item: HTMLLIElement) =>
  normalizeMarkdownLine(serializeInlineElement(item))
    .replace(/^\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");

const removeListItemMarker = (item: HTMLLIElement, list: HTMLElement) => {
  const paragraph = document.createElement("p");
  paragraph.innerHTML = "<br>";

  if (list.children.length <= 1) {
    list.replaceWith(paragraph);
    placeCaretInElement(paragraph);
    return;
  }

  const followingItems: HTMLLIElement[] = [];
  let sibling = item.nextElementSibling;
  while (sibling) {
    const nextSibling = sibling.nextElementSibling;
    if (sibling instanceof HTMLLIElement) {
      followingItems.push(sibling);
    }
    sibling = nextSibling;
  }

  item.remove();

  if (!list.children.length) {
    list.replaceWith(paragraph);
  } else {
    list.after(paragraph);
  }

  if (followingItems.length) {
    const nextList = document.createElement(list.tagName.toLowerCase());
    Array.from(list.attributes).forEach((attribute) => {
      nextList.setAttribute(attribute.name, attribute.value);
    });
    followingItems.forEach((followingItem) => nextList.appendChild(followingItem));
    paragraph.after(nextList);
  }

  placeCaretInElement(paragraph);
};

type AppState = {
  settings: AppSettings | null;
  ideas: IdeaCard[];
  draft: Draft;
  query: string;
  section: Section;
  status: string;
};

type AppAction =
  | { type: "loadSuccess"; settings: AppSettings; ideas: IdeaCard[] }
  | { type: "setSettings"; value: SetStateAction<AppSettings | null> }
  | { type: "setDraft"; value: SetStateAction<Draft> }
  | { type: "setQuery"; value: string }
  | { type: "setSection"; value: Section }
  | { type: "setStatus"; value: string };

const initialAppState: AppState = {
  settings: null,
  ideas: [],
  draft: emptyDraft,
  query: "",
  section: "ideas",
  status: "已同步",
};

function resolveStateAction<T>(value: SetStateAction<T>, current: T) {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "loadSuccess":
      return {
        ...state,
        settings: action.settings,
        ideas: action.ideas,
      };
    case "setSettings":
      return {
        ...state,
        settings: resolveStateAction(action.value, state.settings),
      };
    case "setDraft":
      return {
        ...state,
        draft: resolveStateAction(action.value, state.draft),
      };
    case "setQuery":
      return {
        ...state,
        query: action.value,
      };
    case "setSection":
      return {
        ...state,
        section: action.value,
      };
    case "setStatus":
      return {
        ...state,
        status: action.value,
      };
    default:
      return state;
  }
}

function cleanupSubscription(subscription: Promise<Unlisten>, onError?: (error: unknown) => void) {
  let disposed = false;
  let unlisten: Unlisten | undefined;

  void subscription
    .then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    })
    .catch((error) => {
      if (!disposed) onError?.(error);
    });

  return () => {
    disposed = true;
    unlisten?.();
    unlisten = undefined;
  };
}

function MarkdownBodyEditor({
  className,
  placeholder,
  value,
  onChange,
}: {
  className: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<MarkdownBlockElement | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const editingRef = useRef(false);
  const handledCheckboxMouseDownRef = useRef(false);
  const valueRef = useRef(value);

  const renderedHtml = useMemo(() => markdownToHtml(value), [value]);
  const isEmpty = !value.trim();

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editingRef.current && document.activeElement === editorRef.current) return;
    const nextHtml = renderedHtml;
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
    ensureEditableTail(editorRef.current);
  }, [renderedHtml]);

  useEffect(() => {
    if (!menuOpen) return;
    const activeButton = menuRef.current?.querySelector<HTMLButtonElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    activeButton?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, menuOpen]);

  const updateSelectedBlock = useCallback(() => {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode ?? document.activeElement;
    setSelectedBlock(getClosestMarkdownBlock(anchorNode, editorRef.current));
  }, []);

  const keepCaretVisible = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    if (!editorRect.width && !editorRect.height) return;

    const margin = 24;
    if (rect.bottom > editorRect.bottom - margin) {
      editor.scrollTop += rect.bottom - editorRect.bottom + margin;
    } else if (rect.top < editorRect.top + margin) {
      editor.scrollTop = Math.max(0, editor.scrollTop - (editorRect.top + margin - rect.top));
    }
  }, []);

  const scrollEditorToEnd = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollTop = editor.scrollHeight;
  }, []);

  const syncFromEditor = useCallback(() => {
    if (!editorRef.current || isComposingRef.current) return;
    const caretOffset = getCaretOffset(editorRef.current);
    const nextValue = serializeEditableMarkdown(editorRef.current).replace(/\n{3,}/g, "\n\n").trimEnd();
    if (nextValue !== value) {
      editingRef.current = true;
      valueRef.current = nextValue;
      onChange(nextValue);
      setCaretOffset(editorRef.current, caretOffset);
    }
    ensureEditableTail(editorRef.current);
    keepCaretVisible();
    updateSelectedBlock();
  }, [keepCaretVisible, onChange, updateSelectedBlock, value]);

  const insertListItemAfter = useCallback((item: HTMLLIElement) => {
    const list = item.parentElement;
    if (!list) return;
    const nextItem = document.createElement("li");
    if (list.getAttribute("data-md-type") === "task-list") {
      nextItem.dataset.mdTask = "open";
      nextItem.innerHTML = '<input data-md-control="true" contenteditable="false" type="checkbox" tabindex="-1" /><span data-md-task-text="true"><br></span>';
    } else {
      nextItem.innerHTML = "<br>";
    }
    item.after(nextItem);
    placeCaretInListItem(nextItem);
    syncFromEditor();
    refocusListItem(nextItem);
  }, [syncFromEditor]);

  const deleteBlock = useCallback((block: MarkdownBlockElement | null = selectedBlock) => {
    if (!block || !editorRef.current) return;
    const nextFocus = document.createElement("p");
    nextFocus.innerHTML = "<br>";
    block.replaceWith(nextFocus);
    setSelectedBlock(null);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(nextFocus);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    syncFromEditor();
  }, [selectedBlock, syncFromEditor]);
  const createInsertedHtml = useCallback((option: MarkdownInsertOption) => {
    switch (option.id) {
      case "comment":
        return '<div class="markdown-render-comment" data-md-block="true" data-md-type="comment" data-placeholder="写下你的评论"><p><br></p></div>';
      case "table":
        return '<table data-md-block="true" data-md-type="table"><thead><tr><th>列 1</th><th>列 2</th><th>列 3</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>';
      case "quote":
        return '<blockquote data-placeholder="引用内容"><p><br></p></blockquote>';
      case "code":
        return '<pre data-md-block="true" data-md-type="code" data-placeholder="代码"><code><br></code></pre>';
      case "task-list":
        return '<ul data-md-block="true" data-md-type="task-list"><li data-md-task="open" data-placeholder="待办事项"><input data-md-control="true" contenteditable="false" type="checkbox" tabindex="-1" /><span data-md-task-text="true"><br></span></li></ul>';
      case "unordered-list":
        return '<ul><li data-placeholder="列表项"><br></li></ul>';
      case "ordered-list":
        return '<ol><li data-placeholder="列表项"><br></li></ol>';
      case "divider":
        return "<hr />";
      default:
        return "<p><br></p>";
    }
  }, []);
  const insertOption = useCallback(
    (option: MarkdownInsertOption) => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;

      editor.focus();
      const range = selection.getRangeAt(0);
      range.deleteContents();

      const template = document.createElement("template");
      template.innerHTML = createInsertedHtml(option);
      const fragment = template.content;
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);

      let listFocusTarget: HTMLLIElement | null = null;

      if (lastNode) {
        const insertedElement = lastNode instanceof HTMLElement ? lastNode : lastNode.parentElement;
        const trailingParagraph = document.createElement("p");
        trailingParagraph.dataset.mdTail = "true";
        trailingParagraph.innerHTML = "<br>";
        const focusSelectorByType: Record<string, string> = {
          code: "code",
          comment: "p",
          "ordered-list": "li",
          quote: "p",
          table: "td",
          "task-list": "li",
          "unordered-list": "li",
        };
        const focusSelector = focusSelectorByType[option.id];
        const focusTarget =
          (focusSelector ? insertedElement?.querySelector<HTMLElement>(focusSelector) : null) ??
          insertedElement ??
          trailingParagraph;
        lastNode.parentNode?.insertBefore(trailingParagraph, lastNode.nextSibling);
        if (focusTarget instanceof HTMLLIElement) {
          listFocusTarget = focusTarget;
          placeCaretInListItem(focusTarget);
        } else {
          placeCaretInElement(focusTarget ?? trailingParagraph);
        }
      }

      setMenuOpen(false);
      setActiveIndex(0);
      syncFromEditor();
      window.setTimeout(() => {
        if (listFocusTarget?.isConnected) {
          placeCaretInListItem(listFocusTarget);
        }
        keepCaretVisible();
        scrollEditorToEnd();
      }, 0);
    },
    [createInsertedHtml, keepCaretVisible, scrollEditorToEnd, syncFromEditor],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      const activeList = getClosestList(selection?.anchorNode ?? null, editor);
      const activeListItem = getClosestListItem(selection?.anchorNode ?? null, editor);

      if ((event.key === "Backspace" || event.key === "Delete") && selectedBlock) {
        const blockText = normalizeMarkdownLine(selectedBlock.textContent ?? "");
        if (!blockText) {
          event.preventDefault();
          deleteBlock(selectedBlock);
          return;
        }
      }

      if (!menuOpen && (event.key === "Backspace" || event.key === "Delete") && activeList && activeListItem) {
        if (!normalizeListItemText(activeListItem)) {
          event.preventDefault();
          removeListItemMarker(activeListItem, activeList);
          syncFromEditor();
          return;
        }
      }

      if (!menuOpen && event.key === "Enter" && activeList && activeListItem) {
        event.preventDefault();
        if (!normalizeListItemText(activeListItem)) {
          removeListItemMarker(activeListItem, activeList);
          syncFromEditor();
          return;
        }
        insertListItemAfter(activeListItem);
        return;
      }

      if (!menuOpen && event.key === "Tab" && activeListItem) {
        event.preventDefault();
        return;
      }

      if (!menuOpen) {
        if (event.key === "@" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          setMenuOpen(true);
          setActiveIndex(0);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + direction + visibleMarkdownInsertOptions.length) % visibleMarkdownInsertOptions.length);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertOption(visibleMarkdownInsertOptions[activeIndex]);
      }
    },
    [activeIndex, deleteBlock, insertListItemAfter, insertOption, menuOpen, selectedBlock, syncFromEditor],
  );

  const handlePaste = useCallback((event: ReactClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncFromEditor();
  }, [syncFromEditor]);

  const handleClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const checkbox = (event.target as Element).closest<HTMLInputElement>("input[type='checkbox'][data-md-control='true']");
    if (checkbox && editorRef.current?.contains(checkbox)) {
      event.preventDefault();
      event.stopPropagation();
      if (handledCheckboxMouseDownRef.current) {
        handledCheckboxMouseDownRef.current = false;
        return;
      }

      const item = syncTaskCheckboxState(checkbox, !checkbox.checked);
      if (item) {
        placeCaretInListItem(item, true);
      }
      syncFromEditor();
      updateSelectedBlock();
      window.requestAnimationFrame(() => {
        if (item?.isConnected) {
          editorRef.current?.focus();
          placeCaretInListItem(item, true);
        }
      });
      return;
    }

    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-md-link='true']");
    if (link && event.ctrlKey) {
      event.preventDefault();
      void invoke("open_url", { url: link.href });
      return;
    }
    updateSelectedBlock();
  }, [syncFromEditor, updateSelectedBlock]);

  const handleFocus = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!valueRef.current.trim() && !normalizeMarkdownLine(editor.textContent ?? "")) {
      editor.innerHTML = "";
      placeCaretInElement(editor);
      return;
    }
    ensureEditableTail(editor);
  }, []);

  const handleMouseDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const checkbox = (event.target as Element).closest<HTMLInputElement>("input[type='checkbox'][data-md-control='true']");
    if (checkbox && editorRef.current?.contains(checkbox)) {
      event.preventDefault();
      event.stopPropagation();
      handledCheckboxMouseDownRef.current = true;

      const item = syncTaskCheckboxState(checkbox, !checkbox.checked);
      if (item) {
        editorRef.current.focus();
        placeCaretInListItem(item, true);
      }
      syncFromEditor();
      updateSelectedBlock();
      window.requestAnimationFrame(() => {
        if (item?.isConnected) {
          editorRef.current?.focus();
          placeCaretInListItem(item, true);
        }
      });
      return;
    }

    if (event.target !== event.currentTarget) return;
    const editor = editorRef.current;
    if (!editor) return;
    const tail = ensureEditableTail(editor);
    if (!tail) return;
    window.setTimeout(() => {
      placeCaretInElement(tail);
      updateSelectedBlock();
    }, 0);
  }, [syncFromEditor, updateSelectedBlock]);

  const handleInput = (event: ReactFormEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    const inputType = event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : "";
    const selection = window.getSelection();
    const activeListItem = getClosestListItem(selection?.anchorNode ?? null, editor);
    const shouldRefocusEmptyListItem =
      inputType.startsWith("delete") &&
      activeListItem?.isConnected &&
      !normalizeListItemText(activeListItem);

    syncFromEditor();
    if (shouldRefocusEmptyListItem) {
      window.setTimeout(() => {
        if (activeListItem.isConnected) {
          editor?.focus();
          placeCaretInListItem(activeListItem);
        }
      }, 0);
    }
    window.requestAnimationFrame(keepCaretVisible);
  };

  return (
    <div className="markdown-editor-shell">
      <div
        aria-label={placeholder}
        className={`${className} markdown-editor-input`}
        contentEditable
        data-empty={isEmpty ? "true" : "false"}
        data-placeholder={placeholder}
        onBlur={() =>
          window.setTimeout(() => {
            setMenuOpen(false);
            editingRef.current = false;
            if (editorRef.current) {
              editorRef.current.innerHTML = markdownToHtml(valueRef.current);
            }
          }, 120)
        }
        onCompositionEnd={() => {
          isComposingRef.current = false;
          syncFromEditor();
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onFocus={handleFocus}
        onClick={handleClick}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onKeyUp={updateSelectedBlock}
        onMouseUp={updateSelectedBlock}
        onPaste={handlePaste}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
      {selectedBlock && (
        <div className="markdown-block-toolbar" contentEditable={false}>
          <button
            className="markdown-block-tool"
            onMouseDown={(event) => {
              event.preventDefault();
              deleteBlock();
            }}
            title="删除内容块"
            type="button"
          >
            <Eraser size={14} />
            删除
          </button>
        </div>
      )}
      {menuOpen && (
        <div className="markdown-insert-menu" ref={menuRef} role="listbox" aria-label="插入 Markdown 内容">
          {visibleMarkdownInsertOptions.map((option, index) => {
            const Icon = option.icon;
            return (
              <button
                className={index === activeIndex ? "markdown-insert-option active" : "markdown-insert-option"}
                data-option-index={index}
                key={option.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertOption(option);
                }}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
              >
                <Icon size={16} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const { settings, ideas, draft, query, section, status } = state;

  const setSettings = useCallback<Dispatch<SetStateAction<AppSettings | null>>>(
    (value) => dispatch({ type: "setSettings", value }),
    [],
  );
  const setDraft = useCallback<Dispatch<SetStateAction<Draft>>>(
    (value) => dispatch({ type: "setDraft", value }),
    [],
  );
  const setQuery = useCallback((value: string) => dispatch({ type: "setQuery", value }), []);
  const setSection = useCallback((value: Section) => dispatch({ type: "setSection", value }), []);
  const setStatus = useCallback((value: string) => dispatch({ type: "setStatus", value }), []);

  const isMain = initialMode === "main";

  const filteredIdeas = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ideas;
    return ideas.filter((idea) =>
      `${idea.title} ${idea.body}`.toLowerCase().includes(needle),
    );
  }, [ideas, query]);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === draft.id) ?? null,
    [draft.id, ideas],
  );

  const load = useCallback(async () => {
    const [loadedSettings, loadedIdeas] = await Promise.all([
      invoke<AppSettings>("load_settings"),
      invoke<IdeaCard[]>("list_ideas"),
    ]);
    dispatch({ type: "loadSuccess", settings: loadedSettings, ideas: loadedIdeas });
    return loadedIdeas;
  }, []);

  useEffect(() => {
    load().catch((error) => setStatus(String(error)));
  }, [load]);

  useEffect(() => {
    if (!isMain) return;

    const appWindow = getCurrentWindow();
    const refresh = () => {
      void load().catch((error) => setStatus(String(error)));
    };
    const cleanupOpened = cleanupSubscription(
      appWindow.listen("main-window-opened", refresh),
      (error) => setStatus(String(error)),
    );
    const cleanupFocus = cleanupSubscription(
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) refresh();
      }),
      (error) => setStatus(String(error)),
    );

    return () => {
      cleanupOpened();
      cleanupFocus();
    };
  }, [isMain, load, setStatus]);

  const editIdea = (idea: IdeaCard) => {
    setDraft({
      ...draftFromIdea(idea),
    });
    setSection("ideas");
  };

  const saveDraft = useCallback(
    async (candidate: Draft) => {
      if (!hasDraftContent(candidate)) return null;
      try {
        const saved = await invoke<IdeaCard>("save_idea", {
          payload: {
            ...candidate,
            ended_at: formatEndTimeForName(new Date()),
          },
        });
        await load();
        setStatus("已保存为 Markdown");
        return saved;
      } catch (error) {
        setStatus(String(error));
        return null;
      }
    },
    [load],
  );

  const deleteIdea = async (id: string) => {
    await invoke("delete_idea", { id });
    if (draft.id === id) setDraft(emptyDraft);
    await load();
    setStatus("已删除");
  };

  const chooseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择灵感卡片存储目录",
      });
      if (typeof selected !== "string" || !settings) return;

      if (selected === settings.storage_dir) {
        setStatus("已选择当前存储目录");
        return;
      }

      const migrateMarkdown = await confirmDialog(
        "是否将原目录下的 Markdown 文件转移到新目录，并删除原目录？",
        {
          title: "迁移 Markdown 文件",
          kind: "warning",
        },
      );
      const next = { ...settings, storage_dir: selected };
      const result = await invoke<StorageMigrationResult>("change_storage_dir", {
        settings: next,
        migrateMarkdown,
      });

      setSettings(result.settings);
      await load();
      if (!migrateMarkdown) {
        setStatus("存储目录已更新");
      } else if (result.old_dir_removed) {
        setStatus(`已迁移 ${result.moved_count} 个 Markdown 文件并删除旧目录`);
      } else {
        setStatus(`已迁移 ${result.moved_count} 个 Markdown 文件；旧目录仍包含其他内容，未删除`);
      }
    } catch (error) {
      setStatus(String(error));
    }
  };

  const saveSettings = async (overrideSettings?: AppSettings) => {
    const target = overrideSettings ?? settings;
    if (!target) return;
    try {
      const saved = await invoke<AppSettings>("update_settings", {
        settings: target,
      });
      setSettings(saved);
      setStatus("设置已更新");
    } catch (error) {
      setStatus(String(error));
    }
  };

  if (!isMain) {
    return (
      <QuickCapture
        draft={draft}
        ideas={ideas}
        reloadIdeas={load}
        saveDraft={saveDraft}
        settings={settings}
        setDraft={setDraft}
      />
    );
  }

  return (
    <main className="main-shell">
      <aside className="main-sidebar">
        <div className="main-brand">
          <span className="brand-mark" />
          <div>
            <strong>IdeaCard</strong>
            <small>{ideas.length} 张灵感卡片</small>
          </div>
        </div>

        <button
          className={section === "ideas" ? "side-button active" : "side-button"}
          onClick={() => setSection("ideas")}
          type="button"
        >
          <Grid2X2 size={17} />
          灵感卡片
        </button>
        <button
          className={section === "settings" ? "side-button active" : "side-button"}
          onClick={() => setSection("settings")}
          type="button"
        >
          <Settings size={17} />
          设置
        </button>
        <div className="sidebar-footer">
          <span>{status}</span>
        </div>
      </aside>

      <section className="main-content">
        {section === "ideas" ? (
          <>
            <header className="main-header">
              <div>
                <h1>灵感卡片</h1>
                <p>把快速记录中的想法整理成可编辑的 Markdown 卡片。</p>
              </div>
              <button className="primary-button" onClick={() => invoke("open_quick_window")} type="button">
                <Plus size={16} />
                快速记录
              </button>
            </header>

            <div className="main-toolbar">
              <div className="search-row main-search">
                <Search size={16} />
                <input
                  placeholder="搜索标题或内容"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button className="clear-search" onClick={() => setQuery("")} type="button">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button className="ghost-button" onClick={load} type="button">
                刷新
              </button>
            </div>

            <IdeaGrid
              ideas={filteredIdeas}
              selectedId={draft.id}
              onEdit={editIdea}
              onDelete={(id) => deleteIdea(id).catch((error) => setStatus(String(error)))}
            />
            {selectedIdea && (
              <IdeaEditorDialog
                draft={draft}
                idea={selectedIdea}
                onClose={() => setDraft(emptyDraft)}
                onDelete={() => deleteIdea(selectedIdea.id).catch((error) => setStatus(String(error)))}
                onDraftChange={setDraft}
                onSaveDraft={saveDraft}
              />
            )}
          </>
        ) : (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            chooseFolder={chooseFolder}
            saveSettings={saveSettings}
          />
        )}
      </section>
    </main>
  );
}

function QuickCapture({
  draft,
  ideas,
  reloadIdeas,
  setDraft,
  saveDraft,
  settings,
}: {
  draft: Draft;
  ideas: IdeaCard[];
  reloadIdeas: () => Promise<IdeaCard[]>;
  setDraft: Dispatch<SetStateAction<Draft>>;
  saveDraft: (candidate: Draft) => Promise<IdeaCard | null>;
  settings: AppSettings | null;
}) {
  const [closing, setClosing] = useState(false);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const ideasRef = useRef(ideas);
  const activeIdeaIdRef = useRef<string | null>(activeIdeaId);
  const baselineDraftRef = useRef<Draft>(emptyDraft);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);
  const dragGuardRef = useRef(false);
  const navigatingRef = useRef(false);
  const reloadIdeasRef = useRef(reloadIdeas);
  const saveDraftRef = useRef(saveDraft);
  const settingsRef = useRef(settings);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    ideasRef.current = ideas;
  }, [ideas]);

  useEffect(() => {
    activeIdeaIdRef.current = activeIdeaId;
  }, [activeIdeaId]);

  useEffect(() => {
    reloadIdeasRef.current = reloadIdeas;
  }, [reloadIdeas]);

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const setActiveDraft = useCallback(
    (nextDraft: Draft, ideaId: string | null) => {
      baselineDraftRef.current = nextDraft;
      draftRef.current = nextDraft;
      activeIdeaIdRef.current = ideaId;
      setActiveIdeaId(ideaId);
      setDraft(nextDraft);
    },
    [setDraft],
  );

  const resetToNewDraft = useCallback(() => {
    setActiveDraft(emptyDraft, null);
  }, [setActiveDraft]);

  const saveCurrentIfChanged = useCallback(async () => {
    const candidate = draftRef.current;
    if (!hasDraftContent(candidate) || draftsMatch(candidate, baselineDraftRef.current)) {
      return candidate.id ?? activeIdeaIdRef.current;
    }

    const saved = await saveDraftRef.current(candidate);
    if (!saved) return candidate.id ?? activeIdeaIdRef.current;

    const savedDraft = draftFromIdea(saved);
    baselineDraftRef.current = savedDraft;
    draftRef.current = savedDraft;
    activeIdeaIdRef.current = saved.id;
    setActiveIdeaId(saved.id);
    return saved.id;
  }, []);

  const navigateCards = useCallback(
    async (direction: 1 | -1) => {
      if (closingRef.current || navigatingRef.current) return;
      navigatingRef.current = true;

      try {
        const savedId = await saveCurrentIfChanged();
        const latestIdeas = await reloadIdeasRef.current();
        const pages = [null, ...latestIdeas.map((idea) => idea.id)];
        if (pages.length <= 1 && !hasDraftContent(draftRef.current)) return;

        const currentId = savedId ?? activeIdeaIdRef.current;
        const currentIndex = currentId ? pages.indexOf(currentId) : 0;
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (safeIndex + direction + pages.length) % pages.length;
        const nextId = pages[nextIndex];

        if (!nextId) {
          setActiveDraft(emptyDraft, null);
          return;
        }

        const nextIdea = latestIdeas.find((idea) => idea.id === nextId);
        if (nextIdea) {
          setActiveDraft(draftFromIdea(nextIdea), nextIdea.id);
        }
      } finally {
        navigatingRef.current = false;
      }
    },
    [saveCurrentIfChanged, setActiveDraft],
  );

  const submitAndHide = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    const candidate = draftRef.current;
    setClosing(true);

    window.setTimeout(() => {
      void invoke("hide_window", { label: "quick" }).finally(() => {
        setClosing(false);
        resetToNewDraft();
        closingRef.current = false;
      });

      if (hasDraftContent(candidate) && !draftsMatch(candidate, baselineDraftRef.current)) {
        window.setTimeout(() => {
          void saveDraftRef.current(candidate);
        }, 0);
      }
    }, closeAnimationMs);
  }, [resetToNewDraft]);

  const keepDragGuardForNativeMove = useCallback(() => {
    dragGuardRef.current = true;
    window.setTimeout(() => {
      dragGuardRef.current = false;
    }, 900);
  }, []);

  const markWindowDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      keepDragGuardForNativeMove();
    },
    [keepDragGuardForNativeMove],
  );

  const readClipboardTextIntoEmptyDraft = useCallback(async () => {
    let settings = settingsRef.current;
    if (!settings) {
      try {
        settings = await invoke<AppSettings>("load_settings");
        settingsRef.current = settings;
      } catch {
        return;
      }
    }
    if (!settings.auto_read_clipboard || hasDraftContent(draftRef.current)) return;
    if (!navigator.clipboard?.readText) return;

    try {
      const text = normalizeClipboardText(await navigator.clipboard.readText());
      if (!text || hasDraftContent(draftRef.current)) return;
      setDraft((current) => {
        if (hasDraftContent(current)) return current;
        const next = { ...current, body: text };
        draftRef.current = next;
        return next;
      });
    } catch {
      // Clipboard access may be denied by the OS or unavailable for non-text content.
    }
  }, [setDraft]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const cleanupOpened = cleanupSubscription(
      appWindow.listen<QuickWindowOpenedPayload>("quick-window-opened", ({ payload }) => {
        if (payload.source === "shortcut") {
          void readClipboardTextIntoEmptyDraft();
        }
      }),
    );
    const cleanupFocus = cleanupSubscription(
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          titleInputRef.current?.focus();
          void reloadIdeasRef.current();
          void invoke<AppSettings>("load_settings").then(
            (s) => { settingsRef.current = s; },
            () => void 0,
          );
        } else if (dragGuardRef.current) {
          return;
        } else {
          submitAndHide();
        }
      }),
      () => void 0,
    );

    return () => {
      cleanupOpened();
      cleanupFocus();
    };
  }, [readClipboardTextIntoEmptyDraft, resetToNewDraft, submitAndHide]);

  const currentPosition = activeIdeaId
    ? ideas.findIndex((idea) => idea.id === activeIdeaId) + 1
    : 0;
  const pageLabel =
    activeIdeaId && currentPosition > 0
      ? `${currentPosition} / ${ideas.length}`
      : ideas.length > 0
        ? `新卡片 + ${ideas.length}`
        : "新卡片";

  return (
    <main
      className={closing ? "quick-shell closing" : "quick-shell"}
      onKeyDownCapture={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (!isQuickCaptureNavigationShortcut(event)) return;

        event.preventDefault();
        event.stopPropagation();
        void navigateCards(getNavigationDirection(event.key));
      }}
    >
      <section className="quick-capture-card">
        <div
          className="quick-drag-handle"
          data-tauri-drag-region="deep"
          onPointerDown={markWindowDrag}
          aria-hidden="true"
        >
          <GripHorizontal size={19} />
        </div>
        <input
          className="quick-title-input"
          placeholder="一个闪念标题"
          ref={titleInputRef}
          value={draft.title}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        <MarkdownBodyEditor
          className="quick-body-input"
          placeholder=""
          value={draft.body}
          onChange={(body) =>
            setDraft((current) => ({
              ...current,
              body,
            }))
          }
        />
        <footer
          className="quick-page-status"
          data-tauri-drag-region="deep"
          onPointerDown={markWindowDrag}
        >
          <span>{pageLabel}</span>
          {activeIdeaId && <time>{formatDate(ideas.find((idea) => idea.id === activeIdeaId)?.updated_at ?? "")}</time>}
        </footer>
      </section>
    </main>
  );
}

function IdeaEditorDialog({
  draft,
  idea,
  onClose,
  onDelete,
  onDraftChange,
  onSaveDraft,
}: {
  draft: Draft;
  idea: IdeaCard;
  onClose: () => void;
  onDelete: () => void;
  onDraftChange: Dispatch<SetStateAction<Draft>>;
  onSaveDraft: (candidate: Draft) => Promise<IdeaCard | null>;
}) {
  const [autoSaveStatus, setAutoSaveStatus] = useState("已同步");
  const latestDraftRef = useRef(draft);
  const lastSavedDraftRef = useRef(draft);
  const saveDraftRef = useRef(onSaveDraft);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    saveDraftRef.current = onSaveDraft;
  }, [onSaveDraft]);

  useEffect(() => {
    const current = latestDraftRef.current;
    if (!hasDraftContent(current) || draftsMatch(current, lastSavedDraftRef.current)) {
      setAutoSaveStatus("已同步");
      return;
    }

    setAutoSaveStatus("保存中...");
    const timeoutId = window.setTimeout(() => {
      const candidate = latestDraftRef.current;
      saveInFlightRef.current = true;
      void saveDraftRef.current(candidate).then((saved) => {
        saveInFlightRef.current = false;
        if (!saved) {
          setAutoSaveStatus("保存失败");
          return;
        }
        const savedDraft = draftFromIdea(saved);
        lastSavedDraftRef.current = savedDraft;
        latestDraftRef.current = savedDraft;
        onDraftChange(savedDraft);
        setAutoSaveStatus("已自动保存");
      });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [draft, onDraftChange]);

  const closeAfterSaving = useCallback(() => {
    const candidate = latestDraftRef.current;
    if (
      !saveInFlightRef.current &&
      hasDraftContent(candidate) &&
      !draftsMatch(candidate, lastSavedDraftRef.current)
    ) {
      void saveDraftRef.current(candidate).then((saved) => {
        if (saved) {
          const savedDraft = draftFromIdea(saved);
          lastSavedDraftRef.current = savedDraft;
          latestDraftRef.current = savedDraft;
          onDraftChange(savedDraft);
        }
        onClose();
      });
      return;
    }

    onClose();
  }, [onClose, onDraftChange]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAfterSaving();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeAfterSaving]);

  return (
    <div className="editor-backdrop" onMouseDown={closeAfterSaving} role="presentation">
      <section
        aria-label="灵感卡片编辑"
        aria-modal="true"
        className="idea-editor-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="idea-editor-header">
          <div>
            <input
              className="idea-editor-title"
              value={draft.title}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            <time>{formatDate(idea.updated_at)}</time>
            <span className="idea-editor-autosave">{autoSaveStatus}</span>
          </div>
          <button className="icon" onClick={closeAfterSaving} title="关闭" type="button">
            <X size={16} />
          </button>
        </header>

        <MarkdownBodyEditor
          className="idea-editor-body"
          value={draft.body}
          onChange={(body) =>
            onDraftChange((current) => ({
              ...current,
              body,
            }))
          }
        />

        <footer className="idea-editor-actions">
          <button className="delete-text-button" onClick={onDelete} type="button">
            <Trash2 size={15} />
            删除
          </button>
          <div className="idea-editor-save-row">
            <button className="ghost-button" onClick={closeAfterSaving} type="button">
              关闭
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function IdeaGrid({
  ideas,
  selectedId,
  onEdit,
  onDelete,
}: {
  ideas: IdeaCard[];
  selectedId?: string;
  onEdit: (idea: IdeaCard) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="idea-grid main-grid">
      {ideas.map((idea) => (
        <article
          className={selectedId === idea.id ? "idea-card selected" : "idea-card"}
          key={idea.id}
          onClick={() => onEdit(idea)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEdit(idea);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div>
            <h2>{idea.title}</h2>
            <p>{getPreview(idea.body)}</p>
          </div>
          <footer>
            <time>{formatDate(idea.updated_at)}</time>
            <button
              className="delete-button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(idea.id);
              }}
              title="删除"
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </footer>
        </article>
      ))}
      {ideas.length === 0 && (
        <div className="empty-state">
          <span>还没有灵感卡片，先从快速记录开始。</span>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  chooseFolder,
  saveSettings,
}: {
  settings: AppSettings | null;
  setSettings: Dispatch<SetStateAction<AppSettings | null>>;
  chooseFolder: () => void;
  saveSettings: (overrideSettings?: AppSettings) => Promise<void>;
}) {
  return (
    <section className="settings-panel main-settings" aria-label="设置">
      <header className="main-header compact">
        <div>
          <h1>设置</h1>
          <p>配置灵感卡片的存储目录和快速记录快捷键。</p>
        </div>
      </header>

      <div className="setting-group">
        <span className="setting-label">Idea 存储目录</span>
        <div className="path-box">
          <span>{settings?.storage_dir ?? "加载中..."}</span>
          <button
            aria-label="选择 Idea 存储目录"
            className="icon"
            onClick={chooseFolder}
            title="选择目录"
            type="button"
          >
            <FolderOpen size={17} />
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label htmlFor="shortcut">快速记录快捷键</label>
        <div className="shortcut-row">
          <input
            id="shortcut"
            value={settings?.quick_open_shortcut ?? ""}
            onChange={(event) =>
              setSettings((current) =>
                current
                  ? {
                      ...current,
                      quick_open_shortcut: event.target.value,
                    }
                  : current,
              )
            }
            placeholder="Ctrl+Shift+I"
          />
          <button className="primary-button" onClick={() => void saveSettings()} type="button">
            保存
          </button>
        </div>
      </div>

      <div className="setting-group">
        <div className="setting-toggle-row">
          <div>
            <span className="setting-label">快捷键打开时读取剪贴板</span>
            <p>开启后，仅在使用快速记录快捷键打开面板时读取剪贴板中的最新文字。</p>
          </div>
          <label className="switch" title="自动读取剪贴板文字">
            <input
              aria-label="快捷键打开时自动读取剪贴板文字"
              checked={settings?.auto_read_clipboard ?? false}
              disabled={!settings}
              onChange={(event) => {
                const nextSettings = settings
                  ? { ...settings, auto_read_clipboard: event.target.checked }
                  : null;
                if (nextSettings) {
                  setSettings(nextSettings);
                  void saveSettings(nextSettings);
                }
              }}
              type="checkbox"
            />
            <span />
          </label>
        </div>
      </div>

      <div className="setting-note">
        <p>默认情况下，灵感会保存为 Markdown 文件。</p>
        <p>修改快捷键后请点击保存；剪贴板开关会即时生效。</p>
      </div>
    </section>
  );
}

export default App;
