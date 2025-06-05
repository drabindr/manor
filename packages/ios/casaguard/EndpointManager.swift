import Foundation
import os.log

/**
 * Manages API endpoints for the application, allowing switching between production and test environments.
 * 
 * This class centralizes all URL management and provides notification when environments change
 * so components can update their endpoint references accordingly.
 * 
 * Environment settings are managed through the iOS Settings app rather than in-app UI.
 */
class EndpointManager {
    static let shared = EndpointManager()
    
    private let log = OSLog(subsystem: Bundle.main.bundleIdentifier ?? "com.manor.signin", category: "EndpointManager")
    
    enum Environment: String {
        case production = "Production"
        case test = "Test"
    }
    
    private init() {
        // Initialize currentEnvironment with a default value first
        currentEnvironment = .production
        
        // Register default settings
        registerDefaultSettings()
        
        // Read initial environment setting from UserDefaults (populated from Settings bundle)
        let savedEnv = UserDefaults.standard.string(forKey: "selected_environment") ?? Environment.production.rawValue
        currentEnvironment = savedEnv == Environment.test.rawValue ? .test : .production
        
        // Add observer for settings changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(userDefaultsDidChange),
            name: UserDefaults.didChangeNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    private func registerDefaultSettings() {
        // Set default values for settings
        let defaultValues: [String: Any] = [
            "selected_environment": Environment.production.rawValue
        ]
        UserDefaults.standard.register(defaults: defaultValues)
    }
    
    @objc private func userDefaultsDidChange() {
        // Check if environment setting has changed
        let newEnvString = UserDefaults.standard.string(forKey: "selected_environment") ?? Environment.production.rawValue
        let newEnv: Environment = newEnvString == Environment.test.rawValue ? .test : .production
        
        if newEnv != currentEnvironment {
            os_log("Environment setting changed in Settings app to: %{public}@", log: log, type: .info, newEnvString)
            currentEnvironment = newEnv
        }
    }
    
    private(set) var currentEnvironment: Environment {
        didSet {
            // Post notification for components to update URLs
            NotificationCenter.default.post(name: Notification.Name("EnvironmentChanged"), object: nil)
            
            os_log("Environment changed to: %{public}@", log: log, type: .info, currentEnvironment.rawValue)
        }
    }
    
    // PRODUCTION ENDPOINTS
    private let prodWebAppURL = "https://720frontrd.mymanor.click/"
    private let prodUserHomeStatesURL = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod/user-home-states"
    private let prodAPNSBaseURL = "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/apns"
    
    // TEST ENDPOINTS - Replace with actual test endpoints when available
    private let testWebAppURL = "http://casa-guard-webapp-test.s3-website-us-east-1.amazonaws.com/" // Placeholder
    private let testUserHomeStatesURL = "https://test-api.example.com/user-home-states" // Placeholder
    private let testAPNSBaseURL = "https://test-api.example.com/apns" // Placeholder
    
    // Toggle environment
    func toggleEnvironment() {
        currentEnvironment = (currentEnvironment == .production) ? .test : .production
    }
    
    // Set environment directly
    func setEnvironment(_ environment: Environment) {
        guard environment != currentEnvironment else { return }
        currentEnvironment = environment
    }
    
    // URL Getters
    var webAppURL: String {
        return currentEnvironment == .production ? prodWebAppURL : testWebAppURL
    }
    
    var userHomeStatesURL: String {
        return currentEnvironment == .production ? prodUserHomeStatesURL : testUserHomeStatesURL
    }
    
    var apnsBaseURL: String {
        return currentEnvironment == .production ? prodAPNSBaseURL : testAPNSBaseURL
    }
}
