# FLUF Chrome Extension

A Chrome extension that automatically extracts authentication tokens from multiple marketplace platforms (Depop and Vinted) and sends them to the FLUF API for circular authentication.

## Features

- **Multi-Platform Support**: Extracts authentication data from Depop and Vinted
- **Automatic Operation**: Runs background checks every hour (Vinted) and 6 hours (Depop)
- **Manual Control**: Users can manually trigger token extraction via popup
- **Secure**: Uses cookie-only extraction to avoid Content Security Policy violations
- **Cross-Platform Integration**: Enables seamless integration with the FLUF platform

## Supported Platforms

- **Depop**: Access tokens and user IDs for authenticated API operations
- **Vinted**: Cookie-based authentication data for marketplace integration

## Installation

### Development Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/fluf-chrome-extension.git
   cd fluf-chrome-extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the extension directory

5. The extension will appear in your extensions list and start running automatically

### Production Installation

1. Download the latest release from the [Releases page](https://github.com/your-username/fluf-chrome-extension/releases)
2. Extract the ZIP file
3. Follow the same steps as development installation

## Usage

### Automatic Operation

Once installed, the extension runs automatically in the background:
- **Vinted**: Checks every hour for authentication tokens
- **Depop**: Checks every 6 hours for authentication tokens

### Manual Operation

1. Click the FLUF extension icon in your Chrome toolbar
2. Click "Check Now" to manually trigger token extraction
3. View the status of the last check in the popup

### Integration with FLUF Platform

The extension automatically sends extracted tokens to:
- **Development**: `http://localhost:10006/wp-json/fc/circular-auth/v1/token`
- **Production**: `https://fluf.io/wp-json/fc/circular-auth/v1/token`

## Architecture

### Core Components

- **`background.js`**: Service worker handling background operations and token extraction
- **`content.js`**: Content script for page communication
- **`popup.html/js`**: User interface for manual controls and status display
- **`manifest.json`**: Extension configuration and permissions

### Token Extraction Methods

#### Depop
- Uses direct cookie parsing from browser cookie store
- Extracts `access_token` and `user_id` from cookies
- Operates entirely from background script

#### Vinted
- Uses authenticated `/items/new` endpoint approach
- Extracts CSRF tokens using proven Zipsale method
- Collects session cookies and user identifiers

## Development

### Prerequisites

- Chrome browser
- Basic knowledge of Chrome extension development

### Local Development

1. Make changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the FLUF extension
4. Test your changes

### Building for Production

1. Ensure all files are properly formatted and tested
2. Create a ZIP file of the extension directory
3. Upload to Chrome Web Store (if publishing publicly)

## Security

- **Origin Validation**: Content script validates message origins
- **Cookie-Only Access**: No external network requests for token extraction
- **CSP Compliance**: No Content Security Policy violations
- **Channel Isolation**: Separate handling for different platform authentication methods

## Privacy

### Data Collected
- **Depop**: Access tokens (temporary) and user IDs
- **Vinted**: Session cookies and user IDs

### Data Usage
- Tokens sent to FLUF API for circular authentication
- No password collection or storage
- Temporary extraction process only

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in this repository
- Contact the FLUF development team

## Changelog

### Version 1.0.3
- Initial release with Depop and Vinted support
- Cookie-only token extraction
- Background automatic checks
- Manual popup controls

## Project Status

This extension is actively maintained and used in production with the FLUF platform. 