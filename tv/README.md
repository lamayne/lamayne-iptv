# LAMAYNE IPTV for Android TV / Google TV

A native Android TV app (Kotlin, Jetpack Compose, Media3 / ExoPlayer). It works on Android 6.0 and later.
It provides **no content**: only use sources you are authorised to use.

## What it does

- **Sign in** with an Xtream Codes account or an M3U link (an M3U link gives Live TV only).
- **Home page** made for the remote: a banner with a movie or series, then rows for what you were watching, your channels,
  your favourites and the latest movies and series. It is kept on the device and shows at once at the next start.
- **Live TV**: categories, favourites, recently watched, search, and the programme guide (now / next).
- **Movies and series**: details, resume playback, cast with an actor page (their titles in your catalogue), similar titles.
- **Player**: audio and subtitle tracks, seek bar, a "4K smooth" option, and zapping with up / down on live channels.
- **Favourites** in the order you choose (a long press on OK adds or removes one).
- **Interface** in English, French and Spanish (Auto follows the language of the TV; any other language means English).
- **Private**: no telemetry. The account and your lists are encrypted on the device (AES-256-GCM, key in the Android Keystore).

## Install

See [INSTALL.md](INSTALL.md). In short: install **Downloader** on the TV, then open the address of the apk given in the
latest **LAMAYNE TV** release.

## Test builds

Debug builds, for testing only, are attached to the pre-release `tv-test`
(**Actions → Android TV build (test) → Run workflow**).

## For developers

```
cd tv
gradle assembleDebug
```

Releases are built and signed by **Actions → Android TV release** (see [INSTALL.md](INSTALL.md)).
