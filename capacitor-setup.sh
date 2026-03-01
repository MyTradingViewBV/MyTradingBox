#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
  echo -e "${BLUE}================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}================================${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# Verify prerequisites
verify_prerequisites() {
  print_header "Verifying Prerequisites"

  # Check Node.js
  if command -v node &> /dev/null; then
    print_success "Node.js $(node --version) is installed"
  else
    print_error "Node.js is not installed"
    exit 1
  fi

  # Check npm
  if command -v npm &> /dev/null; then
    print_success "npm $(npm --version) is installed"
  else
    print_error "npm is not installed"
    exit 1
  fi

  # Check Xcode (macOS only)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v xcode-select &> /dev/null; then
      print_success "Xcode is installed"
    else
      print_error "Xcode is not installed. Install from App Store"
      exit 1
    fi
  fi

  print_success "All prerequisites verified"
  echo ""
}

# Step 1: Install Capacitor
install_capacitor() {
  print_header "Step 1: Installing Capacitor"

  print_info "Installing global Capacitor CLI..."
  npm install -g @capacitor/cli

  print_info "Installing Capacitor packages..."
  npm install @capacitor/core @capacitor/ios --save-exact

  print_info "Installing Capacitor CLI locally..."
  npm install --save-dev @capacitor/cli --save-exact

  print_success "Capacitor installation complete"
  echo ""
}

# Step 2: Initialize Capacitor
init_capacitor() {
  print_header "Step 2: Initializing Capacitor"

  print_info "Initializing Capacitor project..."
  
  # Non-interactive init (assumes capacitor.config.ts exists)
  if [ -f capacitor.config.ts ]; then
    print_info "Using existing capacitor.config.ts"
  else
    print_warning "capacitor.config.ts not found. Please create it manually."
  fi

  print_success "Capacitor initialization complete"
  echo ""
}

# Step 3: Build Angular
build_angular() {
  print_header "Step 3: Building Angular for Production"

  print_info "Running production build..."
  npm run build -- --configuration production

  if [ -d "www" ]; then
    print_success "Angular build output is in www/ directory"
  else
    print_error "Build failed - www directory not found"
    exit 1
  fi

  echo ""
}

# Step 4: Add iOS platform
add_ios_platform() {
  print_header "Step 4: Adding iOS Platform"

  if [ -d "ios" ]; then
    print_warning "iOS platform already exists"
    print_info "Syncing instead..."
    npx cap sync ios
  else
    print_info "Adding iOS platform..."
    npx cap add ios
  fi

  print_success "iOS platform added successfully"
  echo ""
}

# Step 5: Sync to iOS
sync_ios() {
  print_header "Step 5: Syncing Web Build to iOS"

  print_info "Running capacitor sync..."
  npx cap sync ios

  print_success "Web build synced to iOS project"
  echo ""
}

# Step 6: Check project structure
check_structure() {
  print_header "Step 6: Checking Project Structure"

  local required_files=(
    "capacitor.config.ts"
    "src/manifest.json"
    "src/index.html"
    "ngsw-config.json"
  )

  for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
      print_success "Found $file"
    else
      print_warning "Missing $file - This may be needed"
    fi
  done

  local required_dirs=(
    "www"
    "ios"
    "src/assets/icons"
  )

  for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
      print_success "Found directory: $dir"
    else
      print_warning "Missing directory: $dir - May need to be created"
    fi
  done

  echo ""
}

# Step 7: Verify Capacitor health
verify_capacitor() {
  print_header "Step 7: Verifying Capacitor Setup"

  print_info "Running capacitor doctor..."
  npx cap doctor

  echo ""
}

# Step 8: Provide next steps
next_steps() {
  print_header "Next Steps"

  echo -e "${YELLOW}To continue with iOS app development:${NC}\n"

  echo -e "${GREEN}1. Open Xcode project:${NC}"
  echo "   npx cap open ios\n"

  echo -e "${GREEN}2. In Xcode:${NC}"
  echo "   - Set your Team ID (Signing & Capabilities)"
  echo "   - Configure Bundle Identifier (com.mytradingbox.app)"
  echo "   - Add required capabilities"
  echo "   - Set app icons and splash screen\n"

  echo -e "${GREEN}3. Build and run on simulator:${NC}"
  echo "   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build\n"

  echo -e "${GREEN}4. For App Store submission:${NC}"
  echo "   - Create App ID in Apple Developer"
  echo "   - Create provisioning profiles"
  echo "   - Update ExportOptions.plist with Team ID"
  echo "   - Build archive and export\n"

  echo -e "${YELLOW}Configuration files to review:${NC}"
  echo "   - CAPACITOR_IOS_SETUP.md - Complete setup guide"
  echo "   - capacitor.config.ts - Capacitor configuration"
  echo "   - iOS_Info.plist_additions.xml - Info.plist entries"
  echo "   - ExportOptions.plist - App Store export settings"
  echo "   - App.entitlements - App capabilities\n"
}

# Main execution
main() {
  print_header "MyTradingBox - Angular PWA to iOS Setup"
  echo ""

  # Run verification
  verify_prerequisites

  # Run installation steps
  install_capacitor
  init_capacitor
  build_angular
  add_ios_platform
  sync_ios
  check_structure
  verify_capacitor

  # Print next steps
  next_steps

  print_success "Setup script completed!"
  echo ""
  print_info "For detailed information, see: CAPACITOR_IOS_SETUP.md"
}

# Run main function
main
