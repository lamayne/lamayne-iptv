# LAMAYNE IPTV

**English** · [Français](README.fr.md)

> **Tired of IPTV players that make you pay just to save a favourite? Fed up with bloated apps that run slow?**
> This one is for you.

LAMAYNE IPTV is a free, open-source player for **your own** IPTV subscription (Xtream Codes or M3U), for
**Windows 10/11** and **Android TV / Google TV**. No ads, no account, no telemetry, no premium tier.
Favourites, watch history and profiles are free, and always will be.

[![Latest Windows release](https://img.shields.io/github/v/release/lamayne/lamayne-iptv?label=Windows)](../../releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **LAMAYNE IPTV provides no content, no channels and no subscription.**
> Only use sources you are authorised to use.

<!--
  Add 2 or 3 screenshots here, with neutral content: no protected channel logos or posters, and nothing
  that shows your name, your folders or your credentials. Example:

  <p align="center">
    <img src="docs/images/windows-home.png" width="49%" alt="Home page on Windows" />
    <img src="docs/images/tv-home.png" width="49%" alt="Home page on Android TV" />
  </p>
-->

## Why you might like it

- **Everything is free.** Favourites, recently watched, resume playback, several profiles and sources, hidden categories:
  no paywall, no "pro" version, no account to create.
- **Small and quick.** The Windows app is built with Tauri and Rust (no bundled browser engine): the installer is about
  35 MB, and playback uses mpv with hardware decoding. The Android TV app is fully native (Kotlin, no web view).
- **Private.** No telemetry, no advertising, no trackers. Your settings and favourites stay on your device, and your
  credentials are stored in the Windows Credential Manager, or encrypted with the Android Keystore on the TV
  (see [PRIVACY.md](PRIVACY.md)).
- **Open.** MIT licence. The installers are built from this repository by GitHub Actions, and every release comes with
  SHA-256 checksums.

## Features

| | Windows | Android TV / Google TV |
|---|---|---|
| Live TV with programme guide (now / next) | ✅ | ✅ |
| Favourites, recently watched, search | ✅ | ✅ |
| Movies and series, resume playback | ✅ | ✅ |
| Xtream Codes account | ✅ | ✅ |
| M3U playlist | ✅ | ✅ (live TV) |
| Several profiles | ✅ | |
| Actor page with their titles in your catalogue | ✅ | ✅ |
| Similar movies and series | ✅ | ✅ |
| Picture-in-Picture, theatre mode, full screen | ✅ | |
| Cast to Chromecast / Google TV on your network | ✅ | |
| Audio and subtitle track choice | ✅ | ✅ |
| Keyboard shortcuts and mouse side buttons | ✅ | |
| Remote-friendly home page with banner | | ✅ |
| Interface in English, French and Spanish | ✅ | ✅ |

Keyboard shortcuts are listed in **Settings → About**.

## Download

**Windows 10/11**

1. Open the [Releases](../../releases) page and download `LAMAYNE-IPTV_…_x64-setup.exe`.
2. Run it, then add your source in **Settings → Profiles and sources**.

> The installer is not signed yet (see [Code signing policy](#code-signing-policy)): Windows may show
> "Windows protected your PC". Click **More info**, then **Run anyway**. On some Windows 11 setups
> (Smart App Control) unsigned installers can be blocked completely.
> To check your download, compare its SHA-256 with the one in the release notes:
> `Get-FileHash .\LAMAYNE-IPTV_…_x64-setup.exe -Algorithm SHA256`

**Android TV / Google TV**

Install the apk with the **Downloader** app: see [tv/INSTALL.md](tv/INSTALL.md). The apk is in the releases named
**LAMAYNE TV**, and it is signed.

## Build from source

Requirements: Node.js 20+, pnpm, Rust (stable) and the Visual Studio C++ build tools.

```powershell
pnpm install
npx tauri-plugin-libmpv-api setup-lib   # downloads libmpv-2.dll and libmpv-wrapper.dll
pnpm tauri dev                           # development mode
pnpm tauri build                         # installer in src-tauri/target/release/bundle
```

Checks before proposing a change:

```powershell
pnpm typecheck      # TypeScript types
pnpm test           # automated tests
pnpm check:i18n     # translations complete and consistent
```

The Android TV app is in [`tv/`](tv/) (see [tv/README.md](tv/README.md)).
To add a language: [docs/ADD-A-LANGUAGE.md](docs/ADD-A-LANGUAGE.md).

## Report a problem

Open an [issue](../../issues/new?template=bug_report.md) with the diagnostic information
(**Settings → About → Copy diagnostic information**). Never post your IPTV credentials.
For a security vulnerability, see [SECURITY.md](SECURITY.md).

## Code signing policy

See [docs/CODE-SIGNING-POLICY.md](docs/CODE-SIGNING-POLICY.md). The Windows installer is not signed yet.

## Support the project

LAMAYNE IPTV is made on spare time. If it is useful to you, you can
[buy me a coffee](https://buymeacoffee.com/lamayne) or find the other ways on [linktr.ee/lamayne](https://linktr.ee/lamayne).
A star on this repository helps too.

## Licence

[MIT](LICENSE). Third-party components: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
