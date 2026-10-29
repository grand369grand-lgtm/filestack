const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Adds a release signingConfig to the generated Expo Android Gradle file.
 *
 * The GitHub Actions workflow supplies ANDROID_KEYSTORE_* at build time. For
 * local development only, the plugin falls back to the standard debug key;
 * production release workflows fail before Gradle if the release secrets are
 * missing.
 */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes('signingConfigs.release')) {
      const signingStart = contents.indexOf('signingConfigs {');
      if (signingStart < 0) {
        throw new Error('withAndroidReleaseSigning: signingConfigs block not found');
      }

      // Locate the matching brace for `signingConfigs {` instead of relying on
      // whitespace/indentation from one particular Expo prebuild template.
      const open = contents.indexOf('{', signingStart);
      let depth = 0;
      let close = -1;
      for (let i = open; i < contents.length; i++) {
        if (contents[i] === '{') depth++;
        else if (contents[i] === '}') {
          depth--;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      if (close < 0) throw new Error('withAndroidReleaseSigning: malformed signingConfigs block');

      const releaseConfig = `
        release {
            def releaseStoreFile = System.getenv('ANDROID_KEYSTORE_FILE')
            if (releaseStoreFile != null && !releaseStoreFile.isEmpty()) {
                storeFile file(releaseStoreFile)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            } else {
                // Local-only fallback; CI requires a persistent release key.
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;
      contents = contents.slice(0, close) + releaseConfig + contents.slice(close);
    }

    // Replace the release build's debug signing only; leave debug builds alone.
    const buildTypesStart = contents.indexOf('buildTypes {');
    const releaseStart = contents.indexOf('release {', buildTypesStart);
    if (buildTypesStart < 0 || releaseStart < 0) {
      throw new Error('withAndroidReleaseSigning: release buildType not found');
    }
    const releaseOpen = contents.indexOf('{', releaseStart);
    let depth = 0;
    let releaseClose = -1;
    for (let i = releaseOpen; i < contents.length; i++) {
      if (contents[i] === '{') depth++;
      else if (contents[i] === '}') {
        depth--;
        if (depth === 0) {
          releaseClose = i;
          break;
        }
      }
    }
    if (releaseClose < 0) throw new Error('withAndroidReleaseSigning: malformed release buildType');

    let releaseBlock = contents.slice(releaseStart, releaseClose + 1);
    releaseBlock = releaseBlock.replace(
      /signingConfig\s+signingConfigs\.debug/,
      'signingConfig signingConfigs.release',
    );
    contents = contents.slice(0, releaseStart) + releaseBlock + contents.slice(releaseClose + 1);

    mod.modResults.contents = contents;
    return mod;
  });
};
