# Changelog

All notable changes to the FLUF Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2024-07-21

### Added
- Initial release of FLUF Chrome Extension
- Multi-platform authentication token extraction (Depop & Vinted)
- Background automatic checks every hour (Vinted) and 6 hours (Depop)
- Manual popup controls for immediate token extraction
- Cookie-only extraction for CSP compliance
- Integration with FLUF API endpoints (development and production)
- Comprehensive documentation and project structure
- GitHub repository setup with proper licensing

### Features
- **Depop Integration**: Extracts access tokens and user IDs from cookies
- **Vinted Integration**: Uses authenticated `/items/new` endpoint approach with CSRF token extraction
- **Automatic Operation**: Scheduled background checks for both platforms
- **Manual Control**: Popup interface for immediate token extraction
- **Security**: Origin validation and CSP-compliant operation
- **Cross-Platform**: Seamless integration with FLUF platform

### Technical Details
- Chrome Extension Manifest V3
- Service worker background script
- Content script for page communication
- Popup interface with status display
- MIT License
- Comprehensive README and documentation

## [Unreleased]

### Planned
- Enhanced error recovery mechanisms
- Additional platform support beyond Depop and Vinted
- Improved user settings and configuration options
- Real-time status updates in popup
- Enhanced security features
- Platform-specific optimization based on marketplace APIs 