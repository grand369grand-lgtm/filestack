# Android storage access

FileStack can browse two places on Android, and you pick which one from the
storage pill at the top of the Files screen:

- **App storage** — the app's private document directory. Always readable,
  never asks for a permission.
- **Internal storage** — `/storage/emulated/0`, i.e. the real Downloads, DCIM,
  Documents, WhatsApp folders and everything else on the phone. Any SD card
  mounted under `/storage` shows up as an extra root.

## What is declared in the manifest

`plugins/withAndroidStorageAccess.js` adds these to the generated
`AndroidManifest.xml` during `expo prebuild`:

| Permission | Why |
| --- | --- |
| `MANAGE_EXTERNAL_STORAGE` | "All files access" — read and modify anything in shared storage |
| `READ_EXTERNAL_STORAGE` (max SDK 32) | Android 12 and below |
| `WRITE_EXTERNAL_STORAGE` (max SDK 29) | Android 10 and below |
| `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_AUDIO` | Android 13+ media, used when all-files access is off |

It also sets `android:requestLegacyExternalStorage` and
`android:preserveLegacyExternalStorage` on `<application>` so Android 10 keeps
the same file access.

## Granting it at runtime

`MANAGE_EXTERNAL_STORAGE` is not a normal runtime dialog — Android only lets
the user turn it on from system settings. So the first time you switch to
Internal storage the app shows an **All-files access needed** banner:

1. Tap **Grant**. The app opens *Settings → Special app access → All files
   access* for FileStack (`android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`,
   with fallbacks for OEM builds that only ship the generic list).
2. Turn the toggle on and come back.
3. Tap the check button on the banner, or **Recheck access** in the storage
   sheet.

If access is still missing the folder list stays empty instead of crashing —
`scan()` swallows unreadable directories and returns what it can.

## Reading, writing and scanning

All paths in the app are relative to the active root, so the same screens,
search index and insights code work unchanged after a switch. Writes
(create folder, rename, delete, import) go to the active root and therefore
need all-files access too.

A full scan of a phone can involve tens of thousands of files, so the walker
stops at 25,000 entries and skips `Android/data`, `Android/obb`,
`.thumbnails` and `LOST.DIR`, which are either unreadable or useless for
storage insights.

## Publishing on Google Play

`MANAGE_EXTERNAL_STORAGE` is a restricted permission. To publish on Play you
must declare it in **Play Console → App content → Permissions declaration**
and be approved for a file-manager use case; without that approval the release
is rejected. Sideloaded APKs, internal testing tracks and F-Droid are not
affected.

If you would rather stay inside Play policy, drop `MANAGE_EXTERNAL_STORAGE`
from the plugin, keep the scoped media permissions, and rely on the document
picker (which already works through the system's Storage Access Framework) for
anything outside the media collections.
