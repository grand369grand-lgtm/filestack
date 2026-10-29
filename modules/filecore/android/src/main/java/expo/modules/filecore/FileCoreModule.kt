package expo.modules.filecore

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo module that puts the Rust core in front of JavaScript.
 *
 * Two entry points, same protocol:
 *   - `invoke`      runs on the JS thread. Used for the compute operations
 *                   (search, sort, insights, duplicates, formatSize) where the
 *                   answer is needed immediately and the call is cheap.
 *   - `invokeAsync` runs on a background thread and returns a Promise. Used for
 *                   filesystem work (scan, read_text, mkdir, remove, rename,
 *                   copy) so a slow directory walk never blocks the UI.
 */
class FileCoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FileCore")

    Function("invoke") { request: String ->
      FileCoreNative.invoke(request)
    }

    AsyncFunction("invokeAsync") { request: String ->
      FileCoreNative.invoke(request)
    }
  }
}
