import Foundation
import CoreLocation
import UserNotifications
import os.log
import UIKit
import AudioToolbox

class HomeLocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = HomeLocationManager()
    
    private let locationManager = CLLocationManager()
    private var completion: ((CLLocationCoordinate2D?) -> Void)?
    private let userId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown_user"
    private let log = OSLog(subsystem: Bundle.main.bundleIdentifier!, category: "HomeLocationManager")

    private override init() {
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
        // Environment changed for HomeLocationManager
    }
    
    func setHomeLocation(completion: @escaping (CLLocationCoordinate2D?) -> Void) {
        self.completion = completion
        requestPermissionsAndStartUpdating()
    }
    
    private func requestPermissionsAndStartUpdating() {
        if locationManager.authorizationStatus != .authorizedAlways {
            locationManager.requestAlwaysAuthorization()
        }
        locationManager.startUpdatingLocation()
    }
    
    private func startMonitoringHomeRegion(center: CLLocationCoordinate2D) {
        let region = CLCircularRegion(center: center, radius: 200, identifier: "HomeRegion")
        region.notifyOnEntry = true
        region.notifyOnExit = true
        locationManager.startMonitoring(for: region)
    }
    
    private func sendNotification(title: String, body: String, isCritical: Bool = false, withVibration: Bool = false) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = isCritical ? UNNotificationSound.defaultCritical : .default
        if isCritical {
            content.interruptionLevel = .critical
        }
        content.categoryIdentifier = "HOME_ARRIVAL_CATEGORY"
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                os_log("Error adding notification: %{public}@", type: .error, error.localizedDescription)
            } else if withVibration {
                DispatchQueue.main.async {
                    // Vibration pattern
                    for i in 0..<100 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.3) {
                            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                        }
                    }
                    
                    // Play multiple alert sounds
                    for i in 0..<100 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 1.5) {
                            AudioServicesPlaySystemSound(1005) // System sound for alert
                        }
                    }
                    
                    // Send follow-up notifications
                    self.scheduleRepeatedNotifications(title: title, body: body, count: 3)
                }
            }
        }
    }
    
    // Schedule multiple notifications a few seconds apart
    private func scheduleRepeatedNotifications(title: String, body: String, count: Int) {
        for i in 0..<count {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = "\(body) - Reminder \(i+1)"
            content.sound = .defaultCritical
            content.interruptionLevel = .timeSensitive
            
            // Trigger notification after a delay
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: Double(i+1) * 30, repeats: false)
            let request = UNNotificationRequest(identifier: "reminder-\(UUID().uuidString)", content: content, trigger: trigger)
            
            UNUserNotificationCenter.current().add(request) { error in
                if let error = error {
                    os_log("Error adding repeated notification: %{public}@", type: .error, error.localizedDescription)
                }
            }
        }
    }
    
    private func updateUserHomeState(state: String) {
        guard let url = URL(string: EndpointManager.shared.userHomeStatesURL) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "userId": userId,
            "homeId": "720frontrd",
            "state": state
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error = error {
                os_log("Error updating user home state: %{public}@", type: .error, error.localizedDescription)
            }
        }.resume()
    }
    
    private func checkHomeArmedStatus(completion: @escaping (Bool) -> Void) {
        // Create URL for checking home status - assuming there's an endpoint to get current state
        guard let baseURL = URL(string: EndpointManager.shared.userHomeStatesURL) else { 
            os_log("Invalid base URL for checking home armed status", log: self.log, type: .error)
            completion(false) // Default to not armed if URL is invalid
            return 
        }
        
        // Construct GET request URL with query parameters
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "userId", value: userId),
            URLQueryItem(name: "homeId", value: "720frontrd")
        ]
        
        guard let url = components?.url else {
            os_log("Failed to construct URL for checking home armed status", log: self.log, type: .error)
            completion(false) // Default to not armed if URL construction fails
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // TODO: Add authentication headers when available
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                os_log("Error checking home armed status: %{public}@", log: self.log, type: .error, error.localizedDescription)
                completion(false) // Default to not armed on error - safer approach
                return
            }
            
            // Check for authentication error specifically
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
                    os_log("Authentication required for checking home status. Defaulting to not armed for safety.", log: self.log, type: .info)
                    completion(false) // Default to not armed when auth is required - safer approach
                    return
                }
            }
            
            guard let data = data else {
                os_log("No data received when checking home armed status", log: self.log, type: .error)
                completion(false) // Default to not armed if no data
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                    // Check for authentication error in response body
                    if let message = json["message"] as? String, 
                       message.contains("Authentication") || message.contains("Token") {
                        os_log("Authentication error in response: %{public}@. Defaulting to not armed.", log: self.log, type: .info, message)
                        completion(false) // Default to not armed when auth is required
                        return
                    }
                    
                    // If we get a valid state response
                    if let state = json["state"] as? String {
                        // Assume "armed" or "away" means the home security system is armed
                        let isArmed = (state == "armed" || state == "away")
                        completion(isArmed)
                    } else {
                        os_log("No state field in response. Defaulting to not armed.", log: self.log, type: .info)
                        completion(false) // Default to not armed if state is unclear
                    }
                } else {
                    os_log("Invalid JSON response when checking home armed status", log: self.log, type: .error)
                    completion(false) // Default to not armed if JSON is invalid
                }
            } catch {
                os_log("Error parsing home status response: %{public}@", log: self.log, type: .error, error.localizedDescription)
                completion(false) // Default to not armed on parsing error
            }
        }.resume()
    }
    
    // MARK: - CLLocationManagerDelegate
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let currentLoc = locations.first else { return }
        locationManager.stopUpdatingLocation()
        startMonitoringHomeRegion(center: currentLoc.coordinate)
        completion?(currentLoc.coordinate)
        completion = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        os_log("Location update failed: %{public}@", type: .error, error.localizedDescription)
        completion?(nil)
        completion = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == "HomeRegion" else { return }
        
        // Check if home is armed before determining notification type
        checkHomeArmedStatus { [weak self] isArmed in
            DispatchQueue.main.async {
                if isArmed {
                    // Home is armed - send critical notification with vibrations
                    self?.sendNotification(title: "Home", body: "Arriving", isCritical: true, withVibration: true)
                } else {
                    // Home is not armed - send basic non-urgent notification
                    self?.sendNotification(title: "Home", body: "Arriving", isCritical: false, withVibration: false)
                }
                
                // Always update the home state regardless of armed status
                self?.updateUserHomeState(state: "home")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == "HomeRegion" else { return }
        sendNotification(title: "Home", body: "Departing")
        updateUserHomeState(state: "away")
    }
}
