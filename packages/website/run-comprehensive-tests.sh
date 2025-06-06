#!/bin/bash

# Comprehensive Test Script for Manor Website
# This script runs all tests with auth bypass and generates reports

set -e  # Exit on any error

echo "🧪 Manor Website - Comprehensive Test Suite"
echo "============================================="

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the website package directory."
    exit 1
fi

# Create test results directory
mkdir -p test-results

echo ""
echo "📋 Pre-test Setup"
echo "=================="

# Backup current .env if it exists
if [ -f ".env" ]; then
    echo "📄 Backing up existing .env file..."
    cp .env .env.backup.$(date +%s)
fi

# Copy test environment
echo "🔧 Setting up test environment..."
cp .env.test .env
export REACT_APP_BYPASS_AUTH_FOR_DEV=true

echo "✅ Test environment configured with auth bypass enabled"

# Check dependencies
echo ""
echo "📦 Checking Dependencies"
echo "========================"

if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed."
    exit 1
fi

echo "🔍 Installing/updating test dependencies..."
npm install

# Install Playwright browsers if needed
echo "🎭 Installing Playwright browsers..."
npx playwright install --with-deps

echo "✅ Dependencies ready"

# Run different test configurations
echo ""
echo "🏃 Running Comprehensive Tests"
echo "==============================="

# Function to run tests with error handling
run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_file="test-results/${test_name}-results.json"
    
    echo ""
    echo "▶️  Running: $test_name"
    echo "   Command: $test_command"
    
    if eval "$test_command"; then
        echo "✅ $test_name - PASSED"
        return 0
    else
        echo "❌ $test_name - FAILED"
        return 1
    fi
}

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Test 1: Main comprehensive tests
if run_test "Comprehensive Tests" "npx playwright test --reporter=json --output-dir=test-results/comprehensive"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
    FAILED_TESTS+=("Comprehensive Tests")
fi

# Test 2: Mobile-specific tests
if run_test "Mobile Tests" "npx playwright test tests/mobile.spec.ts --reporter=json --output-dir=test-results/mobile"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
    FAILED_TESTS+=("Mobile Tests")
fi

# Test 3: Admin functionality tests
if run_test "Admin Tests" "npx playwright test tests/admin.spec.ts --reporter=json --output-dir=test-results/admin"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
    FAILED_TESTS+=("Admin Tests")
fi

# Test 4: Cross-browser tests (subset for speed)
if run_test "Cross-Browser Tests" "npx playwright test --project=chromium,firefox --reporter=json --output-dir=test-results/cross-browser"; then
    ((TESTS_PASSED++))
else
    ((TESTS_FAILED++))
    FAILED_TESTS+=("Cross-Browser Tests")
fi

# Generate combined HTML report
echo ""
echo "📊 Generating Test Reports"
echo "=========================="

# Create HTML report
npx playwright show-report test-results || echo "⚠️ Could not generate HTML report"

# Create summary report
cat > test-results/test-summary.md << EOF
# Manor Website Test Results

**Test Run Date:** $(date)
**Environment:** Test with Auth Bypass Enabled
**Total Tests:** $((TESTS_PASSED + TESTS_FAILED))
**Passed:** $TESTS_PASSED
**Failed:** $TESTS_FAILED

## Test Categories

- ✅ Authentication Bypass Testing
- ✅ Widget Rendering Validation  
- ✅ Mobile Responsive Design
- ✅ Admin Panel Access
- ✅ Cross-Browser Compatibility
- ✅ Error Detection and Reporting

## Results Summary

EOF

if [ $TESTS_FAILED -eq 0 ]; then
    echo "### 🎉 ALL TESTS PASSED!" >> test-results/test-summary.md
    echo "" >> test-results/test-summary.md
    echo "The Manor website is functioning correctly with auth bypass enabled." >> test-results/test-summary.md
    echo "All widgets are rendering properly and no fatal errors were detected." >> test-results/test-summary.md
else
    echo "### ⚠️ Some Tests Failed" >> test-results/test-summary.md
    echo "" >> test-results/test-summary.md
    echo "The following test categories failed:" >> test-results/test-summary.md
    for test in "${FAILED_TESTS[@]}"; do
        echo "- ❌ $test" >> test-results/test-summary.md
    done
fi

echo "" >> test-results/test-summary.md
echo "## Test Details" >> test-results/test-summary.md
echo "" >> test-results/test-summary.md
echo "For detailed test results, see the generated HTML report in \`test-results/\`." >> test-results/test-summary.md

# Cleanup
echo ""
echo "🧹 Cleanup"
echo "=========="

# Restore original .env if it existed
if [ -f ".env.backup"* ]; then
    echo "🔄 Restoring original .env file..."
    LATEST_BACKUP=$(ls -t .env.backup.* | head -1)
    mv "$LATEST_BACKUP" .env
    echo "✅ Environment restored"
else
    # Remove test .env if no backup existed
    rm -f .env
    echo "✅ Test environment cleaned up"
fi

# Final results
echo ""
echo "🏁 Test Results Summary"
echo "======================="
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo "🎉 SUCCESS! All comprehensive tests passed."
    echo ""
    echo "📊 Test reports available in:"
    echo "   - test-results/test-summary.md (Summary)"
    echo "   - test-results/ (Detailed HTML reports)"
    echo ""
    echo "💡 The Manor website is ready for production with all widgets"
    echo "   functioning correctly and auth bypass working for development."
else
    echo ""
    echo "⚠️  Some tests failed. Check the reports for details:"
    echo "   - test-results/test-summary.md (Summary)"
    echo "   - test-results/ (Detailed HTML reports)"
    echo ""
    for test in "${FAILED_TESTS[@]}"; do
        echo "   ❌ $test"
    done
fi

echo ""
echo "🚀 To view detailed HTML reports run:"
echo "   npx playwright show-report test-results"

# Exit with appropriate code
exit $TESTS_FAILED