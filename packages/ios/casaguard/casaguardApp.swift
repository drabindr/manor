import SwiftUI
import UIKit
import UserNotifications
import os.log

@main
struct casaguardApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private let log = OSLog(subsystem: Bundle.main.bundleIdentifier!, category: "AppDelegate")
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        
        // Initialize managers
        _ = EndpointManager.shared
        _ = APNSManager.shared
        _ = HomeLocationManager.shared
        
        requestNotificationPermission { granted in
            if granted {
                self.registerForPushNotifications(application)
            }
        }
        
        requestCriticalAlertPermission()
        registerNotificationCategories()
        
        return true
    }
    
    private func requestNotificationPermission(completion: @escaping (Bool) -> Void) {
        let options: UNAuthorizationOptions = [.alert, .badge, .sound]
        UNUserNotificationCenter.current().requestAuthorization(options: options) { granted, error in
            DispatchQueue.main.async {
                completion(granted)
            }
        }
    }
    
    private func requestCriticalAlertPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound, .criticalAlert]) { _, _ in }
    }
    
    private func registerForPushNotifications(_ application: UIApplication) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
    }
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(tokenString, forKey: "APNSToken")
        APNSManager.shared.registerDeviceToken(tokenString)
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        os_log("Failed to register for remote notifications: %{public}@", log: self.log, type: .error, error.localizedDescription)
    }
    
    private func registerNotificationCategories() {
        let disarmAction = UNNotificationAction(
            identifier: "DISARM_ACTION",
            title: "Disarm",
            options: .foreground)
        
        let homeArrivalCategory = UNNotificationCategory(
            identifier: "HOME_ARRIVAL_CATEGORY",
            actions: [disarmAction],
            intentIdentifiers: [],
            options: [])
        
        UNUserNotificationCenter.current().setNotificationCategories([homeArrivalCategory])
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.actionIdentifier == "DISARM_ACTION" {
            let locationVM = LocationViewModel()
            locationVM.setHome()
        }
        
        let userInfo = response.notification.request.content.userInfo
        if !userInfo.isEmpty {
            if let actionType = userInfo["actionType"] as? String {
                handleNotificationAction(actionType, userInfo: userInfo)
            }
        }
        
        completionHandler()
    }
    
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable : Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        if let actionType = userInfo["actionType"] as? String {
            handleNotificationAction(actionType, userInfo: userInfo)
            completionHandler(.newData)
        } else {
            completionHandler(.noData)
        }
    }
    
    private func handleNotificationAction(_ actionType: String, userInfo: [AnyHashable: Any]) {
        switch actionType {
        case "setHome":
            let locationVM = LocationViewModel()
            locationVM.setHome()
        case "setAway":
            let locationVM = LocationViewModel()
            locationVM.setAway()
        case "refreshWebView":
            NotificationCenter.default.post(name: Notification.Name("RefreshWebView"), object: nil)
        default:
            break
        }
    }
    
    // MARK: - URL Handling for Apple Sign-In
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        // Handle Apple Sign-In callback URLs
        if url.scheme == "com.manor.signin" || url.scheme == "com.manor.signin.apple" {
            // Notify any listeners about the URL callback
            NotificationCenter.default.post(
                name: NSNotification.Name("AppleSignInCallback"),
                object: nil,
                userInfo: ["url": url]
            )
            
            return true
        }
        
        // Handle OAuth callback URLs with casaguard:// scheme
        if url.scheme == "casaguard" {
            // Fix doubled auth path if present (casaguard://auth/auth/callback -> casaguard://auth/callback)
            var processedURL = url
            if url.absoluteString.contains("/auth/auth/callback") {
                if let fixedURL = URL(string: url.absoluteString.replacingOccurrences(of: "/auth/auth/callback", with: "/auth/callback")) {
                    processedURL = fixedURL
                }
            }
            
            // Handle directly here instead of posting notification
            guard let components = URLComponents(url: processedURL, resolvingAgainstBaseURL: false),
                  let queryItems = components.queryItems else {
                return false
            }
            
            var authCode: String?
            var state: String?
            var error: String?
            var errorDescription: String?
            
            for item in queryItems {
                switch item.name {
                case "code":
                    authCode = item.value
                case "state":
                    state = item.value
                case "error":
                    error = item.value
                case "error_description":
                    errorDescription = item.value
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
            
            return true
        }
        
        // Handle universal links for Apple Sign-In
        if url.host == "appleid.apple.com" || url.host == "idmsa.apple.com" {
            return true
        }
        
        return false
    }
    
    // Handle universal links
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            
            // Handle Apple Sign-In universal links
            if url.host == "appleid.apple.com" || url.host == "idmsa.apple.com" {
                // Notify any listeners about the universal link
                NotificationCenter.default.post(
                    name: NSNotification.Name("AppleSignInUniversalLink"),
                    object: nil,
                    userInfo: ["url": url]
                )
                
                return true
            }
        }
        
        return false
    }
}
