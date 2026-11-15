import SwiftUI
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
                remoteURLString: "https://skypulse.us",
                preferOfflineBundle: true
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
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
        locationManager.requestLocation()
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
               let url = URL(string: "sidestore://source?url=\(encoded)") {
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
        let js = "window.dispatchEvent(new CustomEvent('skypulse:location', { detail: { lat: \(latest.coordinate.latitude), lon: \(latest.coordinate.longitude) } }));"
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
                let escaped = url.absoluteString.replacingOccurrences(of: "'", with: "\\'")
                webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('skypulse:deeplink', { detail: '\(escaped)' }));", completionHandler: nil)
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
