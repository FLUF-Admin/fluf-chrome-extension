#!/bin/bash

# FLUF Chrome Extension - Chrome Web Store Preparation Script
# This script minifies, obfuscates, and packages the extension for store submission

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EXTENSION_NAME="FLUF Connect Utility Extension"
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
BUILD_DIR="build"
STORE_DIR="store-build"
TEMP_DIR="temp"

echo -e "${BLUE}🚀 Preparing ${EXTENSION_NAME} v${VERSION} for Chrome Web Store submission...${NC}"

# Clean up previous builds
echo -e "${YELLOW}🧹 Cleaning up previous builds...${NC}"
rm -rf "$BUILD_DIR" "$STORE_DIR" "$TEMP_DIR"
mkdir -p "$BUILD_DIR" "$STORE_DIR" "$TEMP_DIR"

# Check if required tools are installed
echo -e "${YELLOW}🔍 Checking required tools...${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi

# Install minification tools if not already installed
echo -e "${YELLOW}📦 Installing/updating minification tools...${NC}"
npm install -g terser uglifycss html-minifier-terser

# Create a temporary directory with the extension files
echo -e "${YELLOW}📁 Copying extension files...${NC}"
# Copy only the essential extension files, excluding build directories and temp
cp background.js content.js manifest.json popup.html popup.js LICENSE "$TEMP_DIR/" 2>/dev/null || true
cd "$TEMP_DIR"

# Clean up any unwanted files that might have been copied
echo -e "${YELLOW}🗑️  Cleaning up unwanted files...${NC}"
rm -rf \
    "scripts/" \
    "releases/" \
    "build/" \
    "temp/" \
    "store-build/" \
    "*.md" \
    "CHANGELOG.md" \
    "PROJECT_OVERVIEW.md" \
    "README.md" \
    "STORE_SUBMISSION.md" \
    ".git*" \
    "node_modules/" \
    "package*.json" \
    "*.log" \
    "*.tmp" \
    ".DS_Store" \
    "Thumbs.db" 2>/dev/null || true

# Minify JavaScript files
echo -e "${YELLOW}🔧 Minifying JavaScript files...${NC}"

# Minify background.js
if [ -f "background.js" ]; then
    echo -e "${BLUE}  Minifying background.js...${NC}"
    terser background.js \
        --compress \
        --mangle \
        --output background.min.js \
        --comments false
    mv background.min.js background.js
    echo -e "${GREEN}  ✅ background.js minified successfully${NC}"
fi

# Minify content.js
if [ -f "content.js" ]; then
    echo -e "${BLUE}  Minifying content.js...${NC}"
    terser content.js \
        --compress \
        --mangle \
        --output content.min.js \
        --comments false
    mv content.min.js content.js
fi

# Minify popup.js
if [ -f "popup.js" ]; then
    echo -e "${BLUE}  Minifying popup.js...${NC}"
    terser popup.js \
        --compress \
        --mangle \
        --output popup.min.js \
        --comments false
    mv popup.min.js popup.js
fi

# Minify HTML files
echo -e "${YELLOW}🔧 Minifying HTML files...${NC}"

# Minify popup.html
if [ -f "popup.html" ]; then
    echo -e "${BLUE}  Minifying popup.html...${NC}"
    html-minifier-terser popup.html \
        --collapse-whitespace \
        --remove-comments \
        --minify-css \
        --minify-js \
        --output popup.min.html
    mv popup.min.html popup.html
fi

# Minify CSS files (if any)
echo -e "${YELLOW}🔧 Minifying CSS files...${NC}"
for css_file in *.css; do
    if [ -f "$css_file" ]; then
        echo -e "${BLUE}  Minifying $css_file...${NC}"
        uglifycss "$css_file" --output "${css_file%.css}.min.css"
        mv "${css_file%.css}.min.css" "$css_file"
    fi
done

# Obfuscate JavaScript files using javascript-obfuscator
echo -e "${YELLOW}🔒 Obfuscating JavaScript files...${NC}"

# Check if debug mode should be enabled in production build
DEBUG_MODE=${DEBUG_MODE:-false}
echo -e "${BLUE}🔧 Debug mode for production: ${DEBUG_MODE}${NC}"

# Obfuscate background.js
if [ -f "background.js" ]; then
    echo -e "${BLUE}  Obfuscating background.js...${NC}"
    
    # Create a temporary file with debug mode setting
    if [ "$DEBUG_MODE" = "true" ]; then
        # Replace debugLog function to use debugModeEnabled
        sed 's/\/\/ if (debugModeEnabled) {/if (debugModeEnabled) {/g; s/\/\/ }/}/g' background.js > background_temp.js
    else
        # Keep debugLog always enabled for local development
        cp background.js background_temp.js
    fi
    
    npx javascript-obfuscator background_temp.js \
        --output background.obf.js \
        --compact true \
        --self-defending true \
        --control-flow-flattening true \
        --control-flow-flattening-threshold 1 \
        --dead-code-injection true \
        --dead-code-injection-threshold 0.4 \
        --string-array true \
        --string-array-encoding rc4 \
        --string-array-threshold 1 \
        --disable-console-output true
    mv background.obf.js background.js
    rm background_temp.js
    echo -e "${GREEN}  ✅ background.js obfuscated successfully${NC}"
fi

# Obfuscate content.js
if [ -f "content.js" ]; then
    echo -e "${BLUE}  Obfuscating content.js...${NC}"
    npx javascript-obfuscator content.js \
        --output content.obf.js \
        --compact true \
        --self-defending true \
        --control-flow-flattening true \
        --control-flow-flattening-threshold 1 \
        --dead-code-injection true \
        --dead-code-injection-threshold 0.4 \
        --string-array true \
        --string-array-encoding rc4 \
        --string-array-threshold 1 \
        --disable-console-output true
    mv content.obf.js content.js
    echo -e "${GREEN}  ✅ content.js obfuscated successfully${NC}"
fi

# Obfuscate popup.js
if [ -f "popup.js" ]; then
    echo -e "${BLUE}  Obfuscating popup.js...${NC}"
    npx javascript-obfuscator popup.js \
        --output popup.obf.js \
        --compact true \
        --self-defending true \
        --control-flow-flattening true \
        --control-flow-flattening-threshold 1 \
        --dead-code-injection true \
        --dead-code-injection-threshold 0.4 \
        --string-array true \
        --string-array-encoding rc4 \
        --string-array-threshold 1 \
        --disable-console-output true
    mv popup.obf.js popup.js
    echo -e "${GREEN}  ✅ popup.js obfuscated successfully${NC}"
fi

echo -e "${GREEN}✅ Obfuscation completed${NC}"

# Copy minified files to store build directory
echo -e "${YELLOW}📦 Creating store build package...${NC}"
cd ..
cp -r "$TEMP_DIR"/* "$STORE_DIR/"

# Create final zip package
echo -e "${YELLOW}📦 Creating final zip package...${NC}"
cd "$STORE_DIR"
zip -r "../releases/fluf-chrome-extension-store-v${VERSION}.zip" . -x "*.DS_Store" "Thumbs.db"
cd ..

# Clean up
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"

# Display results
echo -e "${GREEN}✅ Chrome Web Store package created successfully!${NC}"
echo -e "${GREEN}📦 Package: releases/fluf-chrome-extension-store-v${VERSION}.zip${NC}"
echo -e "${GREEN}📁 Build directory: ${STORE_DIR}/${NC}"
echo ""
echo -e "${BLUE}📋 Package contents:${NC}"
echo -e "${BLUE}  - Minified and obfuscated JavaScript files${NC}"
echo -e "${BLUE}  - Minified HTML and CSS files${NC}"
echo -e "${BLUE}  - Clean manifest.json${NC}"
echo -e "${BLUE}  - No documentation or development files${NC}"
echo ""
echo -e "${YELLOW}⚠️  Important notes:${NC}"
echo -e "${YELLOW}  - Test the package thoroughly before submission${NC}"
echo -e "${YELLOW}  - Keep the original source code for future updates${NC}"
echo -e "${YELLOW}  - Obfuscated code is harder to reverse-engineer${NC}"
echo ""
echo -e "${GREEN}🎉 Ready for Chrome Web Store submission!${NC}"
echo ""
echo -e "${BLUE}📖 Usage:${NC}"
echo -e "${BLUE}  - Normal build: ./scripts/prepare-for-store.sh${NC}"
echo -e "${BLUE}  - Debug build:  DEBUG_MODE=true ./scripts/prepare-for-store.sh${NC}"
echo -e "${BLUE}  - Or use:       npm run build-debug${NC}"
