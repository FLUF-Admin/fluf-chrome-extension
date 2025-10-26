# Vinted Tab Management Fix

## Issue Summary

The Chrome extension was creating **multiple duplicate Vinted tabs** instead of reusing existing ones, as evidenced by 7+ "VS" tabs visible in the browser.

### Root Causes Identified

1. **Window-Scoped Search** - Only searched for Vinted tabs in the current window, not across all windows
2. **Race Condition** - Multiple simultaneous authentication requests could all see "no tabs" before any created one
3. **Lock Bypass** - Manual triggers could bypass locks, creating additional tabs even when tab creation was in progress

## Changes Made

### 1. Global Tab Search (`background.js` line 536-539)

**Before:**
```javascript
const currentWindow = await chrome.windows.getCurrent();
const existingTabs = await chrome.tabs.query({
  windowId: currentWindow.id,  // ❌ Only current window
  url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)
});
```

**After:**
```javascript
// Check for existing Vinted tab in ALL windows (not just current)
const existingTabs = await chrome.tabs.query({
  url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)  // ✅ All windows
});
```

### 2. Strengthened Lock Mechanism (`background.js` line 549-597)

**Key Improvements:**
- ✅ **Smart lock bypass** - Manual triggers (user clicks "Reconnect") can bypass for immediate response
- ✅ **Automatic requests wait** - Scheduled checks and frontend auto-refreshes must wait
- ✅ **60-second max wait** with timeout protection for stale locks
- ✅ **Re-check after waiting** - Verifies if another process created a tab while waiting
- ✅ **Early return** - Uses existing cookies if another process created a tab

**Behavior:**
```javascript
// Automatic requests must wait
if ((locks active) && !isManualTrigger) {
  debugLog('🔒 VINTED: Authentication in progress, waiting...');
  
  // Wait up to 60 seconds
  while ((locks active) && (time < 60s)) {
    await sleep(500ms);
  }
  
  // Re-check for tabs created by other processes
  const recheckTabs = await chrome.tabs.query({
    url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)
  });
  
  if (recheckTabs.length > 0) {
    // Use existing tab's cookies instead of creating new one
    return extractedCookies;
  }
} else if (isManualTrigger && (locks active)) {
  debugLog('🔓 VINTED: Manual trigger - bypassing locks for immediate user action');
}
```

### 3. Duplicate Tab Cleanup Function (`background.js` line 392-437)

**New Helper Function:**
```javascript
async function closeDuplicateVintedTabs(keepTabId = null)
```

**Features:**
- ✅ Finds all Vinted tabs across all windows
- ✅ Keeps the most recently used tab (or specified tab)
- ✅ Closes all duplicates
- ✅ Handles errors gracefully

**Automatically called after successful cookie extraction:**
```javascript
// Step 8: Clean up duplicate tabs (keep only the one we used)
await closeDuplicateVintedTabs(tab.id);
```

### 4. Manual Cleanup Command

**New message handler in `background.js` (line 1528-1536):**
```javascript
else if (request.action === "FCU_CLOSE_DUPLICATE_VINTED_TABS") {
  closeDuplicateVintedTabs().then(() => {
    sendResponse({ success: true });
  });
}
```

**New content script handler in `content.js` (line 142-170):**
Forwards cleanup requests from web page to background script.

## How to Test

### Immediate Cleanup (For Existing Duplicates)

1. **Open browser console** on fluf.io
2. **Run the cleanup script:**
   ```javascript
   // Copy and paste cleanup-vinted-tabs.js into console
   ```
   Or manually:
   ```javascript
   window.postMessage({ type: 'FCU_CLOSE_DUPLICATE_VINTED_TABS' }, '*');
   ```

### Test New Behavior

1. **Close all Vinted tabs**
2. **Trigger Vinted authentication** 3-4 times rapidly
3. **Expected result:** Only 1 Vinted tab should be created/reused

## Files Modified

- ✅ `background.js` - Core tab management logic
- ✅ `content.js` - Message forwarding for cleanup
- ✅ `cleanup-vinted-tabs.js` - Helper script for immediate cleanup (NEW)
- ✅ `VINTED_TAB_MANAGEMENT_FIX.md` - This documentation (NEW)

## Technical Details

### Race Condition Prevention Flow

```
Automatic Request 1 → Sets locks → Checks for tabs → Creates tab if needed
Automatic Request 2 → Sees locks → WAITS 60s max → Re-checks → Uses existing tab
Automatic Request 3 → Sees locks → WAITS 60s max → Re-checks → Uses existing tab
Manual Trigger      → Sees locks → BYPASSES (user action) → Uses existing tab or creates new
```

**Why Manual Triggers Can Bypass:**
- User explicitly clicked "Reconnect" button - expects immediate response
- Better UX - no waiting for automatic background tasks
- Still uses global tab search to find/reuse existing tabs
- Duplicate cleanup ensures only one tab remains after auth

### Duplicate Detection & Cleanup

```
After successful authentication:
1. Query all windows for Vinted tabs
2. Sort by lastAccessed time (or prioritize keepTabId)
3. Keep first tab (most recent)
4. Close all others
5. Log results
```

## Expected Behavior

### Before Fix
- ❌ New tab created for each authentication request
- ❌ Multiple windows = multiple tab searches (only searched current window)
- ❌ Manual triggers bypass + window-scoped search = duplicate tabs
- ❌ No cleanup of duplicates

### After Fix
- ✅ Single tab reused across **all windows** (global search)
- ✅ Race conditions prevented with locks + re-checks for automatic requests
- ✅ Manual triggers can bypass locks for better UX (but still use global search)
- ✅ Automatic cleanup after successful authentication prevents duplicates
- ✅ Manual cleanup available via message

**Key Insight:** The duplicate tab issue was primarily caused by window-scoped search, not lock bypass. Manual triggers can safely bypass because:
1. Global tab search finds existing tabs across all windows
2. Automatic cleanup removes any duplicates after auth
3. Better UX for deliberate user actions

## Edge Cases Handled

1. **Stale locks** - 60-second timeout resets locks
2. **Closed tabs during retry** - Check if tab still exists before refresh
3. **Multiple windows** - Global search across all windows
4. **Rapid requests** - Lock coordination prevents race conditions
5. **Failed cleanup** - Graceful error handling, doesn't break authentication

## Browser Compatibility

Tested with Chrome extension APIs:
- `chrome.tabs.query()` - Finding tabs across windows
- `chrome.tabs.create()` - Creating new tabs
- `chrome.tabs.remove()` - Closing duplicate tabs
- `chrome.cookies.getAll()` - Extracting cookies
- `chrome.runtime.sendMessage()` - Message passing

## Future Improvements

Potential enhancements:
- [ ] Add telemetry to track how often duplicates occur
- [ ] Configurable cleanup behavior (keep newest vs oldest)
- [ ] Visual indicator when tabs are being managed
- [ ] Settings panel for tab management preferences


