import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  FolderOpen,
  Grid2X2,
  GripHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

type AppSettings = {
  storage_dir: string;
  quick_open_shortcut: string;
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

const emptyDraft: Draft = {
  title: "",
  body: "",
};

const initialMode = new URLSearchParams(window.location.search).get("view") === "main" ? "main" : "quick";
const closeAnimationMs = 90;
const cardNavigationKeys = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]);
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

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
  status: "准备记录",
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

  const saveSelectedDraft = async () => {
    const saved = await saveDraft(draft);
    if (saved) {
      setDraft(draftFromIdea(saved));
    }
  };

  const chooseFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择灵感卡片存储目录",
    });
    if (typeof selected === "string" && settings) {
      const next = { ...settings, storage_dir: selected };
      const saved = await invoke<AppSettings>("update_settings", {
        settings: next,
      });
      setSettings(saved);
      await load();
      setStatus("存储目录已更新");
    }
  };

  const updateShortcut = async () => {
    if (!settings) return;
    try {
      const saved = await invoke<AppSettings>("update_settings", {
        settings,
      });
      setSettings(saved);
      setStatus("快捷键已更新");
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
                <p>所有 Idea 卡片会从你设置的目录读取。</p>
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
                onSave={() => saveSelectedDraft().catch((error) => setStatus(String(error)))}
              />
            )}
          </>
        ) : (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            chooseFolder={chooseFolder}
            updateShortcut={updateShortcut}
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
}: {
  draft: Draft;
  ideas: IdeaCard[];
  reloadIdeas: () => Promise<IdeaCard[]>;
  setDraft: Dispatch<SetStateAction<Draft>>;
  saveDraft: (candidate: Draft) => Promise<IdeaCard | null>;
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

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const cleanupFocus = cleanupSubscription(
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          titleInputRef.current?.focus();
          void reloadIdeasRef.current();
        } else if (dragGuardRef.current) {
          return;
        } else {
          submitAndHide();
        }
      }),
    );

    return () => {
      cleanupFocus();
    };
  }, [resetToNewDraft, submitAndHide]);

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
        <textarea
          className="quick-body-input"
          placeholder="直接写 Markdown..."
          value={draft.body}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              body: event.target.value,
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
  onSave,
}: {
  draft: Draft;
  idea: IdeaCard;
  onClose: () => void;
  onDelete: () => void;
  onDraftChange: Dispatch<SetStateAction<Draft>>;
  onSave: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="editor-backdrop" onMouseDown={onClose} role="presentation">
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
          </div>
          <button className="icon" onClick={onClose} title="关闭" type="button">
            <X size={16} />
          </button>
        </header>

        <textarea
          className="idea-editor-body"
          value={draft.body}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              body: event.target.value,
            }))
          }
        />

        <footer className="idea-editor-actions">
          <button className="delete-text-button" onClick={onDelete} type="button">
            <Trash2 size={15} />
            删除
          </button>
          <div className="idea-editor-save-row">
            <button className="ghost-button" onClick={onClose} type="button">
              关闭
            </button>
            <button className="primary-button" onClick={onSave} type="button">
              <Check size={16} />
              保存
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
          <span>还没有灵感卡片。点击快速记录保存第一条 Idea。</span>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  chooseFolder,
  updateShortcut,
}: {
  settings: AppSettings | null;
  setSettings: Dispatch<SetStateAction<AppSettings | null>>;
  chooseFolder: () => void;
  updateShortcut: () => void;
}) {
  return (
    <section className="settings-panel main-settings" aria-label="设置">
      <header className="main-header compact">
        <div>
          <h1>设置</h1>
          <p>调整灵感文件位置和快速打开快捷键。</p>
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
        <label htmlFor="shortcut">快速打开快捷键</label>
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
          <button className="primary-button" onClick={updateShortcut} type="button">
            应用
          </button>
        </div>
      </div>

      <div className="setting-note">
        <p>每张灵感会保存为独立 Markdown 文件，文件头包含标题和更新时间。</p>
        <p>托盘左键和快捷键会打开快速记录；托盘菜单可以进入主界面。</p>
      </div>
    </section>
  );
}

export default App;
