// Content script for FLUF Chrome Extension
// Handles communication between web pages and the extension

console.log('FLUF Chrome Extension content script loaded');

// Listen for messages from the web page
window.addEventListener('message', async (event) => {
  // Only accept messages from trusted origins
  const trustedOrigins = [
    'http://localhost:10006',
    'http://fluf.local',
    'https://fluf.local',
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

// Inject a script to make the extension available to the page
const script = document.createElement('script');
script.textContent = `
  window.flufExtension = {
    isInstalled: true,
    version: '1.0.0',
    
    // Function to create Vinted listing
    createVintedListing: function(data) {
      return new Promise((resolve, reject) => {
        // Send message to content script
        window.postMessage({
          type: 'FCU_VINTED_CREATE_LISTING',
          data: data
        }, window.location.origin);
        
        // Listen for response
        const listener = (event) => {
          if (event.data.type === 'FCU_VINTED_CREATE_LISTING_RESPONSE') {
            window.removeEventListener('message', listener);
            if (event.data.data.success) {
              resolve(event.data.data);
            } else {
              reject(new Error(event.data.data.error || 'Failed to create listing'));
            }
          }
        };
        
        window.addEventListener('message', listener);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          window.removeEventListener('message', listener);
          reject(new Error('Request timed out'));
        }, 30000);
      });
    },
    
    // Function to check extension status
    checkStatus: function() {
      return new Promise((resolve) => {
        window.postMessage({
          type: 'FCU_CHECK_EXTENSION',
          data: {}
        }, window.location.origin);
        
        const listener = (event) => {
          if (event.data.type === 'FCU_CHECK_EXTENSION_RESPONSE') {
            window.removeEventListener('message', listener);
            resolve(event.data.data);
          }
        };
        
        window.addEventListener('message', listener);
        
        setTimeout(() => {
          window.removeEventListener('message', listener);
          resolve({ installed: false });
        }, 1000);
      });
    },
    
    // Function to get Vinted session
    getVintedSession: function(userIdentifier) {
      return new Promise((resolve, reject) => {
        window.postMessage({
          type: 'FCU_GET_VINTED_SESSION',
          data: { userIdentifier }
        }, window.location.origin);
        
        const listener = (event) => {
          if (event.data.type === 'FCU_GET_VINTED_SESSION_RESPONSE') {
            window.removeEventListener('message', listener);
            resolve(event.data.data);
          }
        };
        
        window.addEventListener('message', listener);
        
        setTimeout(() => {
          window.removeEventListener('message', listener);
          reject(new Error('Session check timed out'));
        }, 5000);
      });
    }
  };
  
  // Dispatch event to notify that extension is ready
  window.dispatchEvent(new CustomEvent('flufExtensionReady', { 
    detail: { version: '1.0.0' } 
  }));
`;
document.documentElement.appendChild(script);
script.remove();