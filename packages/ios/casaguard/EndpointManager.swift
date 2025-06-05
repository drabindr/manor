import Foundation
import os.log

/**
 * Manages API endpoints for the application, allowing switching between production and test environments.
 * 
 * This class centralizes all URL management and provides notification when environments change
 * so components can update their endpoint references accordingly.
 * 
 * Environment settings are managed through the iOS Settings app rather than in-app UI.
 * 
 * OPTIMIZATION: Includes connection pooling and request coalescing for better performance
 */
class EndpointManager {
    static let shared = EndpointManager()
    
    private let log = OSLog(subsystem: Bundle.main.bundleIdentifier ?? "com.manor.signin", category: "EndpointManager")
    
    // OPTIMIZATION: Connection pooling for better network performance
    private lazy var urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 4
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 10.0
        config.timeoutIntervalForResource = 30.0
        config.waitsForConnectivity = true
        config.networkServiceType = .responsiveData
        config.httpShouldUsePipelining = true
        
        return URLSession(configuration: config)
    }()
    
    // OPTIMIZATION: Request coalescing to prevent duplicate simultaneous requests
    private var pendingRequests: [String: URLSessionDataTask] = [:]
    private let requestQueue = DispatchQueue(label: "com.manor.endpoint.requests", attributes: .concurrent)
    
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
    
    // OPTIMIZATION: Optimized network request method with connection pooling and request coalescing
    func performOptimizedRequest(to url: URL, completion: @escaping (Result<Data, Error>) -> Void) -> URLSessionDataTask? {
        let requestKey = url.absoluteString
        
        return requestQueue.sync(flags: .barrier) {
            // Check if there's already a pending request for this URL
            if let existingTask = pendingRequests[requestKey] {
                os_log("Request coalesced for URL: %{public}@", log: log, type: .debug, url.absoluteString)
                return existingTask
            }
            
            // Create new optimized request
            var request = URLRequest(url: url)
            request.setValue("keep-alive", forHTTPHeaderField: "Connection")
            request.setValue("gzip, deflate, br", forHTTPHeaderField: "Accept-Encoding")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("Manor-iOS/1.0", forHTTPHeaderField: "User-Agent")
            
            let task = urlSession.dataTask(with: request) { [weak self] data, response, error in
                // Remove from pending requests
                self?.requestQueue.async(flags: .barrier) {
                    self?.pendingRequests.removeValue(forKey: requestKey)
                }
                
                if let error = error {
                    completion(.failure(error))
                } else if let data = data {
                    completion(.success(data))
                } else {
                    completion(.failure(NSError(domain: "EndpointManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data received"])))
                }
            }
            
            // Store the pending request
            pendingRequests[requestKey] = task
            task.resume()
            
            os_log("Started optimized request for URL: %{public}@", log: log, type: .debug, url.absoluteString)
            return task
        }
    }
    
    // OPTIMIZATION: Batch request method for multiple endpoints
    func performBatchRequests(urls: [URL], completion: @escaping ([Result<Data, Error>]) -> Void) {
        let group = DispatchGroup()
        var results: [Result<Data, Error>] = Array(repeating: .failure(NSError(domain: "NotSet", code: -1)), count: urls.count)
        
        for (index, url) in urls.enumerated() {
            group.enter()
            _ = performOptimizedRequest(to: url) { result in
                results[index] = result
                group.leave()
            }
        }
        
        group.notify(queue: .main) {
            completion(results)
        }
    }
    
    // OPTIMIZATION: Preload critical endpoints to establish connections
    func preloadCriticalEndpoints() {
        let criticalURLs = [
            URL(string: userHomeStatesURL),
            URL(string: apnsBaseURL)
        ].compactMap { $0 }
        
        for url in criticalURLs {
            // Create a lightweight HEAD request to establish connection
            var request = URLRequest(url: url)
            request.httpMethod = "HEAD"
            request.setValue("keep-alive", forHTTPHeaderField: "Connection")
            
            urlSession.dataTask(with: request) { _, _, _ in
                // Ignore response, just establishing connection
            }.resume()
        }
        
        os_log("Preloaded %d critical endpoint connections", log: log, type: .info, criticalURLs.count)
    }
}
