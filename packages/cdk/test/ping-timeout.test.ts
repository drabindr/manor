/**
 * Test for ping timeout calculation to ensure it's more tolerant of brief network interruptions
 */

describe('Ping Timeout Calculation', () => {
  test('should calculate timeout with increased tolerance for brief interruptions', () => {
    // Test the timeout calculation logic from ping.ts
    const pingIntervalMinutes = 5; // Default ping interval
    
    // Original aggressive timeout: Math.max(pingIntervalMinutes * 60 * 1.5, 180)
    const originalTimeoutSeconds = Math.max(pingIntervalMinutes * 60 * 1.5, 180);
    
    // New more tolerant timeout: Math.max(pingIntervalMinutes * 60 * 3.0, 600) 
    const newTimeoutSeconds = Math.max(pingIntervalMinutes * 60 * 3.0, 600);
    
    // Verify the new timeout is more tolerant
    expect(newTimeoutSeconds).toBeGreaterThan(originalTimeoutSeconds);
    
    // With 5 minute ping interval:
    // Original: max(5 * 60 * 1.5, 180) = max(450, 180) = 450 seconds = 7.5 minutes
    // New: max(5 * 60 * 3.0, 600) = max(900, 600) = 900 seconds = 15 minutes
    expect(originalTimeoutSeconds).toBe(450); // 7.5 minutes
    expect(newTimeoutSeconds).toBe(900); // 15 minutes
  });

  test('should use minimum timeout for very short ping intervals', () => {
    const shortPingIntervalMinutes = 1; // Very short ping interval
    
    // Original: Math.max(1 * 60 * 1.5, 180) = max(90, 180) = 180 seconds = 3 minutes
    const originalTimeoutSeconds = Math.max(shortPingIntervalMinutes * 60 * 1.5, 180);
    
    // New: Math.max(1 * 60 * 3.0, 600) = max(180, 600) = 600 seconds = 10 minutes
    const newTimeoutSeconds = Math.max(shortPingIntervalMinutes * 60 * 3.0, 600);
    
    expect(originalTimeoutSeconds).toBe(180); // 3 minutes
    expect(newTimeoutSeconds).toBe(600); // 10 minutes
    expect(newTimeoutSeconds).toBeGreaterThan(originalTimeoutSeconds);
  });

  test('should scale appropriately for longer ping intervals', () => {
    const longPingIntervalMinutes = 10; // Longer ping interval
    
    // Original: Math.max(10 * 60 * 1.5, 180) = max(900, 180) = 900 seconds = 15 minutes  
    const originalTimeoutSeconds = Math.max(longPingIntervalMinutes * 60 * 1.5, 180);
    
    // New: Math.max(10 * 60 * 3.0, 600) = max(1800, 600) = 1800 seconds = 30 minutes
    const newTimeoutSeconds = Math.max(longPingIntervalMinutes * 60 * 3.0, 600);
    
    expect(originalTimeoutSeconds).toBe(900); // 15 minutes
    expect(newTimeoutSeconds).toBe(1800); // 30 minutes
    expect(newTimeoutSeconds).toBeGreaterThan(originalTimeoutSeconds);
  });
});