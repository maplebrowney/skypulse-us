# SkyPulse US

Live US flight tracker with real-time ADS-B airspace radar, airline insignias, terminal & gate schedules, dark/light themes, and an automated unsigned SideStore / LiveContainer iOS `.ipa` build pipeline.

## Features

- **US Airspace Map**: Interactive national CONUS and 160 nm terminal sector radar with live aircraft headings, jetways, and click-to-inspect transponder telemetry.
- **Scheduled Flights & Gate Boards**: Real-time departures and arrivals with terminal, concourse, gate numbers, baggage claim carousels, and NOAA METAR runway weather.
- **iOS Wrapper (`ios-wrapper/`)**: SwiftUI + `WKWebView` iOS project generated via XcodeGen (`project.yml`) with offline `WebBundle` embedding, CoreLocation bridge, and LiveContainer/SideStore-compatible entitlements.
- **Automated SideStore / LiveContainer `.ipa` Workflow (`.github/workflows/build-ios-ipa.yml`)**: Compiles the Vite web bundle, generates the Xcode project on `macos-15`, archives and strips signatures for unsigned `.ipa` distribution (or optionally signs via `.p12` secrets), updates `sidestore-source.json`, and publishes a GitHub Release.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```
