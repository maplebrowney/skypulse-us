import type { GeneratedFileEntry, IosWrapperConfig } from '../types/skypulse.ts';

export const DEFAULT_IOS_CONFIG: IosWrapperConfig = {
  appName: 'SkyPulse US',
  productName: 'SkyPulseUS',
  bundleId: 'com.skypulse.us',
  version: '1.0.0',
  buildNumber: '1',
  urlScheme: 'skypulse',
  minIosVersion: '16.0',
  signingMode: 'sidestore-unsigned',
  webBundleMode: 'hybrid-offline',
  remoteAppUrl: 'https://skypulse.us',
  githubOwner: 'your-github-username',
  githubRepo: 'skypulse-us',
  githubBranch: 'main',
  teamId: '',
  enableLocation: true,
  enableBackgroundRefresh: false,
  enableSideStoreSource: true,
  liveContainerCompatible: true,
  tintColor: '#0284C7',
};

function sanitizeProductName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : 'SkyPulseUS';
}

export function generateIosArtifacts(rawConfig: IosWrapperConfig): GeneratedFileEntry[] {
  const product = sanitizeProductName(rawConfig.productName || rawConfig.appName);
  const owner = rawConfig.githubOwner.trim() || 'your-github-username';
  const repo = rawConfig.githubRepo.trim() || 'skypulse-us';
  const branch = rawConfig.githubBranch.trim() || 'main';
  const remoteUrl = rawConfig.remoteAppUrl.trim() || 'https://skypulse.us';
  const bundleId = rawConfig.bundleId.trim() || 'com.skypulse.us';
  const scheme = rawConfig.urlScheme.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'skypulse';
  const minIos = rawConfig.minIosVersion || '16.0';
  const version = rawConfig.version || '1.0.0';
  const buildNumber = rawConfig.buildNumber || '1';
  const tintColor = rawConfig.tintColor || '#0284C7';
  const teamId = rawConfig.teamId.trim();

  const projectYml = `name: ${product}
options:
  bundleIdPrefix: ${bundleId.split('.').slice(0, -1).join('.') || 'com.skypulse'}
  deploymentTarget:
    iOS: "${minIos}"
  xcodeVersion: "16.0"
  createIntermediateGroups: true

settings:
  base:
    MARKETING_VERSION: "${version}"
    CURRENT_PROJECT_VERSION: "${buildNumber}"
    SWIFT_VERSION: "5.0"
    TARGETED_DEVICE_FAMILY: "1,2"
    ENABLE_BITCODE: NO
    ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
    SUPPORTS_MACCATALYST: NO
    DEAD_CODE_STRIPPING: YES

targets:
  ${product}:
    type: application
    platform: iOS
    deploymentTarget: "${minIos}"
    sources:
      - path: ${product}
        excludes:
          - "**/*.plist"
          - "**/*.entitlements"
    resources:
      - path: ${product}/Assets.xcassets
      - path: ${product}/WebBundle
        type: folder
    info:
      path: ${product}/Info.plist
    entitlements:
      path: ${product}/${product}.entitlements
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${bundleId}
        PRODUCT_NAME: ${product}
        INFOPLIST_KEY_CFBundleDisplayName: "${rawConfig.appName}"
        CODE_SIGN_STYLE: ${rawConfig.signingMode === 'apple-cert-p12' ? 'Manual' : 'Automatic'}${
          teamId ? `\n        DEVELOPMENT_TEAM: "${teamId}"` : ''
        }
`;

  const appSwift = `import SwiftUI

@main
struct ${product}App: App {
    @State private var deepLinkURL: URL?

    var body: some Scene {
        WindowGroup {
            ContentView(deepLinkURL: $deepLinkURL)
                .ignoresSafeArea(.container, edges: .bottom)
                .onOpenURL { url in
                    deepLinkURL = url
                }
        }
    }
}
`;

  const webViewSwift = `import SwiftUI
import WebKit
import CoreLocation
import UIKit

struct ContentView: View {
    @Binding var deepLinkURL: URL?
    @StateObject private var bridge = SkyPulseBridge()

    var body: some View {
        ZStack(alignment: .top) {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()

            WebViewContainer(
                bridge: bridge,
                deepLinkURL: $deepLinkURL,
                remoteURLString: "${remoteUrl}",
                preferOfflineBundle: ${rawConfig.webBundleMode === 'hybrid-offline' ? 'true' : 'false'}
            )
        }
    }
}

final class SkyPulseBridge: NSObject, ObservableObject, CLLocationManagerDelegate, WKScriptMessageHandler {
    private let locationManager = CLLocationManager()
    weak var webView: WKWebView?

    override init() {
        super.init()
        locationManager.delegate = self
    }

    func requestLocationIfAllowed() {
        ${
          rawConfig.enableLocation
            ? `if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        locationManager.requestLocation()`
            : `// Location entitlement disabled in SkyPulse US Builder`
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "skyPulseNative",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "haptic":
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        case "requestLocation":
            requestLocationIfAllowed()
        case "openSideStore":
            if let sourceURL = body["sourceURL"] as? String,
               let encoded = sourceURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let url = URL(string: "sidestore://source?url=\\(encoded)") {
                DispatchQueue.main.async {
                    UIApplication.shared.open(url)
                }
            }
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        let js = "window.dispatchEvent(new CustomEvent('skypulse:location', { detail: { lat: \\(latest.coordinate.latitude), lon: \\(latest.coordinate.longitude) } }));"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Silently ignore transient GPS failures; web layer falls back to US hub presets
    }
}

struct WebViewContainer: UIViewRepresentable {
    @ObservedObject var bridge: SkyPulseBridge
    @Binding var deepLinkURL: URL?
    let remoteURLString: String
    let preferOfflineBundle: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.userContentController.add(bridge, name: "skyPulseNative")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = true
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        bridge.webView = webView
        loadInitialContent(into: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if let url = deepLinkURL {
            DispatchQueue.main.async {
                let escaped = url.absoluteString.replacingOccurrences(of: "'", with: "\\\\'")
                webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('skypulse:deeplink', { detail: '\\(escaped)' }));", completionHandler: nil)
                self.deepLinkURL = nil
            }
        }
    }

    private func loadInitialContent(into webView: WKWebView) {
        if preferOfflineBundle,
           let bundleIndex = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebBundle") {
            let bundleDir = bundleIndex.deletingLastPathComponent()
            webView.loadFileURL(bundleIndex, allowingReadAccessTo: bundleDir)
            return
        }

        if let remoteURL = URL(string: remoteURLString) {
            webView.load(URLRequest(url: remoteURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 20))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let parent: WebViewContainer

        init(_ parent: WebViewContainer) {
            self.parent = parent
        }

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            parent.bridge.webView?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                sender.endRefreshing()
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if url.scheme == "sidestore" || url.scheme == "altstore" || url.scheme == "livecontainer" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            if navigationAction.targetFrame == nil, url.scheme?.hasPrefix("http") == true {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}
`;

  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleDisplayName</key>
	<string>${rawConfig.appName}</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLName</key>
			<string>${bundleId}</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${scheme}</string>
			</array>
		</dict>
	</array>
	<key>LSApplicationQueriesSchemes</key>
	<array>
		<string>sidestore</string>
		<string>altstore</string>
		<string>livecontainer</string>
	</array>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<false/>
		<key>NSExceptionDomains</key>
		<dict>
			<key>airplanes.live</key>
			<dict>
				<key>NSIncludesSubdomains</key>
				<true/>
			</dict>
			<key>opensky-network.org</key>
			<dict>
				<key>NSIncludesSubdomains</key>
				<true/>
			</dict>
			<key>aviationweather.gov</key>
			<dict>
				<key>NSIncludesSubdomains</key>
				<true/>
			</dict>
		</dict>
	</dict>${
    rawConfig.enableLocation
      ? `
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>${rawConfig.appName} uses your location to center the US airspace map on nearby airports and live ADS-B traffic.</string>`
      : ''
  }${
    rawConfig.enableBackgroundRefresh && !rawConfig.liveContainerCompatible
      ? `
	<key>UIBackgroundModes</key>
	<array>
		<string>fetch</string>
	</array>`
      : ''
  }
	<key>UILaunchScreen</key>
	<dict>
		<key>UIColorName</key>
		<string>AccentColor</string>
	</dict>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>arm64</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
</dict>
</plist>
`;

  // LiveContainer & SideStore require zero restricted entitlements for free Apple ID / container injection
  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

  const exportOptions = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>${rawConfig.signingMode === 'apple-cert-p12' ? 'ad-hoc' : 'development'}</string>
	<key>signingStyle</key>
	<string>${rawConfig.signingMode === 'apple-cert-p12' ? 'manual' : 'automatic'}</string>${
    teamId
      ? `
	<key>teamID</key>
	<string>${teamId}</string>`
      : ''
  }
	<key>compileBitcode</key>
	<false/>
	<key>stripSwiftSymbols</key>
	<true/>
</dict>
</plist>
`;

  const assetsContents = `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;

  const appIconContents = `{
  "images" : [
    {
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;

  const packageScript = `#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${product}"
VERSION="${version}"
BUILD_DIR="build"
ARCHIVE_PATH="\${BUILD_DIR}/\${APP_NAME}.xcarchive"
PAYLOAD_DIR="\${BUILD_DIR}/Payload"
IPA_NAME="\${APP_NAME}-SideStore-LiveContainer.ipa"
IPA_PATH="\${BUILD_DIR}/\${IPA_NAME}"

echo "==> Packaging unsigned \${APP_NAME} v\${VERSION} for SideStore & LiveContainer"
mkdir -p "\${PAYLOAD_DIR}"
rm -rf "\${PAYLOAD_DIR:?}/"*

APP_BUNDLE="\${ARCHIVE_PATH}/Products/Applications/\${APP_NAME}.app"
if [ ! -d "\${APP_BUNDLE}" ]; then
  echo "Error: Expected .app bundle at \${APP_BUNDLE}" >&2
  exit 1
fi

cp -R "\${APP_BUNDLE}" "\${PAYLOAD_DIR}/"
# Strip embedded provisioning profiles & code signature for clean SideStore/LiveContainer re-signing
rm -rf "\${PAYLOAD_DIR}/\${APP_NAME}.app/_CodeSignature" "\${PAYLOAD_DIR}/\${APP_NAME}.app/embedded.mobileprovision"

(cd "\${BUILD_DIR}" && zip -qry "\${IPA_NAME}" Payload)

SHA256=$(shasum -a 256 "\${IPA_PATH}" | awk '{print $1}')
SIZE_BYTES=$(wc -c < "\${IPA_PATH}" | tr -d ' ')

echo "IPA_PATH=\${IPA_PATH}"
echo "SHA256=\${SHA256}"
echo "SIZE_BYTES=\${SIZE_BYTES}"
`;

  const workflowYml = `name: Build SideStore / LiveContainer iOS IPA

on:
  push:
    branches:
      - "${branch}"
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      signing_mode:
        description: "IPA packaging & signing mode"
        required: true
        default: "${rawConfig.signingMode}"
        type: choice
        options:
          - sidestore-unsigned
          - apple-cert-p12
      version_tag:
        description: "Release version tag (defaults to ${version})"
        required: false
        default: "${version}"
        type: string

permissions:
  contents: write

jobs:
  build-web-bundle:
    name: Build ${rawConfig.appName} Web Bundle
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install dependencies & build Vite dist
        run: |
          if [ -f package-lock.json ]; then npm ci; else npm install; fi
          npm run build

      - name: Upload web dist artifact
        uses: actions/upload-artifact@v4
        with:
          name: skypulse-web-dist
          path: dist/

  build-ios-ipa:
    name: Build Unsigned SideStore / LiveContainer .ipa
    needs: build-web-bundle
    runs-on: macos-15
    env:
      PRODUCT_NAME: "${product}"
      BUNDLE_ID: "${bundleId}"
      APP_VERSION: "\${{ github.event.inputs.version_tag || '${version}' }}"
      SIGNING_MODE: "\${{ github.event.inputs.signing_mode || '${rawConfig.signingMode}' }}"
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download built web bundle into ios-wrapper
        uses: actions/download-artifact@v4
        with:
          name: skypulse-web-dist
          path: ios-wrapper/\${{ env.PRODUCT_NAME }}/WebBundle

      - name: Select latest Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable

      - name: Install XcodeGen & prepare AppIcon
        run: |
          brew install xcodegen
          ICON_SRC=$(ls src/assets/images/skypulse_app_icon_*.jpg 2>/dev/null | head -n 1 || true)
          if [ -n "$ICON_SRC" ]; then
            sips -s format png -z 1024 1024 "$ICON_SRC" --out "ios-wrapper/\${PRODUCT_NAME}/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
          fi

      - name: Generate Xcode project
        working-directory: ios-wrapper
        run: |
          xcodegen generate
          chmod +x scripts/package-sidestore-ipa.sh

      - name: Import Apple Signing Certificate (optional .p12 mode)
        if: \${{ env.SIGNING_MODE == 'apple-cert-p12' && secrets.APPLE_P12_BASE64 != '' }}
        env:
          APPLE_P12_BASE64: \${{ secrets.APPLE_P12_BASE64 }}
          APPLE_P12_PASSWORD: \${{ secrets.APPLE_P12_PASSWORD }}
          APPLE_PROVISION_BASE64: \${{ secrets.APPLE_PROVISION_BASE64 }}
          KEYCHAIN_PASSWORD: \${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db
          P12_PATH=$RUNNER_TEMP/certificate.p12
          PP_PATH=$RUNNER_TEMP/profile.mobileprovision

          echo "$APPLE_P12_BASE64" | base64 --decode > "$P12_PATH"
          echo "$APPLE_PROVISION_BASE64" | base64 --decode > "$PP_PATH"

          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security import "$P12_PATH" -P "$APPLE_P12_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
          security list-keychain -d user -s "$KEYCHAIN_PATH"
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

          mkdir -p ~/Library/MobileDevice/Provisioning\\ Profiles
          UUID=$(/usr/libexec/PlistBuddy -c 'Print :UUID' /dev/stdin <<< $(security cms -D -i "$PP_PATH"))
          cp "$PP_PATH" ~/Library/MobileDevice/Provisioning\\ Profiles/"$UUID.mobileprovision"

      - name: Archive Signed IPA (when .p12 secrets present)
        if: \${{ env.SIGNING_MODE == 'apple-cert-p12' && secrets.APPLE_P12_BASE64 != '' }}
        working-directory: ios-wrapper
        run: |
          xcodebuild archive \\
            -project "\${PRODUCT_NAME}.xcodeproj" \\
            -scheme "\${PRODUCT_NAME}" \\
            -configuration Release \\
            -destination "generic/platform=iOS" \\
            -archivePath "build/\${PRODUCT_NAME}.xcarchive" \\
            MARKETING_VERSION="\${APP_VERSION}"

          xcodebuild -exportArchive \\
            -archivePath "build/\${PRODUCT_NAME}.xcarchive" \\
            -exportOptionsPlist "ExportOptions.plist" \\
            -exportPath "build/ipa-export"

          mv build/ipa-export/*.ipa "build/\${PRODUCT_NAME}-SideStore-LiveContainer.ipa"

      - name: Archive Unsigned IPA for SideStore & LiveContainer
        if: \${{ env.SIGNING_MODE != 'apple-cert-p12' || secrets.APPLE_P12_BASE64 == '' }}
        working-directory: ios-wrapper
        run: |
          xcodebuild archive \\
            -project "\${PRODUCT_NAME}.xcodeproj" \\
            -scheme "\${PRODUCT_NAME}" \\
            -configuration Release \\
            -destination "generic/platform=iOS" \\
            -archivePath "build/\${PRODUCT_NAME}.xcarchive" \\
            CODE_SIGN_IDENTITY="" \\
            CODE_SIGNING_REQUIRED=NO \\
            CODE_SIGNING_ALLOWED=NO \\
            AD_HOC_CODE_SIGNING_ALLOWED=YES \\
            MARKETING_VERSION="\${APP_VERSION}"

          ./scripts/package-sidestore-ipa.sh

      - name: Compute IPA metadata & update sidestore-source.json
        id: ipa_meta
        run: |
          IPA_FILE="ios-wrapper/build/\${PRODUCT_NAME}-SideStore-LiveContainer.ipa"
          SHA256=$(shasum -a 256 "$IPA_FILE" | awk '{print $1}')
          SIZE_BYTES=$(wc -c < "$IPA_FILE" | tr -d ' ')
          RELEASE_TAG="v\${APP_VERSION}"
          DOWNLOAD_URL="https://github.com/\${{ github.repository }}/releases/download/\${RELEASE_TAG}/\${PRODUCT_NAME}-SideStore-LiveContainer.ipa"

          echo "sha256=$SHA256" >> "$GITHUB_OUTPUT"
          echo "size=$SIZE_BYTES" >> "$GITHUB_OUTPUT"
          echo "release_tag=$RELEASE_TAG" >> "$GITHUB_OUTPUT"
          echo "ipa_file=$IPA_FILE" >> "$GITHUB_OUTPUT"

          python3 - <<PYEOF
          import json, datetime
          path = "sidestore-source.json"
          with open(path, "r") as f:
              data = json.load(f)
          today = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
          app = data["apps"][0]
          app["version"] = "\${APP_VERSION}"
          app["versionDate"] = today
          app["downloadURL"] = "$DOWNLOAD_URL"
          app["size"] = int("$SIZE_BYTES")
          app["sha256"] = "$SHA256"
          app["versions"] = [{
              "version": "\${APP_VERSION}",
              "date": today,
              "localizedDescription": "Unsigned SideStore & LiveContainer IPA built from ${branch}.",
              "downloadURL": "$DOWNLOAD_URL",
              "size": int("$SIZE_BYTES"),
              "sha256": "$SHA256",
              "minOSVersion": "${minIos}"
          }]
          with open(path, "w") as f:
              json.dump(data, f, indent=2)
              f.write("\\n")
          PYEOF

      - name: Upload SideStore / LiveContainer .ipa artifact
        uses: actions/upload-artifact@v4
        with:
          name: \${{ env.PRODUCT_NAME }}-SideStore-LiveContainer-IPA
          path: \${{ steps.ipa_meta.outputs.ipa_file }}

      - name: Publish GitHub Release with .ipa
        uses: softprops/action-gh-release@v2
        with:
          tag_name: \${{ steps.ipa_meta.outputs.release_tag }}
          name: "${rawConfig.appName} v\${{ env.APP_VERSION }} (SideStore / LiveContainer IPA)"
          body: |
            Automated iOS build for **${rawConfig.appName}** (\`${bundleId}\`).

            - **Compatible with**: SideStore (on-device Anisette re-sign) & LiveContainer (unsigned guest app)
            - **SideStore Source URL**: \`https://raw.githubusercontent.com/\${{ github.repository }}/${branch}/sidestore-source.json\`
            - **SHA-256**: \`\${{ steps.ipa_meta.outputs.sha256 }}\`
            - **Size**: \`\${{ steps.ipa_meta.outputs.size }}\` bytes
          files: \${{ steps.ipa_meta.outputs.ipa_file }}

      - name: Commit updated sidestore-source.json
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add sidestore-source.json
          if ! git diff --cached --quiet; then
            git commit -m "chore(sidestore): update manifest for v\${APP_VERSION} [skip ci]"
            git push origin HEAD:${branch}
          fi
`;

  const sideStoreSource = JSON.stringify(
    {
      name: `${rawConfig.appName} SideStore Source`,
      subtitle: 'Live US Flight Tracker & Airspace Telemetry for SideStore / LiveContainer',
      description: `Automated SideStore & LiveContainer source feed for ${rawConfig.appName}.`,
      identifier: `${bundleId}.source`,
      website: `https://github.com/${owner}/${repo}`,
      tintColor,
      apps: [
        {
          name: rawConfig.appName,
          bundleIdentifier: bundleId,
          developerName: owner,
          subtitle: 'Live US Flights, Airspace Map & Terminal/Gate Boards',
          localizedDescription:
            'Real-time US flight tracking with live ADS-B airspace map, airline insignias, terminal/gate schedules, and SideStore/LiveContainer compatibility.',
          iconURL: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/ios-wrapper/${product}/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`,
          tintColor,
          category: 'navigation',
          version,
          versionDate: new Date().toISOString(),
          versionDescription: 'Unsigned SideStore & LiveContainer release with bundled web app.',
          downloadURL: `https://github.com/${owner}/${repo}/releases/download/v${version}/${product}-SideStore-LiveContainer.ipa`,
          size: 4850000,
          minOSVersion: minIos,
          versions: [
            {
              version,
              date: new Date().toISOString(),
              localizedDescription: 'Automated GitHub Actions unsigned SideStore/LiveContainer IPA.',
              downloadURL: `https://github.com/${owner}/${repo}/releases/download/v${version}/${product}-SideStore-LiveContainer.ipa`,
              size: 4850000,
              minOSVersion: minIos,
            },
          ],
          appPermissions: {
            entitlements: [],
            privacy: rawConfig.enableLocation
              ? {
                  NSLocationWhenInUseUsageDescription: `${rawConfig.appName} uses your location to center the US airspace map on nearby airports.`,
                }
              : {},
          },
        },
      ],
    },
    null,
    2
  ) + '\n';

  return [
    {
      path: `ios-wrapper/project.yml`,
      language: 'yaml',
      category: 'ios-wrapper',
      description: 'XcodeGen specification generating the iOS Xcode project on macOS CI runners.',
      content: projectYml,
    },
    {
      path: `ios-wrapper/${product}/${product}App.swift`,
      language: 'swift',
      category: 'ios-wrapper',
      description: 'SwiftUI @main entry point with deep-link URL scheme support.',
      content: appSwift,
    },
    {
      path: `ios-wrapper/${product}/WebViewContainer.swift`,
      language: 'swift',
      category: 'ios-wrapper',
      description: 'WKWebView wrapper with offline WebBundle, CoreLocation bridge, haptics, and pull-to-refresh.',
      content: webViewSwift,
    },
    {
      path: `ios-wrapper/${product}/Info.plist`,
      language: 'xml',
      category: 'ios-wrapper',
      description: 'iOS Info.plist with ATS exceptions and SideStore/LiveContainer URL query schemes.',
      content: infoPlist,
    },
    {
      path: `ios-wrapper/${product}/${product}.entitlements`,
      language: 'xml',
      category: 'ios-wrapper',
      description: 'Clean empty entitlements compatible with LiveContainer & SideStore free Apple ID re-signing.',
      content: entitlements,
    },
    {
      path: `ios-wrapper/${product}/Assets.xcassets/Contents.json`,
      language: 'json',
      category: 'ios-wrapper',
      description: 'Asset catalog root manifest.',
      content: assetsContents,
    },
    {
      path: `ios-wrapper/${product}/Assets.xcassets/AppIcon.appiconset/Contents.json`,
      language: 'json',
      category: 'ios-wrapper',
      description: 'Universal 1024x1024 iOS AppIcon asset specification.',
      content: appIconContents,
    },
    {
      path: `ios-wrapper/ExportOptions.plist`,
      language: 'xml',
      category: 'ios-wrapper',
      description: 'xcodebuild archive export options for optional .p12 signing workflows.',
      content: exportOptions,
    },
    {
      path: `ios-wrapper/scripts/package-sidestore-ipa.sh`,
      language: 'bash',
      category: 'ios-wrapper',
      description: 'Strips _CodeSignature/provisioning and zips Payload/*.app into unsigned SideStore/LiveContainer .ipa.',
      content: packageScript,
    },
    {
      path: `.github/workflows/build-ios-ipa.yml`,
      language: 'yaml',
      category: 'workflow',
      description: 'GitHub Actions workflow compiling Web dist, running XcodeGen, packaging unsigned SideStore/LiveContainer .ipa, and publishing Release.',
      content: workflowYml,
    },
    {
      path: `sidestore-source.json`,
      language: 'json',
      category: 'sidestore',
      description: 'AltStore / SideStore v2 JSON source feed for one-tap installation.',
      content: sideStoreSource,
    },
  ];
}
