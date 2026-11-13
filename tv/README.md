# LAMAYNE IPTV for Google TV / Android TV (test build)

A native Android TV app (Kotlin, Jetpack Compose, Media3/ExoPlayer). It works
on Android 6.0 and later. Test build 0.9.1: sign in with an Xtream account,
browse live categories and channels, favourites, recent channels, search, the programme guide (now / next), and play with on-screen controls (pause, previous / next channel, favourite; up / down to zap).

- Built by GitHub Actions: **Actions -> Android TV build (test) -> Run workflow**.
- The result is attached to the pre-release `tv-test` as `LAMAYNE-TV-test.apk`.
- The app provides no content. Use only sources you are authorised to use.

## Install on a TV (sideloading)

1. On the TV, install the **Downloader** app from the Play Store, and allow it to
   install unknown apps (Settings -> Apps -> Security & restrictions).
2. In Downloader, open this address:
   `https://github.com/lamayne/lamayne-iptv/releases/download/tv-test/LAMAYNE-TV-test.apk`
3. Install, then open **LAMAYNE IPTV** from the apps row.

## For developers

```
cd tv
gradle assembleDebug
```

Setting the account from a computer (ADB):

```
adb shell am start -n com.lamayne.iptv.tv/.MainActivity --es server http://host:port --es user USER --es pass PASS
```
