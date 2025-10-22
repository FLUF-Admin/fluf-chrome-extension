#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define colors for output
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from manifest.json
VERSION=$(jq -r '.version' manifest.json)

echo -e "${BLUE}🚀 Preparing FLUF Connect Utility Extension v${VERSION} for Chrome Web Store submission...${NC}"

# Define directories
TEMP_DIR="temp_build"
STORE_DIR="store-build"
RELEASES_DIR="releases"

# Clean up previous builds
echo -e "${YELLOW}🧹 Cleaning up previous builds...${NC}"
rm -rf "$TEMP_DIR" "$STORE_DIR" "$RELEASES_DIR" 2>/dev/null || true
mkdir -p "$TEMP_DIR" "$STORE_DIR" "$RELEASES_DIR"

# Check for required tools
echo -e "${YELLOW}🔍 Checking required tools...${NC}"
if ! command -v terser &> /dev/null || ! command -v uglifycss &> /dev/null || ! command -v html-minifier-terser &> /dev/null || ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}📦 Installing/updating minification tools...${NC}"
    npm install -g terser uglifycss html-minifier-terser jq
fi

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
    echo -e "${GREEN}  ✅ content.js minified successfully${NC}"
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
    echo -e "${GREEN}  ✅ popup.js minified successfully${NC}"
fi

# Minify HTML files
echo -e "${YELLOW}🔧 Minifying HTML files...${NC}"
for html_file in *.html; do
    if [ -f "$html_file" ]; then
        echo -e "${BLUE}  Minifying $html_file...${NC}"
        html-minifier-terser "$html_file" --output "${html_file%.html}.min.html" \
            --collapse-whitespace \
            --remove-comments \
            --remove-redundant-attributes \
            --remove-script-type-attributes \
            --remove-tag-whitespace \
            --use-short-doctype \
            --minify-css true \
            --minify-js true
        mv "${html_file%.html}.min.html" "$html_file"
    fi
done

# Minify CSS files (if any)
echo -e "${YELLOW}🔧 Minifying CSS files...${NC}"
for css_file in *.css; do
    if [ -f "$css_file" ]; then
        echo -e "${BLUE}  Minifying $css_file...${NC}"
        uglifycss "$css_file" --output "${css_file%.css}.min.css"
        mv "${css_file%.css}.min.css" "$css_file"
    fi
done

# Skip obfuscation - Chrome Web Store policy compliance
echo -e "${YELLOW}⚠️  Skipping obfuscation to comply with Chrome Web Store policies${NC}"
echo -e "${BLUE}📋 Chrome Web Store requires human-readable code${NC}"
echo -e "${GREEN}✅ Code remains readable and compliant${NC}"

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
echo -e "${BLUE}  - Minified JavaScript files (no obfuscation)${NC}"
echo -e "${BLUE}  - Minified HTML and CSS files${NC}"
echo -e "${BLUE}  - Clean manifest.json${NC}"
echo -e "${BLUE}  - No documentation or development files${NC}"
echo ""
echo -e "${YELLOW}⚠️  Important notes:${NC}"
echo -e "${YELLOW}  - Test the package thoroughly before submission${NC}"
echo -e "${YELLOW}  - Keep the original source code for future updates${NC}"
echo -e "${YELLOW}  - Code is minified but remains human-readable${NC}"
echo ""
echo -e "${GREEN}🎉 Ready for Chrome Web Store submission!${NC}"
echo ""
echo -e "${BLUE}📖 Usage:${NC}"
echo -e "${BLUE}  - Run: ./scripts/prepare-for-store-no-obfuscation.sh${NC}"
echo -e "${BLUE}  - Or use: npm run build-no-obfuscation${NC}"
