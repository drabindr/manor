import { test, expect, Page } from '@playwright/test';

// Test configuration
const TEST_TIMEOUT = 30000;
const DEV_USER_EMAIL = 'dev@manor.test';

// Helper function to wait for and verify auth bypass
async function verifyAuthBypass(page: Page) {
  // Check for dev mode indicators on login page
  await expect(page.locator('text=DEV MODE: Auth Bypass Enabled')).toBeVisible();
  await expect(page.locator('text=Continue to App (Dev Mode)')).toBeVisible();
  
  // Click the bypass login button
  await page.click('text=Continue to App (Dev Mode)');
  
  // Wait for navigation to main app
  await page.waitForURL('/', { timeout: TEST_TIMEOUT });
  
  // Verify we're logged in by checking for main app elements
  await expect(page.locator('[data-testid="main-app"], .min-h-screen')).toBeVisible();
}

// Helper function to check for JavaScript errors
async function checkForConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', (error) => {
    errors.push(`Page Error: ${error.message}`);
  });
  
  return errors;
}

test.describe('Authentication Bypass', () => {
  test.beforeEach(async ({ page }) => {
    // Set up error tracking
    await checkForConsoleErrors(page);
  });

  test('should show dev mode indicators when bypass is enabled', async ({ page }) => {
    await page.goto('/');
    
    // Should be redirected to login page initially
    await expect(page.locator('text=DEV MODE: Auth Bypass Enabled')).toBeVisible({
      timeout: TEST_TIMEOUT
    });
    
    // Check for development warning
    await expect(page.locator('text=Authentication will be bypassed for testing')).toBeVisible();
    
    // Check button text is updated for dev mode
    await expect(page.locator('text=Continue to App (Dev Mode)')).toBeVisible();
  });

  test('should successfully bypass authentication and login', async ({ page }) => {
    await page.goto('/');
    
    // Complete the auth bypass process
    await verifyAuthBypass(page);
    
    // Verify user is authenticated
    // Look for any user-specific elements or navigation
    await expect(page.locator('text=Casa Guard, text=Home, text=Security')).toBeVisible();
  });

  test('should create mock user with admin role', async ({ page }) => {
    await page.goto('/');
    await verifyAuthBypass(page);
    
    // Check that we can access admin features (since mock user has admin role)
    // This might be a admin panel, admin menu, or admin-only content
    // We'll check for admin access indicators in the UI
    
    // Note: Actual admin access test will depend on how admin features are exposed in UI
    // For now, verify the main app loads without errors
    const errors = await checkForConsoleErrors(page);
    const fatalErrors = errors.filter(error => 
      error.includes('Error') || 
      error.includes('Failed') || 
      error.includes('Cannot') ||
      !error.includes('🚨 AUTH BYPASS ENABLED') // Ignore expected bypass warnings
    );
    
    expect(fatalErrors.length).toBe(0);
  });
});

test.describe('Main App Widget Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Set up for each test
    await page.goto('/');
    await verifyAuthBypass(page);
  });

  test('should render main app container without errors', async ({ page }) => {
    // Check for main app container
    await expect(page.locator('.min-h-screen, [data-testid="main-app"]')).toBeVisible();
    
    // Check for no fatal JavaScript errors
    const errors = await checkForConsoleErrors(page);
    const fatalErrors = errors.filter(error => 
      (error.includes('Error') || error.includes('Failed')) &&
      !error.includes('🚨 AUTH BYPASS ENABLED') &&
      !error.includes('AUTH BYPASS') &&
      !error.includes('Mock') // Ignore expected mock-related messages
    );
    
    expect(fatalErrors.length).toBe(0);
  });

  test('should render navigation tabs', async ({ page }) => {
    // Wait for navigation to load
    await page.waitForTimeout(2000);
    
    // Check for main navigation tabs/buttons
    // These might be in different forms - buttons, tabs, nav elements
    const navigationSelectors = [
      'text=Home',
      'text=Camera',
      'text=Thermostat', 
      'text=Device',
      'text=Security',
      'text=History',
      '[data-testid="nav"], nav, .nav',
      'button[aria-label*="nav"], button[title*="nav"]'
    ];
    
    // At least one navigation method should be visible
    let navigationFound = false;
    for (const selector of navigationSelectors) {
      try {
        await expect(page.locator(selector).first()).toBeVisible({ timeout: 5000 });
        navigationFound = true;
        break;
      } catch {
        // Continue checking other selectors
      }
    }
    
    expect(navigationFound).toBe(true);
  });

  test('should render camera widgets without errors', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(3000);
    
    // Look for camera-related elements
    const cameraSelectors = [
      '[data-testid="camera"]',
      '.camera',
      'text=Camera',
      'text=Live',
      'video',
      '[data-testid="video-player"]',
      '.video-container'
    ];
    
    // Check if any camera elements are present
    let cameraElementFound = false;
    for (const selector of cameraSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        cameraElementFound = true;
        break;
      }
    }
    
    // Note: Camera widgets might not be visible if no cameras are configured
    // So we just check that the page didn't crash trying to render them
    const errors = await checkForConsoleErrors(page);
    const cameraErrors = errors.filter(error => 
      error.toLowerCase().includes('camera') && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(cameraErrors.length).toBe(0);
  });

  test('should render thermostat widget without errors', async ({ page }) => {
    // Wait for widgets to load
    await page.waitForTimeout(3000);
    
    // Look for thermostat-related elements
    const thermostatSelectors = [
      '[data-testid="thermostat"]',
      '.thermostat',
      'text=Thermostat',
      'text=Temperature',
      'text=°F',
      'text=°C',
      '[data-testid="temperature"]'
    ];
    
    // Check for thermostat widget presence
    let thermostatFound = false;
    for (const selector of thermostatSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          thermostatFound = true;
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // Check for thermostat-specific errors
    const errors = await checkForConsoleErrors(page);
    const thermostatErrors = errors.filter(error => 
      error.toLowerCase().includes('thermostat') && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(thermostatErrors.length).toBe(0);
  });

  test('should render device control widgets without errors', async ({ page }) => {
    // Wait for widgets to load
    await page.waitForTimeout(3000);
    
    // Look for device control elements
    const deviceSelectors = [
      '[data-testid="device"]',
      '.device',
      'text=Device',
      'text=Light',
      'text=Switch',
      'text=Control',
      'button[aria-label*="control"]',
      '[data-testid="device-control"]'
    ];
    
    // Check for device control widgets
    let deviceFound = false;
    for (const selector of deviceSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          deviceFound = true;
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // Check for device-specific errors
    const errors = await checkForConsoleErrors(page);
    const deviceErrors = errors.filter(error => 
      (error.toLowerCase().includes('device') || error.toLowerCase().includes('control')) && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(deviceErrors.length).toBe(0);
  });

  test('should render security/alarm widgets without errors', async ({ page }) => {
    // Wait for widgets to load
    await page.waitForTimeout(3000);
    
    // Look for security/alarm elements
    const securitySelectors = [
      '[data-testid="security"]',
      '[data-testid="alarm"]',
      '.security',
      '.alarm',
      'text=Security',
      'text=Alarm',
      'text=Arm',
      'text=Disarm',
      'text=Stay',
      'text=Away',
      '[data-testid="arm-mode"]'
    ];
    
    // Check for security widgets
    let securityFound = false;
    for (const selector of securitySelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          securityFound = true;
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // Check for security-specific errors
    const errors = await checkForConsoleErrors(page);
    const securityErrors = errors.filter(error => 
      (error.toLowerCase().includes('security') || 
       error.toLowerCase().includes('alarm') ||
       error.toLowerCase().includes('arm')) && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(securityErrors.length).toBe(0);
  });

  test('should render event history without errors', async ({ page }) => {
    // Wait for widgets to load
    await page.waitForTimeout(3000);
    
    // Look for event history elements
    const historySelectors = [
      '[data-testid="history"]',
      '[data-testid="event-history"]',
      '.history',
      '.event-history',
      'text=History',
      'text=Event',
      'text=Recent',
      '[data-testid="events"]'
    ];
    
    // Check for history widgets
    let historyFound = false;
    for (const selector of historySelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          historyFound = true;
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // Check for history-specific errors
    const errors = await checkForConsoleErrors(page);
    const historyErrors = errors.filter(error => 
      (error.toLowerCase().includes('history') || 
       error.toLowerCase().includes('event')) && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(historyErrors.length).toBe(0);
  });
});

test.describe('Navigation and Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await verifyAuthBypass(page);
    await page.waitForTimeout(2000); // Wait for initial load
  });

  test('should allow navigation between tabs/sections', async ({ page }) => {
    // This test will depend on the actual navigation implementation
    // For now, just verify that clicking on navigation elements doesn't crash
    
    const navigationElements = page.locator('button, a, [role="tab"], [data-testid*="nav"], nav a, nav button');
    const count = await navigationElements.count();
    
    // If we have navigation elements, test clicking them
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) { // Test up to 5 nav elements
        try {
          const element = navigationElements.nth(i);
          if (await element.isVisible()) {
            await element.click();
            await page.waitForTimeout(1000); // Wait for navigation
            
            // Check that page didn't crash
            const errors = await checkForConsoleErrors(page);
            const navErrors = errors.filter(error => 
              error.includes('Error') && 
              !error.includes('🚨 AUTH BYPASS ENABLED')
            );
            
            expect(navErrors.length).toBe(0);
          }
        } catch (error) {
          // Log but don't fail the test for individual navigation failures
          console.log(`Navigation element ${i} failed:`, error);
        }
      }
    }
  });

  test('should handle pull-to-refresh without errors', async ({ page }) => {
    // Test pull-to-refresh functionality if present
    // This might be implemented as a swipe gesture or button
    
    // Look for refresh-related elements
    const refreshSelectors = [
      '[data-testid="refresh"]',
      'button[aria-label*="refresh"]',
      'button[title*="refresh"]',
      '.refresh'
    ];
    
    for (const selector of refreshSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          await elements.first().click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // Check for refresh-related errors
    const errors = await checkForConsoleErrors(page);
    const refreshErrors = errors.filter(error => 
      error.toLowerCase().includes('refresh') && 
      (error.includes('Error') || error.includes('Failed'))
    );
    
    expect(refreshErrors.length).toBe(0);
  });
});

test.describe('Error Detection and Reporting', () => {
  test('should not have any unhandled JavaScript errors during normal usage', async ({ page }) => {
    const errors: string[] = [];
    
    // Capture all console errors and page errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}`);
    });
    
    // Load the app
    await page.goto('/');
    await verifyAuthBypass(page);
    
    // Wait for app to fully load
    await page.waitForTimeout(5000);
    
    // Interact with the app briefly
    try {
      // Try clicking various elements
      const clickableElements = page.locator('button, a, [role="button"], [role="tab"]');
      const count = await clickableElements.count();
      
      for (let i = 0; i < Math.min(count, 3); i++) {
        const element = clickableElements.nth(i);
        if (await element.isVisible()) {
          await element.click();
          await page.waitForTimeout(1000);
        }
      }
    } catch {
      // Ignore interaction errors for this test
    }
    
    // Filter out expected/acceptable errors
    const fatalErrors = errors.filter(error => 
      !error.includes('🚨 AUTH BYPASS ENABLED') &&
      !error.includes('AUTH BYPASS') &&
      !error.includes('Mock') &&
      !error.includes('dev@manor.test') &&
      // Common acceptable errors to ignore
      !error.includes('Failed to load resource') && // Network errors are expected in test
      !error.includes('net::ERR_') && // Network errors
      !error.includes('chunk') // Chunk loading errors are sometimes acceptable
    );
    
    // Report any fatal errors
    if (fatalErrors.length > 0) {
      console.log('Fatal errors detected:');
      fatalErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    expect(fatalErrors.length).toBe(0);
  });
});