use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppSettings {
    storage_dir: String,
    quick_open_shortcut: String,
    #[serde(default)]
    auto_read_clipboard: bool,
}

#[derive(Debug, Serialize, Clone)]
struct QuickWindowOpenedPayload {
    source: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct IdeaCard {
    id: String,
    title: String,
    body: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct SaveIdeaPayload {
    id: Option<String>,
    title: String,
    body: String,
    ended_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct StorageMigrationResult {
    settings: AppSettings,
    moved_count: usize,
    old_dir_removed: bool,
}

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+I";
const DEFAULT_STORAGE_DIR_NAME: &str = "IdeaCenter";
const FALLBACK_STORAGE_PARENT_DIR_NAME: &str = ".IdeaCard";
const UNTITLED_TITLE: &str = "无标题";

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn sanitize_filename(value: &str) -> String {
    let mut sanitized = value
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>();

    while sanitized.contains("--") {
        sanitized = sanitized.replace("--", "-");
    }

    sanitized.trim_matches('-').to_string()
}

fn has_end_time_suffix(value: &str) -> bool {
    const SUFFIX_LEN: usize = 16;
    let bytes = value.as_bytes();
    if bytes.len() < SUFFIX_LEN {
        return false;
    }

    let start = bytes.len() - SUFFIX_LEN;
    bytes[start] == b'-'
        && bytes[start + 9] == b'-'
        && bytes[(start + 1)..(start + 9)]
            .iter()
            .all(u8::is_ascii_digit)
        && bytes[(start + 10)..].iter().all(u8::is_ascii_digit)
}

fn strip_end_time_suffix(value: &str) -> &str {
    if has_end_time_suffix(value) {
        &value[..(value.len() - 16)]
    } else {
        value
    }
}

fn card_title(title: &str) -> String {
    let title = strip_end_time_suffix(title).trim();
    if title.is_empty() {
        UNTITLED_TITLE.to_string()
    } else {
        title.to_string()
    }
}

fn card_name(title: &str, ended_at: &str) -> String {
    let title = card_title(title);
    format!("{title}-{ended_at}")
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位配置目录: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建配置目录: {error}"))?;
    Ok(dir.join("settings.json"))
}

fn create_storage_dir(dir: PathBuf) -> Result<PathBuf, String> {
    fs::create_dir_all(&dir)
        .map_err(|error| format!("无法创建默认存储目录 {}: {error}", dir.display()))?;
    Ok(dir)
}

fn install_storage_dir() -> Result<PathBuf, String> {
    let executable_path = std::env::current_exe()
        .map_err(|error| format!("Unable to locate executable path: {error}"))?;
    let install_dir = executable_path.parent().ok_or_else(|| {
        format!(
            "Unable to locate install directory from executable path: {}",
            executable_path.display()
        )
    })?;
    create_storage_dir(install_dir.join(DEFAULT_STORAGE_DIR_NAME))
}

fn user_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法定位用户目录: {error}"))?;
    create_storage_dir(
        home_dir
            .join(FALLBACK_STORAGE_PARENT_DIR_NAME)
            .join(DEFAULT_STORAGE_DIR_NAME),
    )
}

fn default_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match install_storage_dir() {
        Ok(dir) => Ok(dir),
        Err(install_error) => user_storage_dir(app).map_err(|fallback_error| {
            format!(
                "无法创建安装目录下的默认存储目录，也无法使用用户目录备用路径。安装目录错误: {install_error}; 用户目录错误: {fallback_error}"
            )
        }),
    }
}

fn load_settings_inner(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|error| format!("无法读取设置: {error}"))?;
        let mut settings: AppSettings =
            serde_json::from_str(&raw).map_err(|error| format!("设置文件格式错误: {error}"))?;
        if settings.quick_open_shortcut.trim().is_empty() {
            settings.quick_open_shortcut = DEFAULT_SHORTCUT.to_string();
        }
        fs::create_dir_all(&settings.storage_dir)
            .map_err(|error| format!("无法创建灵感目录: {error}"))?;
        return Ok(settings);
    }

    let settings = AppSettings {
        storage_dir: default_storage_dir(app)?.to_string_lossy().to_string(),
        quick_open_shortcut: DEFAULT_SHORTCUT.to_string(),
        auto_read_clipboard: false,
    };
    save_settings_inner(app, &settings)?;
    Ok(settings)
}

fn save_settings_inner(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(&settings.storage_dir)
        .map_err(|error| format!("无法创建灵感目录: {error}"))?;
    let serialized = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("无法序列化设置: {error}"))?;
    fs::write(settings_path(app)?, serialized).map_err(|error| format!("无法写入设置: {error}"))
}

fn canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn move_markdown_files(old_dir: &Path, new_dir: &Path) -> Result<usize, String> {
    if !old_dir.exists() {
        return Ok(0);
    }

    fs::create_dir_all(new_dir).map_err(|error| format!("无法创建新灵感目录: {error}"))?;

    let markdown_files = fs::read_dir(old_dir)
        .map_err(|error| format!("无法读取旧灵感目录: {error}"))?
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .map_err(|error| format!("无法读取旧灵感目录中的文件: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|path| {
            path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("md")
        })
        .collect::<Vec<_>>();

    for path in &markdown_files {
        let file_name = path
            .file_name()
            .ok_or_else(|| format!("无法识别 Markdown 文件名: {}", path.display()))?;
        let destination = new_dir.join(file_name);
        if destination.exists() {
            return Err(format!(
                "新目录中已存在同名 Markdown 文件，已停止迁移: {}",
                destination.display()
            ));
        }
    }

    let mut moved_count = 0;
    for path in markdown_files {
        let file_name = path
            .file_name()
            .ok_or_else(|| format!("无法识别 Markdown 文件名: {}", path.display()))?;
        let destination = new_dir.join(file_name);

        match fs::rename(&path, &destination) {
            Ok(()) => {}
            Err(rename_error) => {
                fs::copy(&path, &destination).map_err(|copy_error| {
                    format!(
                        "无法迁移 Markdown 文件 {}: rename 错误: {}; copy 错误: {}",
                        path.display(),
                        rename_error,
                        copy_error
                    )
                })?;
                fs::remove_file(&path).map_err(|error| {
                    format!(
                        "已复制但无法删除旧 Markdown 文件 {}: {error}",
                        path.display()
                    )
                })?;
            }
        }
        moved_count += 1;
    }

    Ok(moved_count)
}

fn remove_dir_if_empty(dir: &Path) -> Result<bool, String> {
    if !dir.exists() {
        return Ok(false);
    }

    let mut entries = fs::read_dir(dir).map_err(|error| format!("无法检查旧灵感目录: {error}"))?;
    if entries.next().is_some() {
        return Ok(false);
    }

    fs::remove_dir(dir).map_err(|error| format!("无法删除旧灵感目录: {error}"))?;
    Ok(true)
}

fn idea_path(settings: &AppSettings, id: &str) -> PathBuf {
    Path::new(&settings.storage_dir).join(format!("{id}.md"))
}

fn remove_idea_file(settings: &AppSettings, id: &str) -> Result<(), String> {
    let path = idea_path(settings, id);
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法删除灵感文件: {error}"))?;
    }
    Ok(())
}

fn parse_front_matter(raw: &str) -> (Option<serde_json::Value>, String) {
    let normalized = raw.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (None, raw.to_string());
    }

    let rest = &normalized[4..];
    if let Some(end) = rest.find("\n---\n") {
        let metadata = &rest[..end];
        let body = rest[(end + 5)..].to_string();
        let json = serde_json::from_str(metadata).ok();
        return (json, body);
    }

    (None, raw.to_string())
}

fn card_from_file(path: &Path) -> Result<IdeaCard, String> {
    let raw = fs::read_to_string(path).map_err(|error| format!("无法读取灵感文件: {error}"))?;
    let (metadata, body) = parse_front_matter(&raw);
    let fallback_id = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("idea")
        .to_string();

    let metadata = metadata.unwrap_or_default();
    let id = metadata
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or(&fallback_id)
        .to_string();
    let title = metadata
        .get("title")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .unwrap_or_else(|| {
            body.lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or(UNTITLED_TITLE)
                .trim_start_matches('#')
                .trim()
                .to_string()
        });
    let title = card_title(&title);
    let created_at = metadata
        .get("created_at")
        .and_then(|value| value.as_str())
        .unwrap_or("0")
        .to_string();
    let updated_at = metadata
        .get("updated_at")
        .and_then(|value| value.as_str())
        .unwrap_or("0")
        .to_string();

    Ok(IdeaCard {
        id,
        title,
        body,
        created_at,
        updated_at,
    })
}

fn write_card(settings: &AppSettings, card: &IdeaCard) -> Result<(), String> {
    let metadata = serde_json::json!({
        "id": card.id,
        "title": card.title,
        "created_at": card.created_at,
        "updated_at": card.updated_at,
    });
    let contents = format!(
        "---\n{}\n---\n{}",
        serde_json::to_string_pretty(&metadata)
            .map_err(|error| format!("无法序列化灵感元数据: {error}"))?,
        card.body
    );
    fs::write(idea_path(settings, &card.id), contents)
        .map_err(|error| format!("无法写入灵感文件: {error}"))
}

fn show_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.show()?;
    window.unminimize()?;
    window.set_focus()?;
    Ok(())
}

fn open_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = show_window(&window);
        if label == "main" {
            let _ = app.emit_to("main", "main-window-opened", ());
        } else if label == "quick" {
            emit_quick_window_opened(app, "manual");
        }
    }
}

fn emit_quick_window_opened(app: &AppHandle, source: &str) {
    let _ = app.emit_to(
        "quick",
        "quick-window-opened",
        QuickWindowOpenedPayload {
            source: source.to_string(),
        },
    );
}

fn open_quick_window_with_source(app: &AppHandle, source: &str) {
    if let Some(window) = app.get_webview_window("quick") {
        let _ = show_window(&window);
        emit_quick_window_opened(app, source);
    }
}

fn create_configured_windows(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let windows = app.config().app.windows.clone();
    for window_config in windows {
        WebviewWindowBuilder::from_config(app, &window_config)?
            .enable_clipboard_access()
            .build()?;
    }
    Ok(())
}

fn tray_icon_image() -> tauri::Result<Image<'static>> {
    Image::from_bytes(include_bytes!("../icons/icon.png"))
}

fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    let mut modifiers = Modifiers::empty();
    let mut code = None;

    for segment in value.split('+') {
        let token = segment.trim().to_lowercase();
        match token.as_str() {
            "ctrl" | "control" => modifiers.insert(Modifiers::CONTROL),
            "shift" => modifiers.insert(Modifiers::SHIFT),
            "alt" | "option" => modifiers.insert(Modifiers::ALT),
            "cmd" | "command" | "meta" | "super" => modifiers.insert(Modifiers::SUPER),
            "a" => code = Some(Code::KeyA),
            "b" => code = Some(Code::KeyB),
            "c" => code = Some(Code::KeyC),
            "d" => code = Some(Code::KeyD),
            "e" => code = Some(Code::KeyE),
            "f" => code = Some(Code::KeyF),
            "g" => code = Some(Code::KeyG),
            "h" => code = Some(Code::KeyH),
            "i" => code = Some(Code::KeyI),
            "j" => code = Some(Code::KeyJ),
            "k" => code = Some(Code::KeyK),
            "l" => code = Some(Code::KeyL),
            "m" => code = Some(Code::KeyM),
            "n" => code = Some(Code::KeyN),
            "o" => code = Some(Code::KeyO),
            "p" => code = Some(Code::KeyP),
            "q" => code = Some(Code::KeyQ),
            "r" => code = Some(Code::KeyR),
            "s" => code = Some(Code::KeyS),
            "t" => code = Some(Code::KeyT),
            "u" => code = Some(Code::KeyU),
            "v" => code = Some(Code::KeyV),
            "w" => code = Some(Code::KeyW),
            "x" => code = Some(Code::KeyX),
            "y" => code = Some(Code::KeyY),
            "z" => code = Some(Code::KeyZ),
            "0" => code = Some(Code::Digit0),
            "1" => code = Some(Code::Digit1),
            "2" => code = Some(Code::Digit2),
            "3" => code = Some(Code::Digit3),
            "4" => code = Some(Code::Digit4),
            "5" => code = Some(Code::Digit5),
            "6" => code = Some(Code::Digit6),
            "7" => code = Some(Code::Digit7),
            "8" => code = Some(Code::Digit8),
            "9" => code = Some(Code::Digit9),
            _ => return Err(format!("暂不支持的快捷键片段: {segment}")),
        }
    }

    code.map(|key| Shortcut::new(Some(modifiers), key))
        .ok_or_else(|| "快捷键需要包含一个字母或数字".to_string())
}

fn register_quick_open_shortcut(app: &AppHandle, shortcut_text: &str) -> Result<(), String> {
    let shortcut = parse_shortcut(shortcut_text)?;
    let app_handle = app.clone();
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| format!("无法清理旧快捷键: {error}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                open_quick_window_with_source(&app_handle, "shortcut");
            }
        })
        .map_err(|error| format!("无法注册快捷键: {error}"))
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let quick = MenuItem::with_id(app, "quick", "快速记录", true, None::<&str>)?;
    let main = MenuItem::with_id(app, "main", "打开主界面", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quick, &main, &quit])?;

    TrayIconBuilder::new()
        .icon(tray_icon_image()?)
        .tooltip("IdeaCard")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quick" => open_window(app, "quick"),
            "main" => open_window(app, "main"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_window(tray.app_handle(), "quick");
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    load_settings_inner(&app)
}

#[tauri::command]
fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    save_settings_inner(&app, &settings)?;
    register_quick_open_shortcut(&app, &settings.quick_open_shortcut)?;
    Ok(settings)
}

#[tauri::command]
fn change_storage_dir(
    app: AppHandle,
    settings: AppSettings,
    migrate_markdown: bool,
) -> Result<StorageMigrationResult, String> {
    let previous_settings = load_settings_inner(&app)?;
    let old_dir = PathBuf::from(&previous_settings.storage_dir);
    let new_dir = PathBuf::from(&settings.storage_dir);
    let same_dir = canonical_or_original(&old_dir) == canonical_or_original(&new_dir);

    let (moved_count, old_dir_removed) = if migrate_markdown && !same_dir {
        let moved_count = move_markdown_files(&old_dir, &new_dir)?;
        let old_dir_removed = remove_dir_if_empty(&old_dir)?;
        (moved_count, old_dir_removed)
    } else {
        fs::create_dir_all(&settings.storage_dir)
            .map_err(|error| format!("无法创建灵感目录: {error}"))?;
        (0, false)
    };

    save_settings_inner(&app, &settings)?;
    register_quick_open_shortcut(&app, &settings.quick_open_shortcut)?;
    Ok(StorageMigrationResult {
        settings,
        moved_count,
        old_dir_removed,
    })
}

#[tauri::command]
fn list_ideas(app: AppHandle) -> Result<Vec<IdeaCard>, String> {
    let settings = load_settings_inner(&app)?;
    fs::create_dir_all(&settings.storage_dir)
        .map_err(|error| format!("无法创建灵感目录: {error}"))?;

    let mut cards = fs::read_dir(&settings.storage_dir)
        .map_err(|error| format!("无法读取灵感目录: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("md"))
        .filter_map(|path| card_from_file(&path).ok())
        .collect::<Vec<_>>();

    cards.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(cards)
}

#[tauri::command]
fn save_idea(app: AppHandle, payload: SaveIdeaPayload) -> Result<IdeaCard, String> {
    let settings = load_settings_inner(&app)?;
    let now_millis = now_millis();
    let now = now_millis.to_string();
    let existing = payload
        .id
        .as_deref()
        .filter(|id| !id.is_empty())
        .and_then(|id| card_from_file(&idea_path(&settings, id)).ok());
    let ended_at = payload
        .ended_at
        .as_deref()
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| now.clone());
    let title = card_title(&payload.title);
    let name = card_name(&title, &ended_at);
    let old_id = payload.id.as_deref().filter(|id| !id.is_empty());
    let mut id = sanitize_filename(&name);
    if id.is_empty() {
        id = now.clone();
    }
    if let Some(old_id) = old_id {
        if old_id != id {
            remove_idea_file(&settings, old_id)?;
        }
    }
    let card = IdeaCard {
        id,
        title,
        body: payload.body,
        created_at: existing
            .as_ref()
            .map(|card| card.created_at.clone())
            .unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    write_card(&settings, &card)?;
    Ok(card)
}

#[tauri::command]
fn delete_idea(app: AppHandle, id: String) -> Result<(), String> {
    let settings = load_settings_inner(&app)?;
    remove_idea_file(&settings, &id)
}

#[tauri::command]
fn hide_window(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let label = label.unwrap_or_else(|| "quick".to_string());
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("找不到窗口: {label}"))?;
    window
        .hide()
        .map_err(|error| format!("无法隐藏窗口: {error}"))
}

#[tauri::command]
fn open_main_window(app: AppHandle) {
    open_window(&app, "main");
}

#[tauri::command]
fn open_quick_window(app: AppHandle) {
    open_window(&app, "quick");
}

#[tauri::command]
fn open_url(_app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("Only http and https URLs are allowed".to_string());
    }
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(trimmed).spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(trimmed).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(trimmed).spawn();

    result
        .map(|_| ())
        .map_err(|error| format!("Failed to open url: {error}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            create_configured_windows(app)?;
            setup_tray(app)?;
            let app_handle = app.handle().clone();
            let settings = load_settings_inner(&app_handle)?;
            register_quick_open_shortcut(&app_handle, &settings.quick_open_shortcut)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            update_settings,
            change_storage_dir,
            list_ideas,
            save_idea,
            delete_idea,
            hide_window,
            open_main_window,
            open_quick_window,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
