const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Grants FileStack real access to the device's shared storage.
 *
 * `MANAGE_EXTERNAL_STORAGE` ("All files access") is what lets the app list and
 * modify files anywhere under /storage/emulated/0. It is not a runtime dialog:
 * the user has to flip it on in system settings, which is why the app opens
 * that screen from `requestAccess()` in src/fs/device.ts.
 *
 * The scoped permissions stay in the manifest for older releases:
 *   - READ/WRITE_EXTERNAL_STORAGE on Android 10 and below
 *   - READ_MEDIA_* on Android 13+ when all-files access is not granted
 *
 * Publishing on Google Play requires declaring all-files access in the Play
 * Console (App content -> Permissions declaration) and being approved for a
 * file-manager use case; side-loaded and internal builds are unaffected.
 */
const PERMISSIONS = [
  { name: 'android.permission.MANAGE_EXTERNAL_STORAGE' },
  { name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdkVersion: '32' },
  { name: 'android.permission.WRITE_EXTERNAL_STORAGE', maxSdkVersion: '29' },
  { name: 'android.permission.READ_MEDIA_IMAGES' },
  { name: 'android.permission.READ_MEDIA_VIDEO' },
  { name: 'android.permission.READ_MEDIA_AUDIO' },
];

module.exports = function withAndroidStorageAccess(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const permission of PERMISSIONS) {
      const present = manifest['uses-permission'].some(
        (entry) => entry.$ && entry.$['android:name'] === permission.name,
      );
      if (present) continue;
      const $ = { 'android:name': permission.name };
      if (permission.maxSdkVersion) $['android:maxSdkVersion'] = permission.maxSdkVersion;
      manifest['uses-permission'].push({ $ });
    }

    const application = manifest.application && manifest.application[0];
    if (application) {
      // Android 10 asks for legacy external storage when targeting 29; the
      // preserve flag keeps that access across an app update.
      application.$['android:requestLegacyExternalStorage'] = 'true';
      application.$['android:preserveLegacyExternalStorage'] = 'true';
    }

    return mod;
  });
};
