# Microsoft Store: where do we stand?

**Short answer: not ready yet.** The GitHub step (downloadable, signed installer) is ready to launch.
The Store additionally requires three things that are not done yet: automatic updates inside the application,
signed binaries inside the installer, and the store listing.

Legend: ✅ done · 🔧 to do (by you) · 🛠️ to do (can be coded) · ❓ to verify with Microsoft

## Chosen route: "EXE or MSI app"

Tauri does not produce MSIX packages: the app is submitted through an **installer that you host** (the address of a GitHub
Release asset works). The Store downloads and runs that installer. According to Microsoft and Tauri documentation:
the installer must be **offline**, **signed** by an authority recognised by Microsoft (a self-signed certificate is rejected),
install **silently**, and the application must handle **its own updates** (the Store does not push them to existing users).

| # | Requirement | Status | Detail |
|---|---|---|---|
| 1 | Public repository, free license | ✅ / 🔧 | MIT license added; the public repository remains to be created |
| 2 | **Offline** installer (WebView2 included) | ✅ | Produced by the workflow (`…-setup-offline.exe`) |
| 3 | **Silent** installation `/S` | 🔧 | To test on a clean machine: `…-setup-offline.exe /S` must install without a window and add **one single** entry in "Installed apps" |
| 4 | **Versioned** HTTPS URL | ✅ | A GitHub Release file address contains the version number |
| 5 | **Signed** installer (recognised authority) | 🔧 | Depends on SignPath Foundation acceptance (see [PUBLISHING.md](PUBLISHING.md), step 3) |
| 6 | **All binaries** in the installer signed (the app, `libmpv-2.dll`, `libmpv-wrapper.dll`) | 🛠️ | Microsoft describes the installer **and its PE files** as needing to be signed (an older page says "strongly recommended"). Today only the installer is signed. The executable and DLLs must be signed **before** being packaged: two signing requests instead of one |
| 7 | **Automatic update** in the app | 🛠️ | Missing. To add with `tauri-plugin-updater`: update signing key (you generate it, it stays secret), a `latest.json` file in every Release, a "Check for updates" button. Really useful from version 0.1.1 |
| 8 | **Publisher** name different from the product name | ❓ | `bundle.publisher` is "LAMAYNE Project"; with SignPath, Windows will show "SignPath Foundation" as signer. The publisher name displayed by the Store is that of your Partner Center account: choose it when registering |
| 9 | **Partner Center** account | 🔧 | Microsoft states it is free (storedeveloper.microsoft.com); check when registering |
| 10 | **Product name** reserved | 🔧 | Reserve it in Partner Center ("LAMAYNE IPTV"): check it is available |
| 11 | **Privacy policy** at a web address | 🔧 | `PRIVACY.md` on GitHub works |
| 12 | Listing: description, **screenshots**, age rating, support | 🔧 | Screenshots with neutral data (no real channel logos or protected posters) |
| 13 | Store **content policy** | ❓ | Microsoft states that content consumed through a product is not part of certification but must follow Store rules. IPTV players (for example "IPTV Smarters Expert Premium") are published: the app is therefore not rejected outright, but the decision is Microsoft's |
| 14 | No preloaded content, clear notices | ✅ | README, listing and "About" screen state that the app provides no content |
| 15 | Dependency on a driver or NT service | ✅ | None (declare it otherwise) |
| 16 | App identity: name, identifier, versions | ✅ | `LAMAYNE IPTV`, `com.lamayne.iptv`, `0.1.0` everywhere |
| 17 | Content Security Policy (CSP) | ✅ / 🔧 | Defined; to check on a real build (see [PUBLISHING.md](PUBLISHING.md), step 1) |

## Recommended order

1. **v0.1.0 on GitHub** (steps 1 to 4 of [PUBLISHING.md](PUBLISHING.md)): you get real feedback and the signature.
2. **v0.2.0**: automatic updates (7) and signing of the inner binaries (6).
3. Silent-install test (3) on a clean machine, then **Store submission** (8 to 13).

## If the Store refuses

The refusal is explained in writing. The most likely causes for this kind of app: content policy (13), non-silent installer (3),
incomplete signature (5, 6). The app remains distributable on GitHub in all cases.
