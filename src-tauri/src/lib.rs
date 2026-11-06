// Shared entry point for desktop (called from main.rs) and mobile (called by the Android/iOS host).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Native HTTP for AI providers: no CORS, LAN `http://` hosts (Ollama), and streamed responses.
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Curie");
}
