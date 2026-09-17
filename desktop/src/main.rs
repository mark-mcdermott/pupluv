// The window is the whole app: it loads the same bundle the phone does and
// talks to the same API. There are no commands to expose, so there is no invoke
// handler — the web app never calls into Rust.
//
// The one plugin remembers where the window was. Tauri builds its windows from
// the config on every launch, so without this it re-centres at 420x860 each
// time, which a Mac app is not expected to do.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("pupluv failed to start");
}
