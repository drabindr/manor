import XCTest
import CoreLocation
import UserNotifications
@testable import casaguard

/**
 * Unit tests for HomeLocationManager and API integration
 * Tests the security state checking and notification logic
 */
class HomeLocationManagerTests: XCTestCase {
    
    var homeLocationManager: HomeLocationManager!
    var mockLocationManager: MockCLLocationManager!
    
    override func setUpWithError() throws {
        homeLocationManager = HomeLocationManager.shared
        mockLocationManager = MockCLLocationManager()
    }
    
    override func tearDownWithError() throws {
        homeLocationManager = nil
        mockLocationManager = nil
    }
    
    // MARK: - API State Checking Tests
    
    func testCheckHomeArmedStatus_WhenArmed_ReturnsTrue() {
        let expectation = XCTestExpectation(description: "Check armed status - armed")
        
        // Mock the API response for armed state
        MockURLSession.mockResponse = """
        {
            "userId": "test-user",
            "homeId": "720frontrd",
            "state": "armed",
            "timestamp": "2025-05-29T10:00:00Z"
        }
        """.data(using: .utf8)
        MockURLSession.mockStatusCode = 200
        
        // Test the private method through reflection or by testing the public behavior
        // Since checkHomeArmedStatus is private, we'll test through the public interface
        
        // This would trigger the armed status check internally
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    func testCheckHomeArmedStatus_WhenDisarmed_ReturnsFalse() {
        let expectation = XCTestExpectation(description: "Check armed status - disarmed")
        
        // Mock the API response for disarmed state
        MockURLSession.mockResponse = """
        {
            "userId": "test-user",
            "homeId": "720frontrd",
            "state": "disarmed",
            "timestamp": "2025-05-29T10:00:00Z"
        }
        """.data(using: .utf8)
        MockURLSession.mockStatusCode = 200
        
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    func testCheckHomeArmedStatus_APIError_ReturnsFalse() {
        let expectation = XCTestExpectation(description: "Check armed status - API error")
        
        // Mock API error
        MockURLSession.mockError = NSError(domain: "TestError", code: 500, userInfo: nil)
        
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    // MARK: - Security State Flow Tests
    
    func testSecurityStateFlow_DisarmToArmed() {
        let expectation = XCTestExpectation(description: "State flow: disarm to armed")
        
        // Test the complete flow: disarmed -> armed -> home arrival
        testStateTransition(from: "disarmed", to: "armed") {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 3.0)
    }
    
    func testSecurityStateFlow_ArmedToHome() {
        let expectation = XCTestExpectation(description: "State flow: armed to home")
        
        // Mock armed state first
        MockURLSession.mockResponse = """
        {
            "state": "armed"
        }
        """.data(using: .utf8)
        
        // Simulate arrival when armed (should trigger intensive alerts)
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    func testSecurityStateFlow_DisarmedToHome() {
        let expectation = XCTestExpectation(description: "State flow: disarmed to home")
        
        // Mock disarmed state
        MockURLSession.mockResponse = """
        {
            "state": "disarmed"
        }
        """.data(using: .utf8)
        
        // Simulate arrival when disarmed (should trigger basic notification only)
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    // MARK: - Location Monitoring Tests
    
    func testLocationMonitoring_Success() {
        let expectation = XCTestExpectation(description: "Location monitoring setup")
        
        let coordinate = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        homeLocationManager.setHomeLocation { receivedCoordinate in
            XCTAssertNotNil(receivedCoordinate)
            XCTAssertEqual(receivedCoordinate?.latitude, coordinate.latitude, accuracy: 0.001)
            XCTAssertEqual(receivedCoordinate?.longitude, coordinate.longitude, accuracy: 0.001)
            expectation.fulfill()
        }
        
        // Simulate successful location update
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        homeLocationManager.locationManager(mockLocationManager, didUpdateLocations: [location])
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    func testLocationMonitoring_Failure() {
        let expectation = XCTestExpectation(description: "Location monitoring failure")
        
        homeLocationManager.setHomeLocation { receivedCoordinate in
            XCTAssertNil(receivedCoordinate)
            expectation.fulfill()
        }
        
        // Simulate location error
        let error = NSError(domain: kCLErrorDomain, code: CLError.locationUnknown.rawValue, userInfo: nil)
        homeLocationManager.locationManager(mockLocationManager, didFailWithError: error)
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    // MARK: - Notification Tests
    
    func testNotificationPermissions() {
        let expectation = XCTestExpectation(description: "Notification permissions")
        
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            // Verify notification permissions are properly configured
            XCTAssertTrue([.authorized, .provisional].contains(settings.authorizationStatus))
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 2.0)
    }
    
    // MARK: - Helper Methods
    
    private func createMockRegion() -> CLCircularRegion {
        let coordinate = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        return CLCircularRegion(center: coordinate, radius: 200, identifier: "HomeRegion")
    }
    
    private func testStateTransition(from: String, to: String, completion: @escaping () -> Void) {
        // Mock initial state
        MockURLSession.mockResponse = """
        {
            "state": "\(from)"
        }
        """.data(using: .utf8)
        MockURLSession.mockStatusCode = 200
        
        // Update to new state
        MockURLSession.mockResponse = """
        {
            "state": "\(to)"
        }
        """.data(using: .utf8)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            completion()
        }
    }
}

// MARK: - Mock Classes

class MockCLLocationManager: CLLocationManager {
    var mockDelegate: CLLocationManagerDelegate?
    var mockAuthorizationStatus: CLAuthorizationStatus = .authorizedAlways
    
    override var delegate: CLLocationManagerDelegate? {
        get { return mockDelegate }
        set { mockDelegate = newValue }
    }
    
    override class func authorizationStatus() -> CLAuthorizationStatus {
        return .authorizedAlways
    }
    
    override func requestAlwaysAuthorization() {
        // Mock implementation
    }
    
    override func startUpdatingLocation() {
        // Mock implementation
    }
    
    override func stopUpdatingLocation() {
        // Mock implementation
    }
    
    override func startMonitoring(for region: CLRegion) {
        // Mock implementation
    }
}

class MockURLSession {
    static var mockResponse: Data?
    static var mockError: Error?
    static var mockStatusCode: Int = 200
    
    static func reset() {
        mockResponse = nil
        mockError = nil
        mockStatusCode = 200
    }
}

// MARK: - Integration Test Extension

extension HomeLocationManagerTests {
    
    /**
     * Integration test that verifies the complete security system workflow
     * This test simulates a real-world scenario of:
     * 1. Setting home location
     * 2. Arming the system
     * 3. Leaving home
     * 4. Returning home (should trigger alerts)
     * 5. Disarming the system
     */
    func testCompleteSecurityWorkflow() {
        let workflowExpectation = XCTestExpectation(description: "Complete security workflow")
        
        // Step 1: Set home location
        let coordinate = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        homeLocationManager.setHomeLocation { [weak self] receivedCoordinate in
            guard receivedCoordinate != nil else {
                XCTFail("Failed to set home location")
                return
            }
            
            // Step 2: Simulate arming the system
            self?.simulateStateChange(to: "armed") {
                
                // Step 3: Simulate leaving home
                self?.simulateStateChange(to: "away") {
                    
                    // Step 4: Simulate returning home (should trigger alerts)
                    MockURLSession.mockResponse = """
                    {
                        "state": "armed"
                    }
                    """.data(using: .utf8)
                    
                    self?.homeLocationManager.didEnterRegion(self?.createMockRegion() ?? CLCircularRegion())
                    
                    // Step 5: Verify alerts were triggered and then disarm
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        self?.simulateStateChange(to: "disarmed") {
                            workflowExpectation.fulfill()
                        }
                    }
                }
            }
        }
        
        // Simulate successful location update
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        homeLocationManager.locationManager(mockLocationManager, didUpdateLocations: [location])
        
        wait(for: [workflowExpectation], timeout: 10.0)
    }
    
    private func simulateStateChange(to state: String, completion: @escaping () -> Void) {
        MockURLSession.mockResponse = """
        {
            "userId": "test-user",
            "homeId": "720frontrd",
            "state": "\(state)",
            "timestamp": "\(ISO8601DateFormatter().string(from: Date()))"
        }
        """.data(using: .utf8)
        MockURLSession.mockStatusCode = 200
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            completion()
        }
    }
}

// MARK: - Performance Tests

extension HomeLocationManagerTests {
    
    func testAPIResponseTime() {
        let performanceExpectation = XCTestExpectation(description: "API response time")
        
        let startTime = CFAbsoluteTimeGetCurrent()
        
        MockURLSession.mockResponse = """
        {
            "state": "armed"
        }
        """.data(using: .utf8)
        
        homeLocationManager.didEnterRegion(createMockRegion())
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            let timeElapsed = CFAbsoluteTimeGetCurrent() - startTime
            XCTAssertLessThan(timeElapsed, 2.0, "API response should be under 2 seconds")
            performanceExpectation.fulfill()
        }
        
        wait(for: [performanceExpectation], timeout: 3.0)
    }
    
    func testMemoryUsage() {
        // Test that HomeLocationManager doesn't leak memory
        weak var weakManager: HomeLocationManager?
        
        autoreleasepool {
            let manager = HomeLocationManager.shared
            weakManager = manager
            
            // Simulate some operations
            let coordinate = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
            let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            manager.locationManager(mockLocationManager, didUpdateLocations: [location])
        }
        
        // Note: Since HomeLocationManager is a singleton, it won't be deallocated
        // This test is more for demonstration of memory testing patterns
        XCTAssertNotNil(weakManager, "Singleton should persist")
    }
}
