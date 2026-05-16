// MyTools — Tauri デスクトップアプリのエントリポイント
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

// ── タイマーバッジ Tauri コマンド ─────────────────────────────────
//
// macOS : Dock バッジに "MM:SS" テキストを表示（objc 経由で NSApplication を直接操作）
// Windows: タスクバーボタン右下にオーバーレイアイコン（32×32 RGBA）を表示
//           ビットマップフォントで分数部分を大きく描画
// その他 : 何もしない
//
// label: Some("25:00") → 表示  / None → クリア

#[tauri::command]
fn set_timer_badge(app: tauri::AppHandle, label: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        let label_clone = label.clone();
        window
            .run_on_main_thread(move || {
                set_dock_badge_macos(label_clone.as_deref());
            })
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        let win = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        if let Some(ref text) = label {
            let icon = render_badge_icon(text)?;
            win.set_overlay_icon(Some(icon)).map_err(|e| e.to_string())?;
        } else {
            win.set_overlay_icon(None).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, label);
    }

    Ok(())
}

// ── macOS: objc 経由で Dock バッジを設定 ─────────────────────────
//
// run_on_main_thread 内から呼ばれるため、メインスレッド保証済み。

#[cfg(target_os = "macos")]
fn set_dock_badge_macos(text: Option<&str>) {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CString;

    unsafe {
        let app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
        let dock_tile: *mut Object = msg_send![app, dockTile];

        let label_obj: *mut Object = if let Some(t) = text {
            // null バイトを除去してから CString 化
            let safe: String = t.chars().filter(|&c| c != '\0').collect();
            match CString::new(safe) {
                Ok(cstr) => {
                    let obj: *mut Object = msg_send![class!(NSString), alloc];
                    msg_send![obj, initWithUTF8String: cstr.as_ptr()]
                }
                Err(_) => std::ptr::null_mut(),
            }
        } else {
            std::ptr::null_mut()
        };

        let _: () = msg_send![dock_tile, setBadgeLabel: label_obj];
        let _: () = msg_send![dock_tile, display];
    }
}

// ── Windows: 32×32 RGBA バッジ画像をビットマップフォントで生成 ──────
//
// 外部フォントファイル不要。5×7 ドットフォントを 2x スケールで描画する。
// "25:00" を受け取り、分部分 ("25") を大きく中央に表示する。
// 表示例: 背景 #1e1e1e、白文字で "25"

#[cfg(target_os = "windows")]
fn render_badge_icon(label: &str) -> Result<tauri::image::Image<'static>, String> {
    // "MM:SS" 形式から分部分を取り出す（それ以外はそのまま使用）
    let minutes_str = label.split(':').next().unwrap_or(label);
    let digits: Vec<usize> = minutes_str
        .chars()
        .filter_map(|c| c.to_digit(10).map(|d| d as usize))
        .take(2)
        .collect();

    const SIZE: u32 = 32;
    const SCALE: u32 = 2; // 1セル = 2×2 px → 5×7フォントが 10×14 px になる
    const CHAR_W: u32 = 5 * SCALE;
    const CHAR_H: u32 = 7 * SCALE;
    const GAP: u32 = SCALE; // 文字間スペース

    // 5×7 ビットマップフォント（0〜9）
    // 各エントリは [row0..row6] を u8 で表現、左端が MSB (bit4)
    // 例: 0b01110 = 0x0E = " *** "
    #[rustfmt::skip]
    const DIGITS: [[u8; 7]; 10] = [
        [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], // 0
        [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E], // 1
        [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F], // 2
        [0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E], // 3
        [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02], // 4
        [0x1F, 0x10, 0x10, 0x1E, 0x01, 0x11, 0x0E], // 5
        [0x0E, 0x10, 0x10, 0x1E, 0x11, 0x11, 0x0E], // 6
        [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10], // 7
        [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E], // 8
        [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x0E], // 9
    ];

    // バッファ初期化（RGBA: 背景 #1e1e1e + 不透明度 220/255）
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
    for px in buf.chunks_exact_mut(4) {
        px[0] = 0x1e; // R
        px[1] = 0x1e; // G
        px[2] = 0x1e; // B
        px[3] = 220;  // A
    }

    // 角丸処理（半径 6px）
    let r: i32 = 6;
    for y in 0..SIZE as i32 {
        for x in 0..SIZE as i32 {
            let in_corner = (x < r && y < r && dist2(x, y, r - 1, r - 1) > (r * r) as u32)
                || (x >= SIZE as i32 - r && y < r && dist2(x, y, SIZE as i32 - r, r - 1) > (r * r) as u32)
                || (x < r && y >= SIZE as i32 - r && dist2(x, y, r - 1, SIZE as i32 - r) > (r * r) as u32)
                || (x >= SIZE as i32 - r && y >= SIZE as i32 - r
                    && dist2(x, y, SIZE as i32 - r, SIZE as i32 - r) > (r * r) as u32);
            if in_corner {
                let idx = ((y as u32 * SIZE + x as u32) * 4) as usize;
                buf[idx + 3] = 0; // 完全透明
            }
        }
    }

    // 文字を描画
    let n = digits.len() as u32;
    if n == 0 {
        return Ok(tauri::image::Image::new_owned(buf, SIZE, SIZE));
    }
    let total_w = n * CHAR_W + (n - 1) * GAP;
    let x_origin = ((SIZE - total_w) / 2) as i32;
    let y_origin = ((SIZE - CHAR_H) / 2) as i32;

    for (ci, &d) in digits.iter().enumerate() {
        let cx = x_origin + ci as i32 * (CHAR_W as i32 + GAP as i32);
        for row in 0..7u32 {
            let bits = DIGITS[d][row as usize];
            for col in 0..5u32 {
                // bit4 が左端（MSB）
                if (bits >> (4 - col)) & 1 == 0 {
                    continue;
                }
                for dy in 0..SCALE {
                    for dx in 0..SCALE {
                        let px = cx + (col * SCALE + dx) as i32;
                        let py = y_origin + (row * SCALE + dy) as i32;
                        if px < 0 || py < 0 || px >= SIZE as i32 || py >= SIZE as i32 {
                            continue;
                        }
                        let idx = ((py as u32 * SIZE + px as u32) * 4) as usize;
                        buf[idx] = 255;     // R
                        buf[idx + 1] = 255; // G
                        buf[idx + 2] = 255; // B
                        buf[idx + 3] = 255; // A
                    }
                }
            }
        }
    }

    Ok(tauri::image::Image::new_owned(buf, SIZE, SIZE))
}

#[cfg(target_os = "windows")]
fn dist2(x: i32, y: i32, cx: i32, cy: i32) -> u32 {
    let dx = x - cx;
    let dy = y - cy;
    (dx * dx + dy * dy) as u32
}

// ── エントリポイント ──────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![set_timer_badge])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
