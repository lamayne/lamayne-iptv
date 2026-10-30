# Third-party components

LAMAYNE IPTV relies on free software. This table is a **starting point**: generate the complete and exact list with
`pnpm licenses list` (JavaScript) and `cargo about` (Rust) before every release, and check each license in the
component's repository.

| Component | Role | License (to verify) |
|---|---|---|
| libmpv ("lgpl" build by zhongfly) | video playback | LGPL 2.1 or later |
| libmpv-wrapper (nini22P) | bridge between the plugin and libmpv | see its repository |
| tauri-plugin-libmpv | mpv integration for Tauri | MPL-2.0 |
| Tauri | application framework | MIT or Apache-2.0 |
| React, React DOM | user interface | MIT |
| Tailwind CSS | styling | MIT |
| lucide-react | icons | ISC |
| Inter (font, via @fontsource-variable/inter) | typography | SIL Open Font License 1.1 |
| rust_cast | Google Cast protocol | MIT |
| mdns-sd | local network device discovery | see its repository |
| reqwest, rustls, keyring, roxmltree, chrono, flate2 | networking, TLS, Windows vault, XML, dates, compression | MIT / Apache-2.0 / ISC (per component) |
| Vitest | automated tests (development only) | MIT |

## libmpv (LGPL)

libmpv is used as a **separate dynamic library** (`libmpv-2.dll`). Its source code is available at
https://github.com/mpv-player/mpv and the builds used at https://github.com/zhongfly/mpv-winbuild.
You can replace this DLL with another compatible version.
