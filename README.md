# LAMAYNE IPTV

**A personal IPTV player for Windows 10 and 11.** Play the Live TV channels, movies and series of your own
[Xtream Codes](https://xtream-ui.org/) or **M3U** sources, with a programme guide (EPG), favourites, profiles and Chromecast support.

English · [Français](README.fr.md) · [Español](README.es.md)

> **LAMAYNE IPTV provides no content, no channels and no subscriptions.**
> Only use sources you are authorised to use.

<!-- Add 2 or 3 screenshots here, using neutral data (no real channel logos or protected posters). -->

## Features

- **Live TV** with programme guide (EPG), favourites and recently watched channels.
- **Movies and series** with resume playback, favourites and hideable categories.
- **Global search** from the home page: channels, movies and series in one field.
- **Xtream Codes** and **M3U** sources; several profiles.
- Playback with **mpv** (hardware decoding), picture-in-picture, fullscreen and full keyboard shortcuts (Settings → About).
- **Cast** to Google devices (Chromecast, Google TV) on your local network.
- Interface in **English, French and Spanish** (follows your system language on first launch).
- Light on resources and fully local: your settings, favourites and credentials stay on your computer
  (see [PRIVACY.md](PRIVACY.md)).

## Install

1. Open the [Releases](../../releases) page of this repository.
2. Download `LAMAYNE-IPTV_…_x64-setup.exe` (standard installer) and run it.
3. On first launch, add your source in **Settings → Profiles and sources**.

> While the installer is not signed, Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.
> The checksums in `SHA256SUMS.txt` let you verify the file you downloaded.

## Build from source

Requirements: Node.js 20+, pnpm, Rust (stable) and the Visual Studio C++ build tools.

```powershell
pnpm install
npx tauri-plugin-libmpv-api setup-lib   # downloads libmpv-2.dll and libmpv-wrapper.dll
pnpm tauri dev                           # development mode
pnpm tauri build                         # installer in src-tauri/target/release/bundle
```

Checks to run before proposing a change:

```powershell
pnpm typecheck      # TypeScript types
pnpm test           # automated tests
pnpm check:i18n     # complete and consistent translations
```

To add a language: [docs/ADD-A-LANGUAGE.md](docs/ADD-A-LANGUAGE.md).

## Report a problem

Open an [issue](../../issues/new?template=bug_report.md) and paste the diagnostic info
(Settings → About → "Copy diagnostic info"). Never post your IPTV credentials.
For a security vulnerability, see [SECURITY.md](SECURITY.md).

## Code signing

See [docs/CODE-SIGNING-POLICY.md](docs/CODE-SIGNING-POLICY.md).

## License

[MIT](LICENSE). Third-party components: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
