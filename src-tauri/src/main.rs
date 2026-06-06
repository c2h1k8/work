// MyTools — Tauri デスクトップアプリのエントリポイント
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

// ── タイマーバッジ Tauri コマンド ─────────────────────────────────
//
// 正確な「数字」を出す担当（残り時間の「量」はタスクバー/Dock のプログレスバーが担当）
//
// macOS : Dock バッジにテキストを表示（objc 経由で NSApplication を直接操作）
//           Dock バッジは赤ピル固定で色分け不可のため、休憩は ☕ を前置して区別
// Windows: タスクバーボタン右下にオーバーレイアイコン（32×32 RGBA）を表示
//           モード色の角丸地に数字を大きく描画（リングは廃止し数字を最大化）
// その他 : 何もしない
//
// label: 出す数字（"25" など。残り1分未満は秒。None → クリア）
// mode : "work" | "break"

#[tauri::command]
fn set_timer_badge(
    app: tauri::AppHandle,
    label: Option<String>,
    mode: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        // 休憩は ☕ を前置（赤ピル固定で色分けできないため、グリフで区別）
        let text = label.as_ref().map(|l| {
            if mode.as_deref() == Some("break") {
                format!("☕{}", l)
            } else {
                l.clone()
            }
        });
        window
            .run_on_main_thread(move || {
                set_dock_badge_macos(text.as_deref());
            })
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        let win = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        if let Some(ref text) = label {
            let is_break = mode.as_deref() == Some("break");
            let icon = render_badge_icon(text, is_break)?;
            win.set_overlay_icon(Some(icon)).map_err(|e| e.to_string())?;
        } else {
            win.set_overlay_icon(None).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, label, mode);
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

// ── Windows: 32×32 RGBA バッジ画像を生成 ───────────────────────────
//
// 外部フォント/クレート不要。モード色の角丸地に数字を大きく描く（残り量はバーが担当）。
// ・作業 = インディゴ #6366f1 地 / 休憩 = グリーン #10b981 地（色でモード区別）
// ・数字（白）は 5×7 ビットマップフォント。1桁ならスケール4で最大化、2桁はスケール3

#[cfg(target_os = "windows")]
fn render_badge_icon(label: &str, is_break: bool) -> Result<tauri::image::Image<'static>, String> {
    // label の数字。先頭2桁を使用
    let digits: Vec<usize> = label
        .chars()
        .filter_map(|c| c.to_digit(10).map(|d| d as usize))
        .take(2)
        .collect();

    const SIZE: u32 = 32;

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

    // モード配色: 作業=インディゴ(#6366f1) / 休憩=グリーン(#10b981)
    let (cr, cg, cb): (u8, u8, u8) = if is_break { (16, 185, 129) } else { (99, 102, 241) };

    // 角丸の四角形をモード色で塗る（角は透明）
    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
    let rad = 7.0_f32;
    for y in 0..SIZE {
        for x in 0..SIZE {
            // 角丸内側判定: 角の領域だけ円弧でクリップ、辺・中央は常に内側
            let fx = x as f32;
            let fy = y as f32;
            let qx = fx.clamp(rad, SIZE as f32 - 1.0 - rad);
            let qy = fy.clamp(rad, SIZE as f32 - 1.0 - rad);
            let dx = fx - qx;
            let dy = fy - qy;
            if dx * dx + dy * dy > rad * rad {
                continue; // 角の外＝透明
            }
            let idx = ((y * SIZE + x) * 4) as usize;
            buf[idx] = cr;
            buf[idx + 1] = cg;
            buf[idx + 2] = cb;
            buf[idx + 3] = 235;
        }
    }

    // 数字（白）を上描き。桁数に応じてスケールを変えて最大化
    let n = digits.len() as u32;
    if n > 0 {
        let scale: u32 = if n == 1 { 4 } else { 3 };
        let char_w = 5 * scale;
        let char_h = 7 * scale;
        let gap = 1; // 文字間スペース（2桁×scale3 を 32px 幅に収めるため詰める）
        let total_w = n * char_w + (n - 1) * gap;
        let x_origin = (SIZE as i32 - total_w as i32) / 2;
        let y_origin = (SIZE as i32 - char_h as i32) / 2;
        for (ci, &d) in digits.iter().enumerate() {
            let gx = x_origin + ci as i32 * (char_w as i32 + gap as i32);
            for row in 0..7u32 {
                let bits = DIGITS[d][row as usize];
                for col in 0..5u32 {
                    // bit4 が左端（MSB）
                    if (bits >> (4 - col)) & 1 == 0 {
                        continue;
                    }
                    for sy in 0..scale {
                        for sx in 0..scale {
                            let px = gx + (col * scale + sx) as i32;
                            let py = y_origin + (row * scale + sy) as i32;
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
    }

    Ok(tauri::image::Image::new_owned(buf, SIZE, SIZE))
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
