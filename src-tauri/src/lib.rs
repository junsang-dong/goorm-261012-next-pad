mod commands;
mod error;
mod fs_safety;
mod registry;
mod settings;

use registry::FileRegistry;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(FileRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_document,
            commands::save_document,
            commands::save_document_as,
            commands::release_document,
            commands::approve_close,
            settings::load_settings,
            settings::save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Both the red traffic-light button and Cmd+W surface as WindowEvent::CloseRequested;
            // Cmd+Q / app-menu Quit surfaces as the top-level RunEvent::ExitRequested. Both are
            // routed through the same "close-requested" signal so the frontend's single
            // confirmCloseTabs flow handles every exit path (SPEC §8, simplified per plan: no
            // request-ID coordinator — the frontend's own in-flight guard is enough).
            match &event {
                tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::CloseRequested { api, .. }, .. } => {
                    api.prevent_close();
                    app_handle.emit("close-requested", ()).ok();
                }
                tauri::RunEvent::ExitRequested { api, .. } => {
                    api.prevent_exit();
                    app_handle.emit("close-requested", ()).ok();
                }
                _ => {}
            }
        });
}
