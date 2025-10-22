#!/bin/bash

# Build script with debug mode enabled
# Usage: ./scripts/build-with-debug.sh

echo "🔧 Building FLUF Chrome Extension with DEBUG MODE ENABLED"
echo "⚠️  This will create a production build with debug logging enabled"

# Set debug mode environment variable
export DEBUG_MODE=true

# Run the prepare script
./scripts/prepare-for-store.sh

echo ""
echo "✅ Build completed with debug mode enabled"
echo "📦 Check the store-build/ directory for the debug-enabled package"
