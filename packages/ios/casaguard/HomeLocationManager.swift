import Foundation
import CoreLocation
import UserNotifications
import os.log
import UIKit
import AudioToolbox

class HomeLocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = HomeLocationManager()
    
    private let locationManager = CLLocationManager()
    private let userId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown_user"
    private let log = OSLog(subsystem: Bundle.main.bundleIdentifier!, category: "HomeLocationManager")
    
    // Hardcoded home location for 720 Front Rd, Pickering, Ontario
    private let homeLocation = CLLocationCoordinate2D(latitude: 43.8192224, longitude: -79.0870727)
    private let homeRegionRadius: CLLocationDistance = 200

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        
        // Request location permissions
        if locationManager.authorizationStatus != .authorizedAlways {
            locationManager.requestAlwaysAuthorization()
        }
        
        // Start monitoring the hardcoded home location immediately
        startMonitoringHomeRegion(center: homeLocation)
        
        // Register user in occupancy database on app startup
        registerUserInDatabase()
        
        NotificationCenter.default.addObserver(self, 
            selector: #selector(environmentChanged), 
            name: Notification.Name("EnvironmentChanged"), 
            object: nil)
        
        // Listen for authentication completion to re-register user
        NotificationCenter.default.addObserver(self,
            selector: #selector(authenticationCompleted),
            name: Notification.Name("HandleOAuthCallback"),
            object: nil)
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc private func environmentChanged() {
        // Re-register user when environment changes
        registerUserInDatabase()
    }
    
    @objc private func authenticationCompleted() {
        // Re-register user when authentication completes
        registerUserInDatabase()
    }
    
    private func registerUserInDatabase() {
        // Get current location to determine initial home state
        locationManager.requestLocation()
    }
    
    private func determineHomeStateAndRegister() {
        guard let currentLocation = locationManager.location else {
            print("No location available for registration")
            return
        }
        
        let homeLocationCL = CLLocation(latitude: homeLocation.latitude, longitude: homeLocation.longitude)
        let distance = currentLocation.distance(from: homeLocationCL)
        let isHome = distance <= homeRegionRadius
        let homeState = isHome ? "home" : "away"
        
        print("Registering user in database with initial state: \(homeState)")
        print("Distance from home: \(distance) meters")
        
        // Call the backend to register/update user
        updateUserHomeState(state: homeState)
    }
    
    // Public method to register user after authentication
    func registerUserAfterAuth(userId: String? = nil, displayName: String? = nil) {
        print("User authentication completed - registering in occupancy database")
        
        // Check if we have location permissions
        guard locationManager.authorizationStatus == .authorizedAlways || 
              locationManager.authorizationStatus == .authorizedWhenInUse else {
            print("Location permissions not granted - requesting location for user registration")
            locationManager.requestLocation()
            return
        }
        
        // Try to get current location, or use last known location
        if let currentLocation = locationManager.location {
            let homeLocationCL = CLLocation(latitude: homeLocation.latitude, longitude: homeLocation.longitude)
            let distance = currentLocation.distance(from: homeLocationCL)
            let isHome = distance <= homeRegionRadius
            let homeState = isHome ? "home" : "away"
            
            print("Registering authenticated user with state: \(homeState) (distance: \(distance)m)")
            
            // Use provided userId and displayName if available
            if let userId = userId {
                updateUserHomeState(state: homeState, userId: userId, displayName: displayName)
            } else {
                updateUserHomeState(state: homeState)
            }
        } else {
            print("No location available - requesting location for user registration")
            locationManager.requestLocation()
        }
    }
    
    private func startMonitoringHomeRegion(center: CLLocationCoordinate2D) {
        let region = CLCircularRegion(center: center, radius: homeRegionRadius, identifier: "HomeRegion")
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
    
    func updateUserHomeState(state: String) {
        guard let url = URL(string: EndpointManager.shared.userHomeStatesURL) else { 
            os_log("Invalid URL for updating user home state", log: self.log, type: .error)
            return 
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "userId": userId,
            "homeId": "720frontrd",
            "state": state
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        os_log("Updating user home state to: %{public}@", log: self.log, type: .info, state)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                os_log("Error updating user home state: %{public}@", log: self.log, type: .error, error.localizedDescription)
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                os_log("Location update response status: %{public}d", log: self.log, type: .info, httpResponse.statusCode)
                
                if httpResponse.statusCode == 403 {
                    os_log("Authentication required for location update - user may not be logged in with Google", log: self.log, type: .info)
                    
                    // Send notification to user that they need to log in
                    DispatchQueue.main.async {
                        self.sendNotification(title: "Authentication Required", body: "Please log in to track your location", isCritical: false, withVibration: false)
                    }
                } else if httpResponse.statusCode == 200 {
                    os_log("Location update successful: %{public}@", log: self.log, type: .info, state)
                } else {
                    os_log("Location update failed with status: %{public}d", log: self.log, type: .error, httpResponse.statusCode)
                }
            }
        }.resume()
    }
    
    // Overloaded method to update user home state with custom userId and displayName
    func updateUserHomeState(state: String, userId: String, displayName: String? = nil) {
        guard let url = URL(string: EndpointManager.shared.userHomeStatesURL) else { 
            os_log("Invalid URL for updating user home state", log: self.log, type: .error)
            return 
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Try to get the authentication token from UserDefaults (stored by the web app)
        if let idToken = UserDefaults.standard.string(forKey: "authenticated_user_id_token") {
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            os_log("Using stored ID token for authentication", log: self.log, type: .info)
        } else {
            os_log("No ID token found - proceeding without authentication", log: self.log, type: .info)
        }
        
        var body: [String: Any] = [
            "userId": userId,
            "homeId": "720frontrd",
            "state": state
        ]
        
        // Add displayName if provided
        if let displayName = displayName {
            body["displayName"] = displayName
        }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])
        
        os_log("Updating user home state to: %{public}@ for userId: %{public}@ with displayName: %{public}@", 
               log: self.log, type: .info, state, userId, displayName ?? "nil")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                os_log("Error updating user home state: %{public}@", log: self.log, type: .error, error.localizedDescription)
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                os_log("Location update response status: %{public}d", log: self.log, type: .info, httpResponse.statusCode)
                
                if httpResponse.statusCode == 403 {
                    os_log("Authentication required for location update - user may not be logged in with Google", log: self.log, type: .info)
                    
                    // Send notification to user that they need to log in
                    DispatchQueue.main.async {
                        self.sendNotification(title: "Authentication Required", body: "Please log in to track your location", isCritical: false, withVibration: false)
                    }
                } else if httpResponse.statusCode == 200 {
                    os_log("Location update successful: %{public}@ for user: %{public}@", log: self.log, type: .info, state, userId)
                } else {
                    os_log("Location update failed with status: %{public}d", log: self.log, type: .error, httpResponse.statusCode)
                }
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
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == "HomeRegion" else { return }
        
        os_log("Entered home region - user arrived home", log: self.log, type: .info)
        
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
                
                // Always try to update the home state
                self?.updateUserHomeState(state: "home")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == "HomeRegion" else { return }
        
        os_log("Exited home region - user left home", log: self.log, type: .info)
        
        sendNotification(title: "Home", body: "Departing")
        updateUserHomeState(state: "away")
    }
    
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        os_log("Location authorization changed: %{public}d", log: self.log, type: .info, status.rawValue)
        
        switch status {
        case .authorizedAlways:
            os_log("Location authorization: Always - starting region monitoring", log: self.log, type: .info)
            startMonitoringHomeRegion(center: homeLocation)
        case .authorizedWhenInUse:
            os_log("Location authorization: When in use - requesting always authorization", log: self.log, type: .info)
            locationManager.requestAlwaysAuthorization()
        case .denied, .restricted:
            os_log("Location authorization denied/restricted", log: self.log, type: .error)
        case .notDetermined:
            os_log("Location authorization not determined - requesting authorization", log: self.log, type: .info)
            locationManager.requestAlwaysAuthorization()
        @unknown default:
            os_log("Unknown location authorization status", log: self.log, type: .error)
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        os_log("Location manager failed with error: %{public}@", log: self.log, type: .error, error.localizedDescription)
    }
    
    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        os_log("Region monitoring failed for region %{public}@: %{public}@", log: self.log, type: .error, region?.identifier ?? "unknown", error.localizedDescription)
    }
    
    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        os_log("Started monitoring region: %{public}@", log: self.log, type: .info, region.identifier)
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let currentLocation = locations.last else { return }
        
        let homeLocationCL = CLLocation(latitude: homeLocation.latitude, longitude: homeLocation.longitude)
        let distance = currentLocation.distance(from: homeLocationCL)
        let isHome = distance <= homeRegionRadius
        
        os_log("Location updated: %{public}@, Distance from home: %.2f meters, State: %{public}@", 
               log: self.log, type: .info, 
               currentLocation.description, distance, isHome ? "home" : "away")
        
        // Call the registration method when location is updated
        determineHomeStateAndRegister()
    }
}
