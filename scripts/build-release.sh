#!/bin/bash

# FLUF Chrome Extension Build Script
# This script creates a release package for the Chrome extension

set -e

# Configuration
VERSION=$(node -p "require('./package.json').version")
EXTENSION_NAME="fluf-chrome-extension"
RELEASE_DIR="releases"
PACKAGE_NAME="${EXTENSION_NAME}-v${VERSION}"

echo "🚀 Building FLUF Chrome Extension v${VERSION}"

# Create releases directory if it doesn't exist
mkdir -p "${RELEASE_DIR}"

# Clean up any existing package
rm -f "${RELEASE_DIR}/${PACKAGE_NAME}.zip"

# Create the package
echo "📦 Creating package: ${PACKAGE_NAME}.zip"
zip -r "${RELEASE_DIR}/${PACKAGE_NAME}.zip" . \
  -x "*.git*" \
  -x "node_modules/*" \
  -x "*.DS_Store" \
  -x "releases/*" \
  -x "scripts/*" \
  -x "*.log" \
  -x ".vscode/*" \
  -x ".idea/*"

echo "✅ Package created: ${RELEASE_DIR}/${PACKAGE_NAME}.zip"
echo "📏 Package size: $(du -h "${RELEASE_DIR}/${PACKAGE_NAME}.zip" | cut -f1)"

# List files in the package
echo "📋 Files included in package:"
unzip -l "${RELEASE_DIR}/${PACKAGE_NAME}.zip" | head -20

echo "🎉 Build complete!"
echo "📁 Package location: ${RELEASE_DIR}/${PACKAGE_NAME}.zip" 