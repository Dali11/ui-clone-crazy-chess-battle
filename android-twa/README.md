# Building the Crazy Chess Battles APK

This directory contains the configuration for building a native Android APK
from the Crazy Chess Battles PWA using Google's **Bubblewrap** (Trusted Web Activity).

## Why an APK?

The PWA already works great, but some mobile browsers (Samsung Internet, UC Browser)
have "smart dark mode" that inverts colors and makes chess pieces look identical.
A native APK runs in a TWA (Trusted Web Activity) which doesn't apply browser-level
color inversion, eliminating the piece color bug entirely.

## Option 1: GitHub Actions (Easiest — No Local Setup)

1. Go to the repo's **Actions** tab on GitHub
2. Select "Build Android APK (TWA)" workflow
3. Click **Run workflow** button
4. Wait ~5 minutes for the build
5. Download the `ccb-android-apk` artifact
6. Install the APK on your phone

## Option 2: PWABuilder.com (Fastest)

1. Go to [pwabuilder.com](https://pwabuilder.com)
2. Enter `crazychessbattles.live`
3. Click "Build My PWA" → Android
4. Download the generated APK

## Option 3: Local Build (Most Control)

### Prerequisites
1. **Node.js** 18+
2. **Java JDK 11+** — `brew install openjdk@17` or download from Oracle
3. **Android SDK** — install via Android Studio

### Steps
```bash
npm install -g @bubblewrap/cli
cd android-twa
bubblewrap init --manifest twa-manifest.json --directory .
bubblewrap build
```

The APK will be at `app/build/outputs/apk/release/app-release-signed.apk`

## Signing

The GitHub Actions workflow auto-generates a keystore. For local builds,
`bubblewrap build` will prompt you to create one on first run.

Keep the keystore file safe — you need the same key for all future updates.

## Digital Asset Links (REQUIRED for TWA)

For the TWA to open without a browser URL bar:
1. After building, get the signing key fingerprint
2. Host it at: `https://crazychessbattles.live/.well-known/assetlinks.json`

## Play Store

The signed APK can be uploaded to [Google Play Console](https://play.google.com/console)
($25 one-time developer fee).
