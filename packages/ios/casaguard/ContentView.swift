import SwiftUI
@preconcurrency import WebKit
import CoreLocation
import UserNotifications
import os.log
import AuthenticationServices

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Apple Sign-In Manager
class AppleSignInManager: ObservableObject {
    @Published var isSignedIn = false
    @Published var userID: String?
    @Published var email: String?
    @Published var fullName: PersonNameComponents?
    
    func signInWithApple() -> ASAuthorizationAppleIDRequest {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        return request
    }
}

class LocationViewModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var homeCoordinate: CLLocationCoordinate2D?
    private let locationManager = CLLocationManager()
    private var isRequestingLocation = false
    private var apiUrl: String {
        return EndpointManager.shared.userHomeStatesURL
    }
    private let userId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown_user"
    
    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        
        NotificationCenter.default.addObserver(self, 
            selector: #selector(environmentChanged), 
            name: Notification.Name("EnvironmentChanged"), 
            object: nil)
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc private func environmentChanged() {
        // Environment changed notification handler
    }
    
    func requestHomeLocation() {
        guard !isRequestingLocation else { return }
        isRequestingLocation = true
        
        let status = locationManager.authorizationStatus
        if status == .notDetermined {
            locationManager.requestAlwaysAuthorization()
        } else if status == .denied || status == .restricted {
            sendNotification(title: "Error", body: "Location services are disabled. Please enable them in settings.")
            isRequestingLocation = false
            return
        } else {
            locationManager.requestLocation()
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            locationManager.requestLocation()
        } else if status == .denied || status == .restricted {
            sendNotification(title: "Error", body: "Location services are disabled. Please enable them in settings.")
            isRequestingLocation = false
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        homeCoordinate = locations.first?.coordinate
        if homeCoordinate != nil {
            HomeLocationManager.shared.setHomeLocation { _ in }
            updateUserHomeState(state: "home")
        } else {
            sendNotification(title: "Error", body: "Failed to get location.")
        }
        isRequestingLocation = false
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        homeCoordinate = nil
        sendNotification(title: "Error", body: "Failed to get location: \(error.localizedDescription)")
        isRequestingLocation = false
    }
    
    private func sendNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString,
                                            content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
    
    private func updateUserHomeState(state: String) {
        guard let url = URL(string: apiUrl) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "userId": userId,
            "homeId": "720frontrd",
            "state": state
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            // Error handling silently
        }.resume()
    }
    
    func setHome() {
        updateUserHomeState(state: "home")
    }
    
    func setAway() {
        updateUserHomeState(state: "away")
    }
}

struct ContentView: View {
    @StateObject private var locationVM = LocationViewModel()
    @AppStorage("isHomeLocationSet") private var isHomeLocationSet: Bool = false
    @AppStorage("homeLatitude") private var homeLatitude: Double = 0.0
    @AppStorage("homeLongitude") private var homeLongitude: Double = 0.0
    @State private var refreshWebView: Int = 0
    @State private var signInStatusMessage: String?
    @State private var showSignInStatus: Bool = false
    @State private var webViewRef: WKWebView? = nil

    var body: some View {
        ZStack {
            WebView(
                url: "https://720frontrd.mymanor.click",
                refreshTrigger: refreshWebView,
                onWebViewCreated: { webView in
                    // Store webView reference for potential use
                    DispatchQueue.main.async {
                        self.webViewRef = webView
                    }
                }
            )
                .background(Color(.systemBackground))
                .edgesIgnoringSafeArea([.top])
            
            if !isHomeLocationSet {
                VStack {
                    Spacer()
                    Button("Set Home Location") {
                        locationVM.requestHomeLocation()
                    }
                    .padding()
                    .background(Color.blue.opacity(0.9))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                    .padding(.bottom, 40)
                }
                .background(Color.black.opacity(0.3))
            }

            if showSignInStatus, let message = signInStatusMessage {
                VStack {
                    Spacer()
                    Text(message)
                        .padding()
                        .background(message.lowercased().contains("success") ? Color.green.opacity(0.8) : Color.red.opacity(0.8))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                        .transition(.opacity.combined(with: .scale))
                        .padding(.bottom, 50)
                }
                .zIndex(1)
            }
        }
        .onAppear {
            // Check if home location is set
            if homeLatitude != 0.0 && homeLongitude != 0.0 {
                isHomeLocationSet = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("ApplicationDidBecomeActive"))) { _ in
            refreshWebView += 1
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("RefreshWebView"))) { _ in
            refreshWebView += 1
        }
        .onReceive(locationVM.$homeCoordinate) { coordinate in
            if let coordinate = coordinate {
                homeLatitude = coordinate.latitude
                homeLongitude = coordinate.longitude
                isHomeLocationSet = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("EnvironmentChanged"))) { _ in
            // Refresh WebView when environment changes
            refreshWebView += 1
        }
        .onReceive(NotificationCenter.default.publisher(for: WebView.Coordinator.appleSignInDidComplete)) { notification in
            let userInfo = notification.userInfo
            let userID = userInfo?["userID"] as? String ?? "N/A"
            let email = userInfo?["email"] as? String ?? "N/A"
            signInStatusMessage = "Apple Sign-In Success!\nUser ID: \(userID)\nEmail: \(email)"
            withAnimation {
                showSignInStatus = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                withAnimation {
                    showSignInStatus = false
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: WebView.Coordinator.appleSignInDidFail)) { notification in
            let errorMessage = notification.userInfo?["errorMessage"] as? String ?? "Unknown error"
            signInStatusMessage = "Apple Sign-In Failed:\n\(errorMessage)"
            withAnimation {
                showSignInStatus = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                withAnimation {
                    showSignInStatus = false
                }
            }
        }
    }
}

#if canImport(UIKit)
struct WebView: UIViewRepresentable {
    let url: String
    let refreshTrigger: Int
    let onWebViewCreated: (WKWebView) -> Void
    
    func makeUIView(context: Context) -> WKWebView {
        // Set up configuration with viewport adjustments
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        if #available(iOS 10.0, *) {
            configuration.mediaTypesRequiringUserActionForPlayback = []
        }
        
        // Create user script to fix viewport and positioning issues
        let source = """
        // Fix viewport height for iOS
        function fixViewportHeight() {
            let vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }
        
        // Initial setup
        document.documentElement.classList.add('ios-webview');
        fixViewportHeight();
        window.addEventListener('resize', fixViewportHeight);
        
        // Inject CSS fixes
        var style = document.createElement('style');
        style.innerHTML = `
            :root {
                --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
                --safe-area-inset-top: env(safe-area-inset-top, 0px);
                --bottom-nav-height: 70px;
            }
            
            /* Disable text selection globally */
            * {
                -webkit-user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
                user-select: none !important;
            }
            
            /* Re-enable selection for input fields and text areas where needed */
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text !important;
                user-select: text !important;
            }
            
            /* Prevent long press context menu */
            img, video, canvas {
                -webkit-touch-callout: none !important;
                -webkit-user-select: none !important;
                pointer-events: auto !important;
            }
            
            /* Viewport height fix for iOS */
            .min-h-screen {
                height: calc(var(--vh, 1vh) * 100);
                min-height: -webkit-fill-available;
            }
            
            /* Fixed navigation fixes */
            nav.fixed.bottom-0 {
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 9999 !important;
                padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important;
                background: linear-gradient(to bottom, rgba(25,25,25,0.95), rgba(15,15,15,0.95)) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                margin: 0 !important;
                transform: translateZ(0) !important;
                -webkit-transform: translateZ(0) !important;
                visibility: visible !important;
                opacity: 1 !important;
                display: flex !important;
                height: auto !important;
                min-height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom)) !important;
                border-top: 1px solid rgba(75, 75, 75, 0.3) !important;
            }
            
            /* Content area adjustments */
            .tab-content {
                margin-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom)) !important;
                -webkit-overflow-scrolling: touch;
            }
            
            /* Prevent overscroll issues */
            body {
                position: fixed;
                width: 100%;
                overflow-y: hidden;
            }
            
            /* Ensure scrollable content */
            .tab-content {
                overflow-y: auto;
                height: calc(100vh - var(--bottom-nav-height) - env(safe-area-inset-bottom));
                height: calc((var(--vh, 1vh) * 100) - var(--bottom-nav-height) - env(safe-area-inset-bottom));
            }
        `;
        document.head.appendChild(style);
        
        // Prevent context menu and text selection events
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        }, false);

        document.addEventListener('selectstart', function(e) {
            e.preventDefault();
            return false;
        }, false);
        
        // Force layout recalculation after slight delay
        setTimeout(() => {
            fixViewportHeight();
            window.scrollTo(0, 0);
        }, 100);
        
        // Ensure navigation is visible after page interactions
        document.addEventListener('scroll', () => {
            const nav = document.querySelector('nav.fixed.bottom-0');
            if (nav) {
                nav.style.transform = 'translateZ(0)';
                nav.style.visibility = 'visible';
                nav.style.display = 'flex';
            }
        }, { passive: true });
        """
        
        let script = WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        
        // Add script to configuration
        let userContentController = WKUserContentController()
        userContentController.addUserScript(script)
        configuration.userContentController = userContentController
        
        // Create and configure WebView
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = true
        webView.backgroundColor = UIColor.systemBackground
        webView.scrollView.backgroundColor = UIColor.systemBackground
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        
        // Store webView reference in coordinator for later use
        context.coordinator.webView = webView
        
        // Call the callback to provide the WebView reference to the parent
        onWebViewCreated(webView)
        
        // Add pull-to-refresh
        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
        
        // Load the URL
        if let validURL = URL(string: url) {
            let request = URLRequest(url: validURL)
            webView.load(request)
        }
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        if refreshTrigger > context.coordinator.lastRefresh {
            if let currentURL = webView.url {
                webView.load(URLRequest(url: currentURL))
            } else if let validURL = URL(string: url) {
                webView.load(URLRequest(url: validURL))
            }
            context.coordinator.lastRefresh = refreshTrigger
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
        var parent: WebView
        var lastRefresh: Int = 0
        weak var webView: WKWebView?
        private var isAppleSignInInProgress = false

        static let appleSignInDidComplete = Notification.Name("appleSignInDidComplete")
        static let appleSignInDidFail = Notification.Name("appleSignInDidFail")
        
        init(_ parent: WebView) {
            self.parent = parent
        }
        
        // MARK: - ASAuthorizationControllerPresentationContextProviding
        func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            #if canImport(UIKit)
            if #available(iOS 15.0, *) {
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let keyWindow = windowScene.windows.first(where: { $0.isKeyWindow }) {
                    return keyWindow
                }
            } else {
                // Fallback for iOS < 15.0
                if let keyWindow = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
                    return keyWindow
                }
            }
            return ASPresentationAnchor()
            #else
            return ASPresentationAnchor()
            #endif
        }
        
        @objc func handleRefresh(_ refreshControl: UIRefreshControl) {
            #if canImport(UIKit)
            if let validURL = URL(string: parent.url),
               let webView = refreshControl.superview as? WKWebView {
                webView.load(URLRequest(url: validURL))
            }
            refreshControl.endRefreshing()
            #endif
        }
        
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            #if canImport(UIKit)
            DispatchQueue.main.async {
                var rootViewController: UIViewController?
                if #available(iOS 15.0, *) {
                    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                       let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
                        rootViewController = window.rootViewController
                    }
                } else {
                    // Fallback for iOS < 15.0
                    if let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
                        rootViewController = window.rootViewController
                    }
                }
                
                guard let rootViewController = rootViewController else {
                    completionHandler()
                    return
                }
                
                let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                alertController.addAction(UIAlertAction(title: "OK", style: .default, handler: { _ in completionHandler() }))
                rootViewController.present(alertController, animated: true, completion: nil)
            }
            #else
            completionHandler()
            #endif
        }
        
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            #if canImport(UIKit)
            DispatchQueue.main.async {
                var rootViewController: UIViewController?
                if #available(iOS 15.0, *) {
                    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                       let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
                        rootViewController = window.rootViewController
                    }
                } else {
                    // Fallback for iOS < 15.0
                    if let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
                        rootViewController = window.rootViewController
                    }
                }
                
                guard let rootViewController = rootViewController else {
                    completionHandler(false)
                    return
                }
                
                let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                alertController.addAction(UIAlertAction(title: "OK", style: .default, handler: { _ in completionHandler(true) }))
                alertController.addAction(UIAlertAction(title: "Cancel", style: .cancel, handler: { _ in completionHandler(false) }))
                rootViewController.present(alertController, animated: true, completion: nil)
            }
            #else
            completionHandler(false)
            #endif
        }
        
        // MARK: - Navigation Handling
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            
            // Handle custom URL scheme for OAuth callback
            if url.scheme == "casaguard" {
                // Handle the OAuth callback in the app
                handleOAuthCallback(url: url)
                decisionHandler(.cancel)
                return
            }
            
            // Allow all other navigation (including Apple Sign-In OAuth flow)
            decisionHandler(.allow)
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Process OAuth callback URLs if needed
            if let url = webView.url {
                let isOAuthCallback = url.absoluteString.contains("/auth/callback") || url.absoluteString.contains("/auth/auth/callback")
                if isOAuthCallback {
                    // Fix doubled auth path if present (casaguard://auth/auth/callback -> casaguard://auth/callback)
                    var normalizedURL = url
                    if url.absoluteString.contains("/auth/auth/callback") {
                        if let fixedURL = URL(string: url.absoluteString.replacingOccurrences(of: "/auth/auth/callback", with: "/auth/callback")) {
                            normalizedURL = fixedURL
                        }
                    }
                    
                    // Extract and process URL parameters
                    let params = URLComponents(url: normalizedURL, resolvingAgainstBaseURL: false)?.queryItems?.reduce(into: [String: String]()) { result, item in
                        result[item.name] = item.value
                    }
                    
                    // Extract OAuth parameters
                    if let params = params {
                        if let code = params["code"] {
                            UserDefaults.standard.set(code, forKey: "oauth_code")
                        }
                        if let state = params["state"] {
                            UserDefaults.standard.set(state, forKey: "oauth_state")
                        }
                    }
                }
            }
        }
        
        // Add error handling for WebView loading failures
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            // Handle navigation failure
        }
        
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            // Handle provisional navigation failure
        }
        
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            // Handle the start of navigation
        }

        // MARK: - Removed Apple Sign-In Native Delegate Methods
        // Native Apple Sign-In methods removed - now using OAuth flow
        
        private func sendAuthDataToWebView(authData: [String: Any]) {
            guard let webView = self.webView else {
                return
            }
            
            guard let jsonData = try? JSONSerialization.data(withJSONObject: authData, options: []),
                  let jsonString = String(data: jsonData, encoding: .utf8) else {
                return
            }

            let script = """
                // Clear any in-progress flags
                sessionStorage.removeItem('native_apple_signin_in_progress');
                
                // Store the auth data for the web app to use
                localStorage.setItem('native_apple_signin_completed', 'true');
                sessionStorage.setItem('native_apple_signin_completed', 'true');
                localStorage.setItem('native_apple_signin_data', '\(jsonString)');
                
                // Try different ways to notify the web app
                
                // 1. Dispatch a custom event
                window.dispatchEvent(new CustomEvent('appleSignInComplete', { 
                    detail: \(jsonString) 
                }));
                
                // 2. Call any registered callback functions
                if (window.onAppleSignInComplete) {
                    window.onAppleSignInComplete(\(jsonString));
                }
                
                // 3. Check for specific auth handlers
                if (window.AuthService && typeof window.AuthService.handleNativeAppleSignIn === 'function') {
                    window.AuthService.handleNativeAppleSignIn(\(jsonString));
                }
            """
            
            webView.evaluateJavaScript(script) { result, error in
                // Ensure WebView navigation after a delay if needed
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    if let currentURL = webView.url?.absoluteString {
                        // If still on auth page after 3 seconds, force navigation to main app
                        if currentURL.lowercased().contains("auth") || 
                           currentURL.lowercased().contains("signin") || 
                           currentURL.lowercased().contains("login") {
                            let mainAppURL = EndpointManager.shared.webAppURL
                            if let url = URL(string: mainAppURL) {
                                webView.load(URLRequest(url: url))
                            }
                        }
                    }
                }
            }
        }
        
        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            // Reset the progress flag
            self.isAppleSignInInProgress = false
            
            let errorMessage = error.localizedDescription
            NotificationCenter.default.post(name: WebView.Coordinator.appleSignInDidFail, object: nil, userInfo: ["errorMessage": errorMessage])
            
            if let authError = error as? ASAuthorizationError {
                switch authError.code {
                case .canceled:
                    // User canceled
                    break
                case .failed, .invalidResponse, .notHandled, .unknown, .notInteractive:
                    // Handle other errors
                    break
                @unknown default:
                    // Handle future error cases
                    break
                }
            }
        }
        
        // Helper method to handle OAuth callbacks
        private func handleOAuthCallback(url: URL?) {
            guard let url = url else { return }
            
            // Extract the authorization code and state from the callback URL
            guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  let queryItems = components.queryItems else {
                return
            }
            
            var authCode: String?
            var state: String?
            
            for item in queryItems {
                switch item.name {
                case "code":
                    authCode = item.value
                case "state":
                    state = item.value
                default:
                    break
                }
            }
            
            // Save to UserDefaults for processing
            if let authCode = authCode {
                UserDefaults.standard.set(authCode, forKey: "oauth_code")
            }
            if let state = state {
                UserDefaults.standard.set(state, forKey: "oauth_state")
            }
            
            // Post notification for any observers
            NotificationCenter.default.post(name: Notification.Name("HandleOAuthCallback"), object: nil)
        }
    }
}
#endif

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
