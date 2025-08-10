// Content script for FLUF Chrome Extension
// Handles communication between web pages and the extension

console.log('FLUF Chrome Extension content script loaded');

// Listen for messages from the web page
window.addEventListener('message', async (event) => {
  // Only accept messages from trusted origins
  const trustedOrigins = [
    'http://localhost:10006',
    'http://fluf.local',
    'https://fluf.io'
  ];
  
  if (!trustedOrigins.includes(event.origin)) {
    return;
  }
  
  const { type, data } = event.data;
  
  if (type === 'FCU_VINTED_CREATE_LISTING') {
    console.log('📨 Content script received Vinted listing request from page');
    
    // Forward to background script
    chrome.runtime.sendMessage({
      action: 'FCU_VINTED_CREATE_LISTING',
      ...data
    }, (response) => {
      console.log('📨 Content script received response from background:', response);
      
      // Send response back to the page
      window.postMessage({
        type: 'FCU_VINTED_CREATE_LISTING_RESPONSE',
        data: response
      }, event.origin);
    });
  } else if (type === 'FCU_CHECK_EXTENSION') {
    // Check if extension is installed
    chrome.runtime.sendMessage({
      action: 'checkExtension'
    }, (response) => {
      window.postMessage({
        type: 'FCU_CHECK_EXTENSION_RESPONSE',
        data: response || { installed: true }
      }, event.origin);
    });
  } else if (type === 'FCU_GET_VINTED_SESSION') {
    // Get current Vinted session status
    chrome.runtime.sendMessage({
      action: 'FCU_getTokenViaContentScript',
      channel: 'vinted',
      userIdentifier: data.userIdentifier
    }, (response) => {
      window.postMessage({
        type: 'FCU_GET_VINTED_SESSION_RESPONSE',
        data: response
      }, event.origin);
    });
  }
});

// Instead of injecting inline script, we'll use a different approach
// We'll expose the API through custom events and data attributes

// Set a data attribute to indicate extension is installed
document.documentElement.setAttribute('data-fluf-extension', 'installed');
document.documentElement.setAttribute('data-fluf-extension-version', '1.0.0');

// Dispatch event to notify that extension is ready
window.dispatchEvent(new CustomEvent('flufExtensionReady', { 
  detail: { version: '1.0.0', installed: true } 
}));

// Listen for API calls from the page via custom events
window.addEventListener('fluf-extension-call', async (event) => {
  const { method, data, requestId } = event.detail;
  
  let response;
  
  switch(method) {
    case 'createVintedListing':
      // Forward to background script with context invalidation handling
      try {
        response = await chrome.runtime.sendMessage({
          action: 'FCU_VINTED_CREATE_LISTING',
          ...data
        });
      } catch (error) {
        console.error('Content script error:', error);
        
        // Check for context invalidation
        if (error.message && error.message.includes('Extension context invalidated')) {
          response = { 
            success: false, 
            error: 'Extension context invalidated. Please refresh the page and try again.' 
          };
        } else {
          response = { success: false, error: error.message };
        }
      }
      break;
      
    case 'checkStatus':
      response = { installed: true, version: '1.0.0' };
      break;
      
    case 'getVintedSession':
      try {
        response = await chrome.runtime.sendMessage({
          action: 'FCU_getTokenViaContentScript',
          channel: 'vinted',
          userIdentifier: data.userIdentifier
        });
      } catch (error) {
        console.error('Content script error:', error);
        
        if (error.message && error.message.includes('Extension context invalidated')) {
          response = { 
            success: false, 
            error: 'Extension context invalidated. Please refresh the page and try again.' 
          };
        } else {
          response = { success: false, error: error.message };
        }
      }
      break;
      
    default:
      response = { success: false, error: 'Unknown method' };
  }
  
  // Send response back via custom event
  window.dispatchEvent(new CustomEvent('fluf-extension-response', {
    detail: { requestId, response }
  }));
});