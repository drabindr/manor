import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');
  
  // Ensure auth bypass is enabled for testing
  process.env.REACT_APP_BYPASS_AUTH_FOR_DEV = 'true';
  
  console.log('✅ Environment configured for auth bypass testing');
  
  // Optional: warm up the server by making a request
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Wait for the server to be ready
    console.log('⏳ Waiting for server to be ready...');
    await page.goto(config.webServer?.url || 'http://localhost:4173', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    console.log('✅ Server is ready for testing');
    
    await browser.close();
  } catch (error) {
    console.warn('⚠️ Server warmup failed (this may be okay):', error);
  }
  
  console.log('✅ Global setup completed');
}

export default globalSetup;