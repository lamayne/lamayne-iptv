# LAMAYNE TV: install and release

LAMAYNE IPTV provides no content. You need your own IPTV subscription (Xtream account or M3U link).

## Install on a TV (Android TV / Google TV)

1. Install **Downloader** (by AFTVnews) from the TV's app store.
2. Allow Downloader to install unknown apps (Settings > Apps > Security & restrictions).
3. In Downloader, enter the address of the apk shown in the latest "LAMAYNE TV" release:
   `https://github.com/lamayne/lamayne-iptv/releases/download/tv-vX.Y.Z/LAMAYNE-TV_X.Y.Z.apk`
4. Install. The next versions install over the old one, with the same steps.

Check the file if you want: the SHA-256 written in the release must be the one of the downloaded file.

> The very first release is signed with a new key: if you had a *test build* installed, uninstall
> it once (Settings > Apps) before installing the release. Its favourites and history are lost.

## Publish a new version (maintainer)

1. Raise `versionName` and `versionCode` in `tv/app/build.gradle.kts`.
2. Commit and push.
3. Actions > **Android TV release** > Run workflow (the text box is the "what is new").
4. The workflow builds the **signed** apk and publishes the release `tv-vX.Y.Z` with its SHA-256.

The test build (debug) stays available with Actions > Android TV build (test).

### One-time setup: the signing key

The apk must always be signed with the **same** key, otherwise an update cannot install over the
previous version. Create the key once, on your computer (never in the repository):

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
keytool -genkeypair -v -keystore lamayne-release.jks -alias lamayne -keyalg RSA -keysize 4096 -validity 10000
```

(`keytool` asks for a password and for a name and organisation: a pseudonym is enough.)

Then, in GitHub: Settings > Secrets and variables > Actions > New repository secret, four times:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the file in base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("lamayne-release.jks")) | Set-Clipboard`, then paste |
| `ANDROID_KEYSTORE_PASSWORD` | the password of the keystore |
| `ANDROID_KEY_ALIAS` | `lamayne` |
| `ANDROID_KEY_PASSWORD` | the password of the key (the same one if you gave only one) |

**Keep a copy of `lamayne-release.jks` and its passwords somewhere safe (not in the repository).**
If the key is lost, nobody can update the app without uninstalling it first. Never commit the file:
add `*.jks` and `*.keystore` to `.gitignore`.
