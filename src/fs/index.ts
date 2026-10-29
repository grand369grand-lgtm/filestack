import { createDeviceFs } from './device';
import type { FsProvider } from './provider';

export * from './provider';

/**
 * The app has one filesystem provider: the real device, backed by the Rust
 * core. The web demo tree is gone, so there is nothing to switch between.
 */
export const fs: FsProvider = createDeviceFs();
