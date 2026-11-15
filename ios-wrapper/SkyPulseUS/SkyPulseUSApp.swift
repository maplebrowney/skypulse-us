import SwiftUI

@main
struct SkyPulseUSApp: App {
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
