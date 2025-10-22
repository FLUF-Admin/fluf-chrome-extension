# Chrome Web Store Submission Guide

This guide explains how to prepare the FLUF Chrome Extension for submission to the Chrome Web Store.

## Quick Start

1. **Install dependencies:**
   ```bash
   ./scripts/install-deps.sh
   ```

2. **Prepare for store:**
   ```bash
   ./scripts/prepare-for-store.sh
   ```

3. **Submit the generated zip file to Chrome Web Store**

## What the Script Does

### 1. **Minification**
- **JavaScript**: Uses Terser to minify and compress all JS files
- **HTML**: Uses html-minifier-terser to minimize HTML files
- **CSS**: Uses uglifycss to compress CSS files

### 2. **Obfuscation**
- Replaces sensitive strings with random identifiers
- Protects API endpoints, tokens, and internal identifiers
- Makes reverse engineering more difficult

### 3. **Cleanup**
- Removes all documentation files (README.md, CHANGELOG.md, etc.)
- Removes development scripts and tools
- Removes git history and development artifacts
- Creates a clean, production-ready package

### 4. **Packaging**
- Creates a `store-build/` directory with minified files
- Generates `releases/fluf-chrome-extension-store-v1.4.zip`
- Ready for direct upload to Chrome Web Store

## Files Processed

### JavaScript Files
- `background.js` → Minified and obfuscated
- `content.js` → Minified and obfuscated  
- `popup.js` → Minified and obfuscated

### HTML Files
- `popup.html` → Minified (whitespace removed, comments stripped)

### CSS Files
- Any `.css` files → Minified

### Removed Files
- All `.md` files (documentation)
- `scripts/` directory
- `releases/` directory (except new build)
- `node_modules/`
- `package*.json`
- `.git*` files
- Development artifacts

## Obfuscated Strings

The following strings are obfuscated in the final build:
- API endpoints (`fluf.io`, `wp-json/fc/circular-auth/v1/token`)
- Token names (`access_token_web`, `csrf_token`, `anon_id`)
- Internal identifiers (`v_uid`, `v_sid`, `refresh_token_web`)
- Log messages (`VINTED DEVTools`, `VINTED CSRF`, `DEPOP SUCCESS`)
- Extension metadata

## Testing the Build

Before submitting to the Chrome Web Store:

1. **Load the build locally:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `store-build/` directory

2. **Test functionality:**
   - Verify all features work correctly
   - Check that minification didn't break anything
   - Test with both Vinted and Depop accounts

3. **Check file sizes:**
   - Ensure the zip file is under Chrome Web Store limits
   - Verify minification reduced file sizes significantly

## Chrome Web Store Submission

1. **Go to Chrome Web Store Developer Dashboard:**
   - Visit: https://chrome.google.com/webstore/devconsole/

2. **Upload the zip file:**
   - Use `releases/fluf-chrome-extension-store-v1.4.zip`
   - Fill out store listing information
   - Upload screenshots and promotional images

3. **Store Listing Requirements:**
   - **Name**: FLUF Connect Utility Extension
   - **Description**: Clear description of functionality
   - **Category**: Productivity or Shopping
   - **Screenshots**: At least 1, up to 5
   - **Promotional Images**: 128x128 icon, 440x280 small tile

## Security Considerations

- The obfuscation provides basic protection against casual reverse engineering
- Sensitive API endpoints are hidden but not encrypted
- Consider additional security measures for production use
- Keep the original source code secure and backed up

## Troubleshooting

### Common Issues

1. **Script fails with "command not found":**
   - Run `./scripts/install-deps.sh` first
   - Ensure Node.js and npm are installed

2. **Minification breaks functionality:**
   - Check for syntax errors in original files
   - Test the build locally before submission

3. **Obfuscation causes issues:**
   - Some strings might need to remain unobfuscated
   - Check the obfuscation script for problematic patterns

### Getting Help

- Check the console for error messages
- Verify all dependencies are installed
- Test the build in Chrome before submission

## Version Management

- Update version in `manifest.json` before building
- The script automatically uses the version from manifest.json
- Keep version numbers consistent across all files

## Backup Recommendations

- Always keep the original source code
- Store builds in version control
- Document any manual changes needed after building
