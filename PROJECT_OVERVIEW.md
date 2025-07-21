# FLUF Chrome Extension - Project Overview

## Purpose
The FLUF Chrome Extension is a utility extension designed to automatically extract authentication tokens from multiple marketplace platforms and send them to the FLUF API for circular authentication. This enables seamless integration between supported marketplaces and the FLUF platform for authenticated operations.

## Supported Platforms
- **Depop**: Access tokens and user IDs for authenticated API operations
- **Vinted**: Cookie-based authentication data for marketplace integration

## Key Features
- **Multi-Platform Token Extraction**: Extracts authentication data from Depop and Vinted
- **Channel-Based Routing**: Automatically detects platform and routes data accordingly
- **Scheduled Checks**: Runs token checks automatically (Depop every 6 hours, Vinted every hour)
- **Manual Trigger**: Users can manually trigger token extraction via popup
- **Cross-Origin Communication**: Handles communication between web pages and the extension
- **CSP-Safe Operation**: Uses cookie-only extraction to avoid Content Security Policy violations

## Architecture

### Core Components

#### 1. Background Script (`background.js`)
- **Service Worker**: Handles extension lifecycle and background operations
- **Alarm System**: Schedules periodic token checks (Depop: 6 hours, Vinted: 1 hour)
- **Multi-Platform Token Extraction**: Extracts authentication data using cookie-only methods
- **Channel Detection**: Automatically identifies the current platform (Depop/Vinted)
- **API Communication**: Sends extracted tokens to FLUF API endpoints with channel-specific routing
- **Message Handling**: Processes messages from content scripts and popup

#### 2. Content Script (`content.js`)
- **Message Bridge**: Facilitates communication between web pages and background script
- **Event Listener**: Listens for postMessage events from web pages
- **User Identification**: Extracts user identifiers from cookies
- **Cross-Origin Security**: Validates message origins for security

#### 3. Popup Interface (`popup.html` + `popup.js`)
- **Status Display**: Shows last check status and timestamp
- **Manual Controls**: Provides "Check Now" button for immediate token extraction
- **Privacy Information**: Displays privacy notice about data collection
- **User Feedback**: Visual indicators for success/error states

#### 4. Manifest (`manifest.json`)
- **Permissions**: Defines required permissions (alarms, storage, scripting, tabs, cookies)
- **Host Permissions**: Specifies allowed domains (fluf.io, depop.com, vinted.co.uk, localhost)
- **Content Script Registration**: Configures content script injection
- **CSP-Free**: Removed Content Security Policy restrictions for maximum compatibility

## Token Extraction Methods

Both platforms now use **cookie-only extraction** for maximum reliability and CSP compliance:

### Depop Token Extraction
The extension uses **direct cookie parsing**:

1. **Cookie Collection**: Uses `chrome.cookies.getAll()` to collect browser cookies from Depop
2. **Direct Token Extraction**: Extracts `access_token` and `user_id` directly from cookies
3. **Session Detection**: Analyzes cookie patterns to determine login status
4. **CSP-Safe Method**: No external requests, avoiding Content Security Policy violations
5. **Background Operation**: Operates entirely from background script without creating tabs

### Vinted Token Extraction
The extension uses **authenticated /items/new endpoint approach**:

1. **Cookie Collection**: Uses `chrome.cookies.getAll()` to collect browser cookies from Vinted
2. **Session Cookie Detection**: Identifies session-related cookies (session, csrf, token, anon_id)
3. **User ID Extraction**: Retrieves `v_uid` from collected cookies or JWT token payload
4. **CSRF Token Extraction**: Makes authenticated request to `/items/new` endpoint to extract CSRF token using Zipsale's proven method:
   - Fetches the new item creation page with user's cookies
   - Extracts CSRF token using regex pattern: `/\\"CSRF_TOKEN\\":\\"([^"]+)\\"/`
   - Also captures `x-anon-id` header if available
5. **Login Status**: Validates session cookies to ensure user is logged in

**Key Advantages**: 
- **Reliable**: Uses proven method from successful Zipsale extension
- **Simple**: Single endpoint request instead of complex DOM scraping
- **Authenticated**: Leverages user's existing session cookies
- **Efficient**: Minimal overhead with direct API approach
- **Maintainable**: Clean code without complex fallback mechanisms
- **Robust**: Less susceptible to frontend changes since it uses server-rendered content

## API Integration

### Endpoints
- **Production**: `https://fluf.io/wp-json/fc/circular-auth/v1/token`
- **Development**: `http://localhost:10006/wp-json/fc/circular-auth/v1/token`

### Request Format

#### Depop Channel
```json
{
  "channel": "depop",
  "token": "extracted_access_token",
  "user_id": "extracted_user_id",
  "userIdentifier": "wordpress_user_identifier" // optional
}
```

#### Vinted Channel
```json
{
  "channel": "vinted",
  "cookies": "full_cookie_string",
  "csrf_token": "extracted_csrf_token", // scraped from page HTML
  "user_id": "vinted_user_id", // optional
  "userIdentifier": "wordpress_user_identifier" // optional
}
```

## Backend Integration

### Channel-Based Routing
The FLUF backend (`rest-api.php`) supports channel-based routing:

- **`receive_circular_auth_tokens()`**: Main endpoint handler that routes based on channel
- **`handle_depop_auth_tokens()`**: Processes Depop authentication data
- **`handle_vinted_auth_tokens()`**: Processes Vinted authentication data (can extract CSRF from cookies)

### Data Storage
- **Depop**: Stores `depop_bearer_token` and `ext_id_for_depop` in user meta
- **Vinted**: Stores `vinted_cookies` and `ext_id_for_vinted` in user meta (backend extracts CSRF as needed)
- **Temporary Storage**: Vinted data can be stored temporarily via transients for unregistered users

## Security Features

- **Origin Validation**: Content script validates message origins
- **Same-Origin Policy**: Only accepts messages from same origin
- **Cookie-Only Access**: No external network requests that could be intercepted
- **Timeout Protection**: Prevents hanging operations
- **Error Handling**: Comprehensive error handling and logging
- **Channel Isolation**: Separate handling for different platform authentication methods
- **CSP Compliance**: No Content Security Policy violations

## User Experience

### Automatic Operation
- Installs silently and runs in background
- Periodic checks: Depop every 6 hours, Vinted every hour
- No user intervention required for normal operation
- Automatically detects which platform user is on

### Manual Control
- Popup provides status information
- Manual "Check Now" button for immediate extraction
- Clear success/error feedback with channel information
- Timestamp display for last check

## Development Notes

### Key Dependencies
- Chrome Extension Manifest V3
- Chrome APIs: alarms, storage, scripting, tabs, cookies
- No external dependencies (CSP-safe)

### Testing Considerations
- Works with both production (fluf.io) and development (localhost) environments
- No external network requests - all operations use browser cookies
- Comprehensive logging for debugging
- Channel-specific validation and error handling
- **New**: Fully CSP-compliant operation

### Architecture Changes (v1.0.6)
- **Cookie-Only Extraction**: Both platforms now use pure cookie extraction
- **CSP Compliance**: Removed all external fetch requests to prevent CSP violations
- **Simplified Manifest**: Removed Content Security Policy restrictions
- **Backend Processing**: CSRF token extraction moved to backend if needed
- **Improved Reliability**: No network dependencies for token extraction

## Privacy & Data Handling

### Data Collected
#### Depop
- Access tokens (temporary, for authentication)
- User IDs (for account linking)

#### Vinted  
- Session cookies (for maintaining login state)
- User IDs (when available, for account linking)

### Data Usage
- Tokens sent to FLUF API for circular authentication
- No password collection or storage
- Temporary extraction process only
- Channel-specific data handling

### User Notification
- Privacy notice displayed in popup
- Clear explanation of data collection purpose
- Transparent about background operation frequency

## File Structure
```
FLUF Chrome Extension/
├── manifest.json          # Extension configuration (v1.0.6, CSP-free)
├── background.js          # Service worker with cookie-only extraction
├── content.js            # Content script for page communication
├── popup.html            # Popup interface
├── popup.js              # Popup functionality
└── PROJECT_OVERVIEW.md   # This documentation
```

## Integration with FLUF Crosspost

This extension is designed to work seamlessly with the FLUF Crosspost system. The authentication tokens collected by this extension enable:

- **Vinted Integration**: Cookie-based authentication for Vinted marketplace operations
- **Depop Integration**: Bearer tokens for existing Depop functionality
- **Cross-Platform Sync**: Unified authentication system across multiple marketplaces

## Future Enhancements
- Enhanced error recovery mechanisms
- Additional platform support beyond Depop and Vinted
- Improved user settings and configuration options
- Real-time status updates in popup
- Enhanced security features
- Platform-specific optimization based on marketplace APIs 