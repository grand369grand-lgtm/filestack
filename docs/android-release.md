# Android APK release (no EAS)

This project builds Android locally with Expo Prebuild + Gradle. A GitHub Actions runner provides Node, JDK and Android SDK; Expo Application Services (EAS) login is not used.

## GitHub Actions release

`.github/workflows/android-release.yml` runs when you push a `v*` tag (or start it manually). It:

1. installs the locked npm dependencies;
2. generates the native Android project with `expo prebuild`;
3. assembles a signed release APK with Gradle;
4. uploads the APK and SHA-256 checksum as a workflow artifact;
5. creates a GitHub Release and attaches the APK/checksum for version tags;
6. emails the result (success or failure) when SMTP secrets are configured.

The workflow uses GitHub's built-in `GITHUB_TOKEN` to publish the Release. It does **not** need a personal GitHub PAT.

## One-time signing setup

A persistent signing key is needed so future APKs can update earlier installs. Generate it on your own trusted computer; do not commit it or send it in chat:

```sh
keytool -genkeypair -v \
  -keystore filestack-release.keystore \
  -alias filestack \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 filestack-release.keystore > filestack-release.keystore.b64
```

In the GitHub repository's **Settings → Secrets and variables → Actions**, create these repository secrets:

- `ANDROID_KEYSTORE_BASE64` — contents of the `.b64` file
- `ANDROID_KEYSTORE_PASSWORD` — keystore password
- `ANDROID_KEY_ALIAS` — `filestack` (or the alias you selected)
- `ANDROID_KEY_PASSWORD` — private-key password

Keep a backup of the keystore and passwords in a password manager. Losing the key prevents upgrades signed with that key. Never add the keystore or `.b64` file to Git.

If `ANDROID_KEYSTORE_BASE64` is absent the workflow does not fail: it generates a throwaway keystore for that run, logs a warning, and records the fact in the release notes. Such an APK installs normally but cannot update an install signed with a different key, so add the four secrets before you share builds.

## Email notification when the APK is ready

The last step of the workflow emails you the build result — APK size, SHA-256, release link and workflow run link on success, and the run link on failure. It is skipped silently until you add these repository secrets:

- `SMTP_HOST` — optional, defaults to `smtp.gmail.com`
- `SMTP_PORT` — optional, defaults to `465` (SSL); use `587` for STARTTLS
- `SMTP_USERNAME` — the mailbox that sends the mail, e.g. `you@gmail.com`
- `SMTP_PASSWORD` — an app password, not your normal account password
- `MAIL_TO` — where the notification goes, e.g. `you@gmail.com`

For Gmail, turn on 2-step verification and create an App Password (Google Account → Security → App passwords), then use that 16-character value as `SMTP_PASSWORD`. Any other SMTP provider works the same way.

`MAIL_TO` is a secret rather than a value in this file so your address is not published in a public repository.

## Publish a release

After the repository is created and the secrets are saved:

```sh
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds the APK and publishes it under **Releases**. The APK's Android application ID is currently `in.crossberry.filestack`; change `expo.android.package` in `app.json` before your first build if you need a different reverse-domain ID.

## Build locally

Prerequisites: Node 22, JDK 17, Android SDK/NDK and accepted Android SDK licences.

```sh
npm ci
npx expo prebuild --platform android --no-install --clean
cd android
./gradlew :app:assembleRelease
```

For a real signed release, set these environment variables before Gradle: `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without a keystore the config plugin falls back to the Android debug key for local testing only; GitHub Actions deliberately fails unless persistent-key secrets exist.

## Create and push the public repo

The GitHub connector is not available in this workspace, so create/push the remote from your own machine after authenticating with GitHub CLI. The script uses `gh`'s local credential store; no PAT is put in the repo:

```sh
# Install gh and authenticate once; do not paste a token into the project.
gh auth login

# From the project root. Replace OWNER with your GitHub user or organization.
./scripts/publish-public-repo.sh OWNER filestack
```

The script creates a **public** repository, commits the project and pushes `main`. Review the repo owner and package ID before running it.

If the repository was created from an assistant session instead, the files were committed through the GitHub API and you can just clone it and push as usual.
