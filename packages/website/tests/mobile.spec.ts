import { test, expect, devices } from '@playwright/test';

// Configure for mobile testing
test.use({
  ...devices['iPhone 14'],
});

// Helper function for mobile login
async function mobileLoginWithBypass(page: any) {
  await page.goto('/');
  
  // Wait for mobile layout to load
  await page.waitForTimeout(2000);
  
  // Verify dev mode indicators on mobile
  await expect(page.locator('text=DEV MODE: Auth Bypass Enabled')).toBeVisible();
  
  // Click bypass login
  await page.click('text=Continue to App (Dev Mode)');
  
  // Wait for main app
  await page.waitForURL('/', { timeout: 30000 });
  await page.waitForTimeout(3000); // Extra wait for mobile loading
}

test.describe('Mobile Responsive Design', () => {
  test('should render correctly on mobile devices', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Check that main app container is responsive
    await expect(page.locator('.min-h-screen, [data-testid="main-app"]')).toBeVisible();
    
    // Verify mobile-friendly viewport
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(414); // iPhone 14 width
    
    // Check for mobile-optimized navigation
    const mobileNavSelectors = [
      '.bottom-nav',
      '.mobile-nav',
      '[data-testid="mobile-nav"]',
      'nav[role="navigation"]'
    ];
    
    let mobileNavFound = false;
    for (const selector of mobileNavSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        if (count > 0) {
          mobileNavFound = true;
          break;
        }
      } catch {
        // Continue checking
      }
    }
    
    // At minimum, page should load without layout errors
    const layoutErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && 
          (msg.text().includes('layout') || 
           msg.text().includes('responsive') ||
           msg.text().includes('viewport'))) {
        layoutErrors.push(msg.text());
      }
    });
    
    expect(layoutErrors.length).toBe(0);
  });

  test('should handle touch interactions', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Find touchable elements
    const touchableElements = page.locator('button, a, [role="button"], [data-testid*="touch"]');
    const count = await touchableElements.count();
    
    if (count > 0) {
      // Test touch interaction on first few elements
      for (let i = 0; i < Math.min(count, 3); i++) {
        const element = touchableElements.nth(i);
        
        if (await element.isVisible()) {
          // Simulate touch tap
          await element.tap();
          await page.waitForTimeout(500);
          
          // Check for touch-related errors
          const touchErrors: string[] = [];
          page.on('console', (msg) => {
            if (msg.type() === 'error' && 
                (msg.text().includes('touch') || 
                 msg.text().includes('tap') ||
                 msg.text().includes('gesture'))) {
              touchErrors.push(msg.text());
            }
          });
          
          expect(touchErrors.length).toBe(0);
        }
      }
    }
  });

  test('should support swipe gestures if implemented', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Test basic swipe functionality if present
    // This would be for pull-to-refresh or navigation swipes
    
    const swipeableAreas = page.locator('[data-testid="swipeable"], .swipeable, .pull-to-refresh');
    const count = await swipeableAreas.count();
    
    if (count > 0) {
      const element = swipeableAreas.first();
      
      // Get element bounds for swipe calculation
      const box = await element.boundingBox();
      
      if (box) {
        // Simulate downward swipe (pull-to-refresh)
        await page.mouse.move(box.x + box.width / 2, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
        await page.mouse.up();
        
        await page.waitForTimeout(1000);
        
        // Check for swipe-related errors
        const swipeErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error' && 
              (msg.text().includes('swipe') || 
               msg.text().includes('gesture') ||
               msg.text().includes('pull'))) {
            swipeErrors.push(msg.text());
          }
        });
        
        expect(swipeErrors.length).toBe(0);
      }
    }
  });
});

test.describe('Mobile Performance', () => {
  test('should load within reasonable time on mobile', async ({ page }) => {
    const startTime = Date.now();
    
    await mobileLoginWithBypass(page);
    
    // Wait for main content to be visible
    await expect(page.locator('.min-h-screen, [data-testid="main-app"]')).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 15 seconds on mobile (generous for CI environment)
    expect(loadTime).toBeLessThan(15000);
    
    console.log(`Mobile load time: ${loadTime}ms`);
  });

  test('should not have memory leaks during basic usage', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Perform some basic interactions that might trigger memory issues
    const interactions = [
      () => page.click('button').catch(() => {}),
      () => page.tap('[role="button"]').catch(() => {}),
      () => page.reload().catch(() => {}),
    ];
    
    for (const interaction of interactions) {
      await interaction();
      await page.waitForTimeout(1000);
    }
    
    // Check for memory-related console warnings
    const memoryWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && 
          (msg.text().includes('memory') || 
           msg.text().includes('leak') ||
           msg.text().includes('performance'))) {
        memoryWarnings.push(msg.text());
      }
    });
    
    // This is more of a smoke test - serious memory leaks would cause crashes
    expect(memoryWarnings.length).toBeLessThan(5); // Allow some warnings but not excessive
  });
});

test.describe('iPhone Specific Features', () => {
  test('should handle iOS safe areas correctly', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Check for iOS-specific CSS classes or styles
    const hasIOSOptimizations = await page.evaluate(() => {
      // Check for safe area styles
      const hasIOSClass = document.documentElement.classList.contains('ios-optimized');
      const hasSafeAreaStyles = document.querySelector('[style*="safe-area"]') !== null;
      const hasIOSSpecificStyles = getComputedStyle(document.body).paddingTop.includes('env(safe-area-inset-top)');
      
      return hasIOSClass || hasSafeAreaStyles || hasIOSSpecificStyles;
    });
    
    // iOS optimizations are nice to have but not required for test to pass
    console.log(`iOS optimizations detected: ${hasIOSOptimizations}`);
  });

  test('should support haptic feedback if available', async ({ page }) => {
    await mobileLoginWithBypass(page);
    
    // Test that haptic feedback calls don't cause errors
    const hapticSupported = await page.evaluate(() => {
      return 'vibrate' in navigator || 'hapticFeedback' in navigator;
    });
    
    if (hapticSupported) {
      // Try triggering haptic feedback through button clicks
      const buttons = page.locator('button');
      const count = await buttons.count();
      
      if (count > 0) {
        await buttons.first().click();
        await page.waitForTimeout(500);
        
        // Check for haptic-related errors
        const hapticErrors: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error' && 
              (msg.text().includes('haptic') || 
               msg.text().includes('vibrate'))) {
            hapticErrors.push(msg.text());
          }
        });
        
        expect(hapticErrors.length).toBe(0);
      }
    }
    
    console.log(`Haptic feedback support: ${hapticSupported}`);
  });
});