import SwiftUI
import UIKit
import UserNotifications
import BackgroundTasks
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
        
        // OPTIMIZATION: Enable background app refresh for better data freshness
        if #available(iOS 13.0, *) {
            registerBackgroundTasks()
        }
        
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
    
    // MARK: - Background App Refresh Optimization
    @available(iOS 13.0, *)
    private func registerBackgroundTasks() {
        // Register background task for refreshing critical data
        BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.manor.refresh", using: nil) { task in
            self.handleBackgroundRefresh(task: task as! BGAppRefreshTask)
        }
        
        os_log("Background tasks registered", log: self.log, type: .info)
    }
    
    @available(iOS 13.0, *)
    private func handleBackgroundRefresh(task: BGAppRefreshTask) {
        os_log("Starting background refresh", log: self.log, type: .info)
        
        // Schedule the next background refresh
        scheduleBackgroundRefresh()
        
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        
        // Perform background data refresh
        refreshCriticalData { success in
            task.setTaskCompleted(success: success)
        }
    }
    
    @available(iOS 13.0, *)
    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: "com.manor.refresh")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
        
        do {
            try BGTaskScheduler.shared.submit(request)
            os_log("Background refresh scheduled", log: self.log, type: .info)
        } catch {
            os_log("Failed to schedule background refresh: %{public}@", log: self.log, type: .error, error.localizedDescription)
        }
    }
    
    private func refreshCriticalData(completion: @escaping (Bool) -> Void) {
        // Pre-fetch critical data that will improve app load time when user returns
        let group = DispatchGroup()
        var hasErrors = false
        
        // Refresh alarm state
        group.enter()
        refreshAlarmState { success in
            if !success { hasErrors = true }
            group.leave()
        }
        
        // Refresh device states
        group.enter()
        refreshDeviceStates { success in
            if !success { hasErrors = true }
            group.leave()
        }
        
        // Refresh camera status
        group.enter()
        refreshCameraStatus { success in
            if !success { hasErrors = true }
            group.leave()
        }
        
        group.notify(queue: .main) {
            completion(!hasErrors)
            os_log("Background refresh completed with %{public}@ errors", log: self.log, type: .info, hasErrors ? "some" : "no")
        }
    }
    
    private func refreshAlarmState(completion: @escaping (Bool) -> Void) {
        // Make a lightweight request to check alarm state
        guard let url = URL(string: "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/system/state") else {
            completion(false)
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            completion(error == nil && data != nil)
        }.resume()
    }
    
    private func refreshDeviceStates(completion: @escaping (Bool) -> Void) {
        // Check device states to populate cache
        let group = DispatchGroup()
        var success = true
        
        // TP-Link devices
        group.enter()
        if let url = URL(string: "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/tplink/devices") {
            URLSession.shared.dataTask(with: url) { data, response, error in
                if error != nil { success = false }
                group.leave()
            }.resume()
        } else {
            group.leave()
        }
        
        // Hue devices
        group.enter()
        if let url = URL(string: "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/hue/lights") {
            URLSession.shared.dataTask(with: url) { data, response, error in
                if error != nil { success = false }
                group.leave()
            }.resume()
        } else {
            group.leave()
        }
        
        group.notify(queue: .main) {
            completion(success)
        }
    }
    
    private func refreshCameraStatus(completion: @escaping (Bool) -> Void) {
        // Check camera availability
        guard let url = URL(string: "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/devices/list") else {
            completion(false)
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            completion(error == nil && data != nil)
        }.resume()
    }
    
    func applicationDidEnterBackground(_ application: UIApplication) {
        // Schedule background refresh when app enters background
        if #available(iOS 13.0, *) {
            scheduleBackgroundRefresh()
        }
    }
    
    func applicationWillEnterForeground(_ application: UIApplication) {
        // App is returning to foreground - trigger a quick refresh
        NotificationCenter.default.post(name: Notification.Name("RefreshWebView"), object: nil)
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
