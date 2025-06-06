# Comprehensive Testing Guide for Manor Website

This document provides a complete guide to the comprehensive testing system for the Manor website, including auth bypass testing, widget validation, and CI/CD integration.

## Overview

The Manor website now includes a comprehensive test suite that:

- ✅ **Tests authentication bypass** for development and testing
- ✅ **Validates all widgets render correctly** without fatal errors
- ✅ **Supports both local and CI execution**
- ✅ **Generates detailed test reports**
- ✅ **Tests mobile responsiveness**
- ✅ **Verifies admin panel access**
- ✅ **Cross-browser compatibility testing**

## Quick Start

### Running Tests Locally

```bash
# Navigate to the website package
cd packages/website

# Run the comprehensive test suite
./run-comprehensive-tests.sh

# Or use npm script
npm run test:comprehensive
```

### Running Individual Test Suites

```bash
# Basic Playwright tests
npm run test

# Run with browser UI (for debugging)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Run with auth bypass enabled
npm run test:bypass

# Mobile-specific tests
npx playwright test tests/mobile.spec.ts

# Admin functionality tests
npx playwright test tests/admin.spec.ts
```

## Test Structure

### Test Files

- `tests/comprehensive.spec.ts` - Main test suite covering all widgets and functionality
- `tests/admin.spec.ts` - Admin panel and role-based access testing  
- `tests/mobile.spec.ts` - Mobile responsiveness and touch interaction testing
- `tests/global-setup.ts` - Global test configuration and setup
- `tests/global-teardown.ts` - Global test cleanup

### Configuration Files

- `playwright.config.ts` - Playwright test configuration
- `.env.test` - Test environment configuration
- `run-comprehensive-tests.sh` - Comprehensive test runner script

## What Gets Tested

### 1. Authentication Bypass
- ✅ Dev mode indicators are shown when bypass is enabled
- ✅ Mock user authentication works correctly
- ✅ Admin role is assigned to mock user
- ✅ Protected routes are accessible with bypass

### 2. Widget Rendering
- ✅ Main app container loads without errors
- ✅ Navigation tabs/buttons are rendered
- ✅ Camera widgets load without fatal errors
- ✅ Thermostat widget renders correctly
- ✅ Device control widgets function properly
- ✅ Security/alarm controls are accessible
- ✅ Event history displays without issues

### 3. Navigation and Functionality
- ✅ Tab navigation works correctly
- ✅ Pull-to-refresh functionality (if implemented)
- ✅ Route navigation doesn't cause crashes
- ✅ No unhandled JavaScript errors occur

### 4. Mobile Responsiveness
- ✅ Responsive design works on mobile devices
- ✅ Touch interactions function properly
- ✅ Swipe gestures work (if implemented)
- ✅ iOS-specific optimizations are applied
- ✅ Haptic feedback works without errors

### 5. Admin Functionality
- ✅ Admin panel is accessible with mock admin user
- ✅ Admin role is properly set in bypass mode
- ✅ Admin-only features are available

### 6. Error Detection
- ✅ No fatal JavaScript errors in console
- ✅ No unhandled promise rejections
- ✅ No layout-breaking CSS errors
- ✅ Memory leak detection during basic usage

## Environment Configuration

### Auth Bypass Setup

The testing system uses environment variables to enable auth bypass:

```bash
# Enable auth bypass for testing
REACT_APP_BYPASS_AUTH_FOR_DEV=true
```

When enabled, the system:
- Creates a mock user with email `dev@manor.test`
- Assigns `admin` role for testing all features
- Bypasses Apple Sign-In authentication
- Shows clear "DEV MODE" warnings in the UI

### Test Environment Files

- `.env.test` - Used automatically during testing
- `.env.development` - For local development with bypass
- `.env.production` - Production environment (bypass disabled)

## CI/CD Integration

### GitHub Actions

The comprehensive test suite is integrated into the GitHub Actions workflow at `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    name: Comprehensive Testing
    runs-on: ubuntu-latest
    steps:
      - name: Run comprehensive tests
        run: ./run-comprehensive-tests.sh
        env:
          CI: true
          REACT_APP_BYPASS_AUTH_FOR_DEV: true
          
  deploy:
    needs: test  # Deploy only if tests pass
    if: github.ref_name == 'main'
    # ... deployment steps
```

### Test Results and Artifacts

- **Test reports** are uploaded as GitHub Actions artifacts
- **HTML reports** provide detailed test results with screenshots
- **JSON reports** enable programmatic analysis
- **Test summary** provides quick overview of results

## Test Reports

### Local Reports

After running tests locally:

```bash
# View HTML report
npx playwright show-report test-results

# View summary
cat test-results/test-summary.md
```

### CI Reports

In GitHub Actions:
1. Go to the Actions tab
2. Select your workflow run
3. Download the `test-results` and `test-summary` artifacts

## Troubleshooting

### Common Issues

**Tests fail to start:**
```bash
# Install Playwright browsers
npx playwright install --with-deps

# Check environment setup
cat .env
```

**Auth bypass not working:**
```bash
# Ensure environment variable is set
export REACT_APP_BYPASS_AUTH_FOR_DEV=true

# Check for dev mode indicators in browser
```

**Build failures:**
```bash
# Clean install dependencies
rm -rf node_modules package-lock.json
npm install
```

**Mobile tests failing:**
```bash
# Install additional browser dependencies
npx playwright install-deps
```

### Debug Mode

Run tests in debug mode to see what's happening:

```bash
# Run with browser visible
npm run test:headed

# Run with Playwright UI
npm run test:ui

# Debug specific test
npx playwright test tests/comprehensive.spec.ts --debug
```

## Adding New Tests

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('New Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login with bypass
    await page.goto('/');
    await expect(page.locator('text=DEV MODE')).toBeVisible();
    await page.click('text=Continue to App (Dev Mode)');
  });

  test('should test new functionality', async ({ page }) => {
    // Your test logic here
    await expect(page.locator('[data-testid="new-feature"]')).toBeVisible();
  });
});
```

### Best Practices

1. **Use data-testid attributes** for reliable element selection
2. **Test error scenarios** as well as happy paths
3. **Include mobile responsiveness** in new tests
4. **Check for console errors** after interactions
5. **Use meaningful test descriptions**

## Performance Considerations

### Test Optimization

- Tests run in parallel for speed
- Mobile tests use device emulation for efficiency
- Browser contexts are reused when possible
- Only critical browsers tested in CI (full suite locally)

### Timeouts

- Page load timeout: 30 seconds
- Element timeout: 10 seconds
- Test timeout: 30 seconds
- Overall test run: ~5-10 minutes

## Security Notes

### Auth Bypass Safety

The auth bypass feature is designed to be safe:

- ✅ **Environment-controlled** - Only works when explicitly enabled
- ✅ **Visual indicators** - Clear warnings when active
- ✅ **Production-safe** - Cannot be accidentally enabled in production
- ✅ **Mock data only** - Uses fake credentials and tokens

### Production Deployment

The deployment process ensures:
- Tests must pass before deployment
- Production builds never include bypass functionality
- Environment variables are properly isolated

## Support

For issues with the testing system:

1. Check this documentation first
2. Review test output and error messages
3. Run tests locally to reproduce issues
4. Check GitHub Actions logs for CI failures
5. Consult the Playwright documentation for advanced debugging

## Further Reading

- [Playwright Documentation](https://playwright.dev/)
- [DEV_AUTH_BYPASS.md](./DEV_AUTH_BYPASS.md) - Auth bypass documentation
- [QUICK_START_DEV_AUTH.md](./QUICK_START_DEV_AUTH.md) - Quick auth bypass guide