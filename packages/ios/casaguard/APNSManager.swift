import Foundation
import UIKit
import os.log

class APNSManager {
    static let shared = APNSManager()
    
    private var apiBaseURL: String {
        return EndpointManager.shared.apnsBaseURL
    }
    private let userId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown_user"
    private let log = OSLog(subsystem: "com.manor.signin.apns", category: "APNSManager")
    
    private init() {
        NotificationCenter.default.addObserver(self, 
            selector: #selector(environmentChanged), 
            name: Notification.Name("EnvironmentChanged"), 
            object: nil)
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc private func environmentChanged() {
        // Environment changed, updating endpoint
    }
    
    func registerDeviceToken(_ token: String) {
        guard let url = URL(string: "\(apiBaseURL)/register") else {
            os_log("Invalid URL for token registration", log: log, type: .error)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "userId": userId,
            "deviceToken": token
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted])
        } catch {
            os_log("Failed to serialize device token request: %{public}@", log: log, type: .error, error.localizedDescription)
            return
        }
        
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let error = error {
                os_log("Error registering device token: %{public}@", log: self?.log ?? OSLog.default, type: .error, error.localizedDescription)
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                os_log("No HTTP response received", log: self?.log ?? OSLog.default, type: .error)
                return
            }
            
            if (200...299).contains(httpResponse.statusCode) {
                UserDefaults.standard.set(Date(), forKey: "APNSTokenRegistrationDate")
                UserDefaults.standard.set(token, forKey: "APNSToken")
            } else {
                os_log("Failed to register device token. Status code: %{public}d", log: self?.log ?? OSLog.default, type: .error, httpResponse.statusCode)
                if let data = data, let errorResponse = String(data: data, encoding: .utf8) {
                    os_log("Error response: %{public}@", log: self?.log ?? OSLog.default, type: .error, errorResponse)
                }
            }
        }
        
        task.resume()
    }
    
    func refreshRegistrationIfNeeded() {
        if let lastRegistration = UserDefaults.standard.object(forKey: "APNSTokenRegistrationDate") as? Date,
           let token = UserDefaults.standard.string(forKey: "APNSToken"),
           Date().timeIntervalSince(lastRegistration) > (7 * 24 * 60 * 60) {
            registerDeviceToken(token)
        }
    }
}