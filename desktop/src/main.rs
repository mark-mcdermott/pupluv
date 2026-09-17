// The window is the whole app: it loads the same bundle the phone does and
// talks to the same API. There are no commands to expose, so there is no
// invoke handler and no plugin — the web app never calls into Rust.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("pupluv failed to start");
}
