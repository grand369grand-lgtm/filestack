import { Platform } from 'react-native';
import { createMockFs } from './mock';
import type { FsProvider } from './provider';

export * from './provider';

/**
 * Web gets the demo tree (browsers can't read a device sandbox).
 * iOS/Android get the real app document directory — `require`d lazily so the
 * native-only module (and its FileSystem/DocumentPicker side effects) never
 * loads in a browser bundle.
 */
export const fs: FsProvider =
  Platform.OS === 'web'
    ? createMockFs()
    : // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('./device') as typeof import('./device')).createDeviceFs();
