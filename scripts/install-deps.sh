#!/bin/bash

# Install dependencies for Chrome Web Store preparation

echo "🔧 Installing Chrome Web Store preparation dependencies..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install global dependencies
echo "📦 Installing global dependencies..."
npm install -g terser uglifycss html-minifier-terser

echo "✅ Dependencies installed successfully!"
echo ""
echo "You can now run the preparation script:"
echo "  ./scripts/prepare-for-store.sh"
echo ""
echo "Or use npm:"
echo "  npm run prepare-store"
