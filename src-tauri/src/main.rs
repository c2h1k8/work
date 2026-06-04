// MyTools — Tauri デスクトップアプリのエントリポイント
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

// ── タイマーバッジ Tauri コマンド ─────────────────────────────────
//
// macOS : Dock バッジにテキストを表示（objc 経由で NSApplication を直接操作）
//           Dock バッジは赤ピル固定で色分け不可のため、休憩は ☕ を前置して区別
// Windows: タスクバーボタン右下にオーバーレイアイコン（32×32 RGBA）を表示
//           外周にプログレスリング（残り割合）＋中央に数字を描画
//           作業=インディゴ実線リング / 休憩=グリーン破線リングで区別
// その他 : 何もしない
//
// label   : 中央に出す数字（"25" など。残り1分未満は秒。None → クリア）
// mode    : "work" | "break"
// fraction: 残り割合 0.0〜1.0（リングの残量）

#[tauri::command]
fn set_timer_badge(
    app: tauri::AppHandle,
    label: Option<String>,
    mode: Option<String>,
    fraction: Option<f32>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = fraction; // macOS Dock バッジはテキストのみ（リング非対応）
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
            let frac = fraction.unwrap_or(0.0).clamp(0.0, 1.0);
            let icon = render_badge_icon(text, is_break, frac)?;
            win.set_overlay_icon(Some(icon)).map_err(|e| e.to_string())?;
        } else {
            win.set_overlay_icon(None).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, label, mode, fraction);
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
// 外部フォント/クレート不要。暗い円ディスク + 外周プログレスリング + 中央数字。
// ・リング: 12時方向から時計回りに「残り割合 (fraction)」ぶんを描画（残量が減る）
// ・作業 = インディゴ #6366f1 の実線リング
// ・休憩 = グリーン #10b981 の破線リング（色覚に依存せず線種でも区別）
// ・中央 = 5×7 ビットマップフォントの数字（白）。通常は分、残り1分未満は秒

#[cfg(target_os = "windows")]
fn render_badge_icon(
    label: &str,
    is_break: bool,
    fraction: f32,
) -> Result<tauri::image::Image<'static>, String> {
    // label は中央の数字。先頭2桁を使用
    let digits: Vec<usize> = label
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

    // モード配色: 作業=インディゴ(#6366f1) / 休憩=グリーン(#10b981)
    let (cr, cg, cb): (u8, u8, u8) = if is_break { (16, 185, 129) } else { (99, 102, 241) };
    // トラック（消化済み）色 = モード色を 1/3 に暗くしたもの
    let (tr, tg, tb): (u8, u8, u8) = (cr / 3, cg / 3, cb / 3);

    let cx = (SIZE as f32 - 1.0) / 2.0; // 15.5
    let cy = cx;
    const BG_RADIUS: f32 = 15.0;
    const RING_OUTER: f32 = 15.0;
    const RING_INNER: f32 = 11.5;
    let sweep = fraction.clamp(0.0, 1.0) * std::f32::consts::TAU;

    let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];

    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist > BG_RADIUS {
                continue; // 円の外＝透明
            }
            let idx = ((y * SIZE + x) * 4) as usize;

            // 既定は暗い背景ディスク
            let (mut r, mut g, mut b, mut a) = (0x1e_u8, 0x1e_u8, 0x1e_u8, 230_u8);

            // リング帯
            if dist >= RING_INNER && dist <= RING_OUTER {
                // 12時方向を 0 とした時計回りの角度 [0, TAU)
                let mut theta = dx.atan2(-dy);
                if theta < 0.0 {
                    theta += std::f32::consts::TAU;
                }
                if theta <= sweep {
                    // 残り部分: 休憩は破線(30°周期/18°点灯)、作業は実線
                    let lit = if is_break {
                        (theta.to_degrees() as i32 % 30) < 18
                    } else {
                        true
                    };
                    if lit {
                        r = cr; g = cg; b = cb; a = 255;
                    } else {
                        r = tr; g = tg; b = tb; a = 255;
                    }
                } else {
                    // 消化済み部分: 薄いトラック
                    r = tr; g = tg; b = tb; a = 255;
                }
            }

            buf[idx] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = a;
        }
    }

    // 中央の数字（白）を上描き
    let n = digits.len() as u32;
    if n > 0 {
        let total_w = n * CHAR_W + (n - 1) * GAP;
        let x_origin = ((SIZE - total_w) / 2) as i32;
        let y_origin = ((SIZE - CHAR_H) / 2) as i32;
        for (ci, &d) in digits.iter().enumerate() {
            let gx = x_origin + ci as i32 * (CHAR_W as i32 + GAP as i32);
            for row in 0..7u32 {
                let bits = DIGITS[d][row as usize];
                for col in 0..5u32 {
                    // bit4 が左端（MSB）
                    if (bits >> (4 - col)) & 1 == 0 {
                        continue;
                    }
                    for dy in 0..SCALE {
                        for dx in 0..SCALE {
                            let px = gx + (col * SCALE + dx) as i32;
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
