import { requireNativeModule } from 'expo-modules-core';

/**
 * Native side of the Rust core (see `android/src/main/java/expo/modules/filecore`).
 *
 * `invoke` is synchronous and runs on the JS thread; `invokeAsync` runs on a
 * background thread. Both take and return the JSON envelope documented in
 * `rust/src/ffi.rs`.
 */
export interface FileCoreNativeModule {
  invoke(request: string): string;
  invokeAsync(request: string): Promise<string>;
}

export default requireNativeModule<FileCoreNativeModule>('FileCore');
