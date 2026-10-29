package expo.modules.filecore

/**
 * The only JNI surface in the app.
 *
 * `libfilecore.so` is built from `rust/` with `--features jni`; the exported
 * symbol is `Java_expo_modules_filecore_FileCoreNative_invoke` (see
 * `rust/src/jni_bridge.rs`). Keep the class name, package and method name in
 * sync with that symbol or the link fails at runtime with UnsatisfiedLinkError.
 */
internal object FileCoreNative {
  init {
    System.loadLibrary("filecore")
  }

  /**
   * Runs one JSON request through the Rust core and returns its JSON envelope:
   * `{"ok":true,"data":...}` or `{"ok":false,"error":"..."}`.
   */
  external fun invoke(request: String): String
}
