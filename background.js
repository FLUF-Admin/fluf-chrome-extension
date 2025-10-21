// Endpoints - send to localhost, local development, and production
const ENDPOINTS = [
  // "http://localhost:10007/wp-json/fc/circular-auth/v1/token",
  // "http://fluf.local/wp-json/fc/circular-auth/v1/token",
  "https://fluf.io/wp-json/fc/circular-auth/v1/token"
];

// Vinted domain mapping
const VINTED_DOMAINS = [
  'www.vinted.at', 'www.vinted.be', 'www.vinted.cz',
  'www.vinted.de', 'www.vinted.dk', 'www.vinted.es',
  'www.vinted.fi', 'www.vinted.fr', 'www.vinted.gr',
  'www.vinted.hr', 'www.vinted.hu', 'www.vinted.ie',
  'www.vinted.it', 'www.vinted.lt', 'www.vinted.lu',
  'www.vinted.nl', 'www.vinted.pl', 'www.vinted.pt',
  'www.vinted.ro', 'www.vinted.se', 'www.vinted.sk',
  'www.vinted.co.uk', 'www.vinted.com'
];

// Country to domain mapping for IP-based detection
const COUNTRY_TO_VINTED_DOMAIN = {
  'AT': 'https://www.vinted.at/',
  'BE': 'https://www.vinted.be/',
  'CZ': 'https://www.vinted.cz/',
  'DE': 'https://www.vinted.de/',
  'DK': 'https://www.vinted.dk/',
  'ES': 'https://www.vinted.es/',
  'FI': 'https://www.vinted.fi/',
  'FR': 'https://www.vinted.fr/',
  'GR': 'https://www.vinted.gr/',
  'HR': 'https://www.vinted.hr/',
  'HU': 'https://www.vinted.hu/',
  'IE': 'https://www.vinted.ie/',
  'IT': 'https://www.vinted.it/',
  'LT': 'https://www.vinted.lt/',
  'LU': 'https://www.vinted.lu/',
  'NL': 'https://www.vinted.nl/',
  'PL': 'https://www.vinted.pl/',
  'PT': 'https://www.vinted.pt/',
  'RO': 'https://www.vinted.ro/',
  'SE': 'https://www.vinted.se/',
  'SK': 'https://www.vinted.sk/',
  'GB': 'https://www.vinted.co.uk/',
  'UK': 'https://www.vinted.co.uk/',
  'US': 'https://www.vinted.com/',
  // Default fallback
  'DEFAULT': 'https://www.vinted.co.uk/'
};

// Helper function to check if URL is a Vinted domain
function isVintedDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return VINTED_DOMAINS.includes(hostname);
  } catch (e) {
    return false;
  }
}

// Helper function to get Vinted base URL from domain
function getVintedBaseUrl(domain) {
  return `https://${domain}/`;
}

// Helper function to extract country from Vinted URL
function getCountryFromVintedUrl(baseUrl) {
  const urlToCountryMap = {
    'https://www.vinted.at/': 'Austria',
    'https://www.vinted.be/': 'Belgium', 
    'https://www.vinted.cz/': 'Czech Republic',
    'https://www.vinted.de/': 'Germany',
    'https://www.vinted.dk/': 'Denmark',
    'https://www.vinted.es/': 'Spain',
    'https://www.vinted.fi/': 'Finland',
    'https://www.vinted.fr/': 'France',
    'https://www.vinted.gr/': 'Greece',
    'https://www.vinted.hr/': 'Croatia',
    'https://www.vinted.hu/': 'Hungary',
    'https://www.vinted.ie/': 'Ireland',
    'https://www.vinted.it/': 'Italy',
    'https://www.vinted.lt/': 'Lithuania',
    'https://www.vinted.lu/': 'Luxembourg',
    'https://www.vinted.nl/': 'Netherlands',
    'https://www.vinted.pl/': 'Poland',
    'https://www.vinted.pt/': 'Portugal',
    'https://www.vinted.ro/': 'Romania',
    'https://www.vinted.se/': 'Sweden',
    'https://www.vinted.sk/': 'Slovakia',
    'https://www.vinted.co.uk/': 'UK',
    'https://www.vinted.com/': 'USA'
  };
  
  return urlToCountryMap[baseUrl] || 'UK'; // Default to UK
}

// Function to get user's country from IP using ipapi.co
async function getUserCountryFromIP() {
  try {
    debugLog('🌍 Detecting user country from IP...');
    const response = await fetch('https://ipapi.co/country_code/', {
      method: 'GET',
      headers: {
        'User-Agent': 'FLUF-Extension/1.0'
      }
    });
    
    if (response.ok) {
      const countryCode = (await response.text()).trim().toUpperCase();
      debugLog('🌍 Detected country code:', countryCode);
      return countryCode;
    } else {
      debugLog('❌ IP detection failed, using default');
      return 'DEFAULT';
    }
  } catch (error) {
    console.error('❌ Error detecting country from IP:', error);
    return 'DEFAULT';
  }
}

// Function to get stored Vinted domain preference or detect from IP
async function getVintedDomainPreference() {
  try {
    // First check if we have a stored preference
    const stored = await chrome.storage.local.get(['vinted_domain_preference']);
    if (stored.vinted_domain_preference) {
      debugLog('✅ Using stored Vinted domain preference:', stored.vinted_domain_preference);
      return stored.vinted_domain_preference;
    }
    
    // If no stored preference, detect from IP
    debugLog('🔍 No stored Vinted domain preference, detecting from IP...');
    const countryCode = await getUserCountryFromIP();
    const detectedDomain = COUNTRY_TO_VINTED_DOMAIN[countryCode] || COUNTRY_TO_VINTED_DOMAIN['DEFAULT'];
    
    // Store the detected domain for future use
    await chrome.storage.local.set({ vinted_domain_preference: detectedDomain });
    debugLog('💾 Stored detected Vinted domain preference:', detectedDomain);
    
    return detectedDomain;
  } catch (error) {
    console.error('❌ Error getting Vinted domain preference:', error);
    return COUNTRY_TO_VINTED_DOMAIN['DEFAULT'];
  }
}

// Function to update stored Vinted domain preference
async function updateVintedDomainPreference(baseUrl) {
  try {
    await chrome.storage.local.set({ vinted_domain_preference: baseUrl });
    debugLog('💾 Updated Vinted domain preference:', baseUrl);
  } catch (error) {
    console.error('❌ Error updating Vinted domain preference:', error);
  }
}

// Initialize the extension when installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  debugLog('Extension installed/updated:', details.reason);

  // Set up separate alarms for each platform
  chrome.alarms.create("FCU_checkDepop", { periodInMinutes: 360 }); // Every 6 hours
  chrome.alarms.create("FCU_checkVinted", { periodInMinutes: 20 }); // Every 30 minutes

  // Run once on installation for both platforms
  getTokenViaContentScript();
});

// Direct extraction functions for scheduled checks
async function getDepopTokensDirectly() {
  debugLog('🔄 SCHEDULED DEPOP CHECK');
  return await getDepopTokensViaContentScript();
}

async function getVintedTokensDirectly() {
  debugLog('🔄 SCHEDULED VINTED CHECK');
  // Use stored domain preference for scheduled checks
  return await getVintedTokensViaContentScript();
}

// Initialize debug mode when extension starts
initializeDebugMode();

// Check debug mode periodically (every 30 seconds)
chrome.alarms.create("FCU_checkDebugMode", { periodInMinutes: 0.5 }); // Every 30 seconds

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setDebugMode') {
    // Direct debug mode setting from web app
    debugModeEnabled = request.enabled;
    debugModeChecked = true;
    debugLog('🔧 Debug mode directly set to:', debugModeEnabled ? 'ENABLED' : 'DISABLED');
    sendResponse({ success: true, debugEnabled: debugModeEnabled });
    return true;
  }
});

// Listen for the alarms to trigger
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "FCU_checkDepop") {
    getDepopTokensDirectly();
  } else if (alarm.name === "FCU_checkVinted") {
    handleVintedAlarmCheck();
  } else if (alarm.name === "FCU_checkDebugMode") {
    // Reset the debug mode check promise to force a fresh check
    debugModeCheckPromise = null;
    debugModeChecked = false;
    checkDebugMode().then((enabled) => {
      if (enabled !== debugModeEnabled) {
        debugModeEnabled = enabled;
        debugLog('🔧 Debug mode changed to:', enabled ? 'ENABLED' : 'DISABLED');
      }
    });
  }
});

// Enhanced Vinted alarm handler with coordination
async function handleVintedAlarmCheck() {
  debugLog('🔔 VINTED ALARM: Checking if refresh is needed...');
  
  try {
    // Check when the last frontend refresh occurred
    const storage = await chrome.storage.local.get(['vinted_last_frontend_refresh']);
    const lastFrontendRefresh = storage.vinted_last_frontend_refresh || 0;
    const timeSinceLastFrontendRefresh = Date.now() - lastFrontendRefresh;
    
    // If frontend refreshed within the last 15 minutes, skip this alarm
    const FRONTEND_GRACE_PERIOD = 15 * 60 * 1000; // 15 minutes
    
    if (timeSinceLastFrontendRefresh < FRONTEND_GRACE_PERIOD) {
      debugLog('🔔 VINTED ALARM: Skipping - frontend refreshed', Math.round(timeSinceLastFrontendRefresh / 60000), 'minutes ago');
      
      // Reset the alarm to fire after the remaining grace period
      const remainingGracePeriod = FRONTEND_GRACE_PERIOD - timeSinceLastFrontendRefresh;
      const nextAlarmDelay = Math.max(remainingGracePeriod + (5 * 60 * 1000), 10 * 60 * 1000); // At least 10 minutes
      
      debugLog('🔔 VINTED ALARM: Rescheduling alarm for', Math.round(nextAlarmDelay / 60000), 'minutes from now');
      
      // Clear existing alarm and create new one with adjusted timing
      chrome.alarms.clear("FCU_checkVinted");
      chrome.alarms.create("FCU_checkVinted", { 
        delayInMinutes: nextAlarmDelay / 60000,
        periodInMinutes: 20 // Resume normal 20-minute interval after this
      });
      
      return;
    }
    
    debugLog('🔔 VINTED ALARM: Proceeding with scheduled check');
    getVintedTokensDirectly();
    
  } catch (error) {
    console.error('🔔 VINTED ALARM: Error checking coordination:', error);
    // Fallback to normal check if coordination fails
    getVintedTokensDirectly();
  }
}

// Function to get Vinted coordination status (for debugging)
async function getVintedCoordinationStatus() {
  try {
    const storage = await chrome.storage.local.get(['vinted_last_frontend_refresh']);
    const lastFrontendRefresh = storage.vinted_last_frontend_refresh || 0;
    const timeSinceLastRefresh = Date.now() - lastFrontendRefresh;
    
    const alarms = await chrome.alarms.getAll();
    const vintedAlarm = alarms.find(alarm => alarm.name === "FCU_checkVinted");
    
    return {
      lastFrontendRefresh: new Date(lastFrontendRefresh).toISOString(),
      timeSinceLastRefresh: Math.round(timeSinceLastRefresh / 60000), // minutes
      nextAlarmTime: vintedAlarm ? new Date(vintedAlarm.scheduledTime).toISOString() : 'No alarm scheduled',
      alarmPeriod: vintedAlarm ? vintedAlarm.periodInMinutes : 'N/A'
    };
  } catch (error) {
    return { error: error.message };
  }
}

// WebRequest listener to capture Vinted cookies from XHR requests (specific domain only)
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Only capture Vinted requests from the specific domain we're working with
    if (!isVintedDomain(details.url)) {
      return;
    }

    // Look for cookie headers
    const cookieHeader = details.requestHeaders.find(header =>
      header.name.toLowerCase() === 'cookie'
    );

    if (cookieHeader && cookieHeader.value) {
      debugLog('🍪 VINTED XHR COOKIES CAPTURED:', cookieHeader.value.length, 'chars');

      // Store the captured cookies for later use
      chrome.storage.local.set({
        vinted_captured_cookies: {
          cookies: cookieHeader.value,
          timestamp: Date.now(),
          url: details.url
        }
      });
    }
  },
  { urls: VINTED_DOMAINS.map(domain => `*://${domain}/*`) },
  ["requestHeaders"]
);

// Add webRequest listener for Vinted redirects (like Zipsale)
let lastRequestInfo = null;

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details || !details.url.includes('/items/new')) return;

    const locationHeader = details.responseHeaders.find((h) => h.name.toLowerCase() === 'location');

    lastRequestInfo = {
      status: details.statusCode,
      location: locationHeader?.value || null,
      url: details.url,
      time: Date.now(),
    };
  },
  { urls: VINTED_DOMAINS.map(domain => `*://${domain}/items/new*`) },
  ['responseHeaders']
);

// WebRequest listener to capture Vinted cookies from response headers
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only capture Vinted responses from supported domains
    if (!isVintedDomain(details.url)) {
      return;
    }

    // Look for Set-Cookie headers
    const setCookieHeaders = details.responseHeaders.filter(header =>
      header.name.toLowerCase() === 'set-cookie'
    );

    if (setCookieHeaders.length > 0) {
      debugLog('🍪 VINTED SET-COOKIE HEADERS CAPTURED:', setCookieHeaders.length, 'headers');
    }
  },
  { urls: VINTED_DOMAINS.map(domain => `*://${domain}/*`) },
  ["responseHeaders"]
);

// Additional listener for API calls specifically
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Focus on API calls from supported Vinted domains
    if (!isVintedDomain(details.url)) {
      return;
    }

    // Look for API endpoints that typically require authentication
    const isApiCall = details.url.includes('/api/') ||
      details.url.includes('/items/new') ||
      details.url.includes('/account') ||
      details.url.includes('/member/');

    if (!isApiCall) {
      return;
    }

    const cookieHeader = details.requestHeaders.find(header =>
      header.name.toLowerCase() === 'cookie'
    );

    if (cookieHeader && cookieHeader.value) {
      debugLog('🔍 API CALL cookies captured from:', details.url);
    }
  },
  { urls: VINTED_DOMAINS.map(domain => `*://${domain}/*`) },
  ["requestHeaders"]
);

// Lock to prevent multiple concurrent calls to getVintedCookiesWithDevTools
let vintedCookiesExtractionLock = false;

// Global coordination to prevent multiple instances across windows
let globalVintedExtractionInProgress = false;

// Track last Vinted auth attempt to prevent rapid duplicates
let lastVintedAuthAttempt = 0;
const VINTED_AUTH_DEBOUNCE_MS = 3000; // 3 seconds

// Debug mode management
let debugModeEnabled = true;
let debugModeChecked = false;
let debugModeCheckPromise = null;

// Rate limiting for Vinted cookie extraction
let lastVintedDebuggerCheck = 0;
const VINTED_DEBUGGER_COOLDOWN = 15 * 60 * 1000; // 15 minutes in milliseconds

// Debug logging function
function debugLog(...args) {
  if (debugModeEnabled) {
    console.log(...args);
  }
}

// Check debug mode from FLUF web app (simple version)
async function checkDebugMode() {
  if (debugModeCheckPromise) {
    return debugModeCheckPromise;
  }
  
  debugModeCheckPromise = (async () => {
    try {
      // Get the current tab's URL to determine the correct origin
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let origin = 'https://fluf.io'; // fallback to production
      
      if (tabs.length > 0 && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          // Check if it's a FLUF Connect page (localhost or fluf.io)
          if (url.hostname === 'localhost' || url.hostname.includes('fluf.io') || url.hostname.includes('fluf.local')) {
            origin = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
          }
        } catch (e) {
          // If URL parsing fails, use fallback
        }
      }
      
      const response = await fetch(`${origin}/wp-json/fc/v1/debug/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        debugModeEnabled = data.debug_enabled || false;
        debugModeChecked = true;
        debugLog('🔧 Debug mode status:', debugModeEnabled ? 'ENABLED' : 'DISABLED');
      } else {
        debugModeEnabled = false;
        debugModeChecked = true;
        debugLog('🔧 Debug mode check failed, defaulting to disabled');
      }
    } catch (error) {
      debugModeEnabled = false;
      debugModeChecked = true;
      debugLog('🔧 Debug mode check error:', error);
    }
    
    return debugModeEnabled;
  })();
  
  return debugModeCheckPromise;
}

// Initialize debug mode check (simple version)
async function initializeDebugMode() {
  try {
    // Check debug mode from API (no user ID needed for simple version)
    await checkDebugMode();
  } catch (error) {
    debugModeEnabled = false;
    debugModeChecked = true;
    debugLog('🔧 Debug mode initialization error:', error);
  }
}

// Function to extract Vinted cookies using chrome.cookies.getAll (robust tab management)
async function getVintedCookiesWithDevTools(baseUrl = 'https://www.vinted.co.uk/', isManualTrigger = false) {
  // Check rate limiting (unless manually triggered)
  if (!isManualTrigger) {
    const now = Date.now();
    const timeSinceLastCheck = now - lastVintedDebuggerCheck;
    
    if (timeSinceLastCheck < VINTED_DEBUGGER_COOLDOWN) {
      const remainingMinutes = Math.ceil((VINTED_DEBUGGER_COOLDOWN - timeSinceLastCheck) / (60 * 1000));
      debugLog(`⏰ VINTED: Cookie check rate limited. Please wait ${remainingMinutes} more minutes or use manual trigger.`);
      return {
        success: false,
        message: `Rate limited. Please wait ${remainingMinutes} more minutes or use manual trigger.`,
        rateLimited: true
      };
    }
  }
  
  // Check global coordination to prevent multiple instances across windows
  if (globalVintedExtractionInProgress) {
    debugLog('🔒 VINTED: Global extraction already in progress in another window, skipping...');
    return {
      success: false,
      message: 'Vinted authentation already in progress in another window',
      rateLimited: true
    };
  }
  
  // Check if authentication is already in progress
  if (vintedCookiesExtractionLock) {
    debugLog('🔒 VINTED: Authentication already in progress, waiting...');
    
    // Wait for the current authentication to complete
    while (vintedCookiesExtractionLock) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    debugLog('🔓 VINTED: Previous authentication completed, retrying...');
  }
  
  // Set locks
  vintedCookiesExtractionLock = true;
  globalVintedExtractionInProgress = true;
  
  debugLog('🚀 VINTED: Starting robust cookie extraction with tab management...');
  debugLog('🎯 Target URL:', baseUrl);
  
  let tab;
  let createdNewTab = false;
  let shouldKeepTabOpen = false;
  
  try {
    // Step 1: Check for existing Vinted tab in current window
    const currentWindow = await chrome.windows.getCurrent();
    const existingTabs = await chrome.tabs.query({
      windowId: currentWindow.id,
      url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)
    });
    
    if (existingTabs.length > 0) {
      debugLog('📱 Using existing Vinted tab:', existingTabs[0].url);
      tab = existingTabs[0];
      createdNewTab = false;
      
      // Step 2a: Refresh existing tab to ensure fresh session
      debugLog('🔄 Refreshing existing Vinted tab to ensure fresh session...');
      await chrome.tabs.reload(tab.id);
      
      // Wait for refresh to complete with extended timeout for session refresh
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 90000); // 90 second timeout for session refresh
      });
      
      debugLog('✅ Existing Vinted tab refreshed and loaded');
    } else {
      debugLog('📱 Creating new Vinted tab...');
      // Step 2b: Create new tab with /items/new for better session refresh
      const targetUrl = baseUrl.replace(/\/$/, '') + '/items/new';
      tab = await chrome.tabs.create({
        url: targetUrl,
        active: false // Open in background
      });
      createdNewTab = true;
      shouldKeepTabOpen = true; // Keep new tabs open per user request
      
      debugLog('📱 Created new tab with URL:', targetUrl);
      
      // Wait for new tab to load with extended timeout for session refresh
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 90000); // 90 second timeout for session refresh
      });
      
      debugLog('✅ New Vinted tab loaded');
    }
    
    debugLog('📱 Tab ID:', tab.id);
    
    // Step 3: Extract cookies using chrome.cookies.getAll (more reliable than DevTools)
    debugLog('🍪 VINTED: Extracting cookies using chrome.cookies.getAll...');
    
    // Check if chrome.cookies API is available
    if (!chrome.cookies || !chrome.cookies.getAll) {
      throw new Error('chrome.cookies.getAll API not available. Extension may need cookies permission.');
    }
    
    const targetDomain = new URL(baseUrl).hostname;
    let vintedCookies;
    
    try {
      vintedCookies = await chrome.cookies.getAll({
        domain: targetDomain
      });
    } catch (cookieError) {
      debugLog('❌ VINTED: Error accessing cookies:', cookieError);
      throw new Error('Failed to access cookies. Extension may need cookies permission: ' + cookieError.message);
    }
    
    debugLog(`📊 VINTED: Found ${vintedCookies.length} cookies for domain ${targetDomain}`);
    
    // Also try getting cookies from subdomain (www.)
    if (!targetDomain.startsWith('www.')) {
      const wwwDomain = 'www.' + targetDomain;
      const wwwCookies = await chrome.cookies.getAll({
        domain: wwwDomain
      });
      vintedCookies.push(...wwwCookies);
      debugLog(`📊 VINTED: Found ${wwwCookies.length} additional cookies for www.${targetDomain}`);
    }
    
    // Remove duplicates based on cookie name and domain
    const uniqueCookies = vintedCookies.filter((cookie, index, self) => 
      index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
    );
    
    debugLog(`🎯 VINTED: Found ${uniqueCookies.length} unique Vinted cookies`);
    debugLog('🍪 VINTED cookies:', uniqueCookies.map(c => 
      `${c.name} (httpOnly: ${c.httpOnly}, secure: ${c.secure}, domain: ${c.domain})`
    ));
    
    // Step 4: Check for critical cookies
    const accessTokenWeb = uniqueCookies.find(c => c.name === 'access_token_web');
    const anonId = uniqueCookies.find(c => c.name === 'anon_id');
    const sessionCookie = uniqueCookies.find(c => c.name.includes('session'));
    
    debugLog('🔍 VINTED: Critical cookie check:');
    debugLog(' - access_token_web:', accessTokenWeb ? '✅ FOUND' : '❌ MISSING');
    debugLog(' - anon_id:', anonId ? '✅ FOUND' : '❌ MISSING');
    debugLog(' - session cookie:', sessionCookie ? '✅ FOUND' : '❌ MISSING');
    
    // Step 5: If critical cookies missing, implement retry logic for new tabs
    if (!accessTokenWeb && createdNewTab && shouldKeepTabOpen) {
      debugLog('⚠️ VINTED: Critical cookies missing from new tab, implementing retry logic...');
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        debugLog(`🔄 VINTED: Retry attempt ${attempt}/5 - waiting 2 minutes before retry...`);
        
        // Wait 2 minutes between retries (as requested)
        await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
        
        // Check if tab is still open
        try {
          const tabStatus = await chrome.tabs.get(tab.id);
          if (!tabStatus) {
            debugLog('❌ VINTED: Tab was closed, stopping retries');
            break;
          }
          
          // Refresh the tab before retrying
          debugLog(`🔄 VINTED: Refreshing tab for retry attempt ${attempt}`);
          await chrome.tabs.reload(tab.id);
          
          // Wait for refresh
          await new Promise(resolve => {
            const listener = (tabId, changeInfo) => {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }, 90000); // 90 second timeout
          });
          
          // Try extracting cookies again
          let retryCookies;
          try {
            retryCookies = await chrome.cookies.getAll({
              domain: targetDomain
            });
          } catch (retryCookieError) {
            debugLog(`❌ VINTED: Error accessing cookies on retry ${attempt}:`, retryCookieError);
            continue; // Skip this retry attempt
          }
          
          const retryAccessTokenWeb = retryCookies.find(c => c.name === 'access_token_web');
          
          if (retryAccessTokenWeb) {
            debugLog(`✅ VINTED: Success on retry attempt ${attempt}! Found access_token_web`);
            
            // Update cookies with successful retry
            uniqueCookies.length = 0; // Clear array
            uniqueCookies.push(...retryCookies);
            
            // Break out of retry loop
            break;
          } else {
            debugLog(`❌ VINTED: Retry attempt ${attempt} failed - still no access_token_web`);
          }
          
        } catch (tabError) {
          debugLog(`❌ VINTED: Error checking tab status on retry ${attempt}:`, tabError);
          break;
        }
      }
    }
    
    // Step 6: Don't close new tabs (keep them open as requested)
    if (createdNewTab && shouldKeepTabOpen) {
      debugLog('🔒 VINTED: Keeping new tab open as requested (not closing)');
      // Don't close the tab - leave it open for future use
    }
    
    // Final check for access_token_web
    const finalAccessTokenWeb = uniqueCookies.find(c => c.name === 'access_token_web');
    if (!finalAccessTokenWeb) {
      debugLog('❌ VINTED: access_token_web not found after all attempts - user not logged in');
      return {
        success: false,
        message: 'access_token_web cookie not found. Please log into Vinted.',
        cookies: uniqueCookies.map(c => c.name),
        cookieCount: uniqueCookies.length,
        tabKeptOpen: createdNewTab && shouldKeepTabOpen
      };
    }
    
    // Step 7: Format as cookie string
    const cookieString = uniqueCookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    debugLog('✅ VINTED: Success! Extracted', uniqueCookies.length, 'cookies');
    debugLog('🔑 VINTED access_token_web:', finalAccessTokenWeb.value.substring(0, 20) + '...');
    
    // Update last check time on successful extraction
    lastVintedDebuggerCheck = Date.now();
    
    return {
      success: true,
      cookieString: cookieString,
      accessTokenWeb: finalAccessTokenWeb.value,
      anonId: uniqueCookies.find(c => c.name === 'anon_id')?.value || null,
      totalCookies: uniqueCookies.length,
      cookies: uniqueCookies,
      tabKeptOpen: createdNewTab && shouldKeepTabOpen
    };
    
  } catch (error) {
    debugLog('❌ VINTED: Error:', error);
    
    // Don't close tabs on error if they were newly created
    if (createdNewTab && shouldKeepTabOpen) {
      debugLog('🔒 VINTED: Keeping tab open despite error (as requested)');
    }
    
    return {
      success: false,
      message: error.message,
      tabKeptOpen: createdNewTab && shouldKeepTabOpen
    };
  } finally {
    // Always release the locks
    vintedCookiesExtractionLock = false;
    globalVintedExtractionInProgress = false;
    debugLog('🔓 VINTED: Locks released');
  }
}

// Legacy function for backward compatibility (now uses chrome.cookies.getAll)
async function getVintedHeadersCookies(baseUrl = 'https://www.vinted.co.uk/', isManualTrigger = false) {
  debugLog('🔄 VINTED: Using chrome.cookies.getAll for cookie extraction...');
  const result = await getVintedCookiesWithDevTools(baseUrl, isManualTrigger);
  
  if (result.success) {
    return result.cookieString;
  } else {
    throw new Error(result.message || 'Failed to extract Vinted cookies');
  }
}


// Function to extract Vinted tokens
async function getVintedTokensViaContentScript(userIdentifier = "", baseUrl = null, isManualTrigger = false) {
  isManualTrigger = (userIdentifier === "manual_trigger") || isManualTrigger;
  debugLog('🟣 VINTED TOKEN EXTRACTION');
  
  // Debounce rapid duplicate calls (unless manually triggered)
  if (!isManualTrigger) {
    const now = Date.now();
    const timeSinceLastAttempt = now - lastVintedAuthAttempt;
    
    if (timeSinceLastAttempt < VINTED_AUTH_DEBOUNCE_MS) {
      debugLog(`⏸️ VINTED: Debouncing duplicate auth attempt (${timeSinceLastAttempt}ms since last attempt)`);
      return { 
        success: false, 
        message: 'Duplicate auth attempt debounced', 
        debounced: true 
      };
    }
    
    // Update last attempt timestamp
    lastVintedAuthAttempt = now;
  }
  
  // Check debug mode if not already checked
  if (!debugModeChecked) {
    await checkDebugMode();
  }
  
  // If no baseUrl provided, get from stored preference or detect from IP
  if (!baseUrl) {
    baseUrl = await getVintedDomainPreference();
  } else {
    // ALWAYS update stored preference when baseUrl is explicitly provided (user reconnection)
    debugLog('🔄 Updating stored Vinted domain preference to:', baseUrl);
    await updateVintedDomainPreference(baseUrl);
  }
  
  debugLog('🔍 Using base URL:', baseUrl);
  debugLog('🔍 Using userIdentifier:', userIdentifier);

  try {
    // First, debug what cookies are available
    // const debugInfo = await debugVintedCookies(); // Removed

    // if (!debugInfo || !debugInfo.isLoggedIn) { // Removed
    //   debugLog('❌ User not logged into Vinted - cannot proceed'); // Removed
    //   debugLog('💡 Please log into Vinted first, then try again'); // Removed
    //   console.groupEnd(); // Removed
    //   return { success: false, message: 'User not logged into Vinted' }; // Removed
    // } // Removed


    debugLog('❌ access_token_web cookie not found - attempting authentication...');

    // Get cookies from browser cookie store
    const cookieString = await getVintedHeadersCookies(baseUrl, isManualTrigger);

    if (!cookieString) {
      debugLog('❌ No Vinted cookies found');
      return { success: false, message: 'No cookies found' };
    }

    // Check if we have critical cookies for Vinted
    const hasAccessTokenWeb = cookieString.includes('access_token_web=');
    debugLog('🔍 FINAL cookie check:', {
      access_token_web: hasAccessTokenWeb ? '✅ PRESENT' : '❌ MISSING'
    });

    // If critical cookies are missing, trigger session refresh
    if (!hasAccessTokenWeb) {
      debugLog('🔄 CRITICAL COOKIES MISSING - triggering session refresh...');
      debugLog('💡 Missing cookies indicate expired session, attempting refresh...');

      try {
        // Trigger session refresh using Zipsale-style approach
        const refreshResult = await handleVintedSessionRefresh({
          userIdentifier: userIdentifier,
          hasValidSession: hasAccessTokenWeb,
          validateSession: true,
          autoRefresh: true,
          base_url: baseUrl
        });

        if (refreshResult.success) {
          debugLog('✅ Session refresh successful, retrying token extraction...');
          // Retry getting cookies after refresh
          const refreshedCookieString = await getVintedHeadersCookies(baseUrl, isManualTrigger);
          if (refreshedCookieString) {
            cookieString = refreshedCookieString;
            debugLog('✅ Updated cookies after refresh');

            // Notify frontend that connection is restored
            try {
              chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                  chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'VINTED_AUTH_RESTORED',
                    userIdentifier: userIdentifier
                  });
                }
              });
            } catch (error) {
              debugLog('Could not notify frontend of auth restoration:', error);
            }
          }
        } else {
          debugLog('❌ Session refresh failed:', refreshResult.error);
        }
      } catch (refreshError) {
        debugLog('❌ Session refresh error:', refreshError);
      }
    }

    // Extract user ID from cookies
    let userId = null;
    const vUidMatch = cookieString.match(/v_uid=([^;]+)/);
    if (vUidMatch) {
      userId = vUidMatch[1];
      debugLog('✅ Extracted user ID from v_uid cookie:', userId);
    }

    // If no v_uid, try to extract from access_token_web (JWT token)
    if (!userId) {
      const accessTokenMatch = cookieString.match(/access_token_web=([^;]+)/);
      if (accessTokenMatch && accessTokenMatch[1]) {
        try {
          const tokenParts = accessTokenMatch[1].split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            userId = payload.user_id || payload.sub || payload.id;
            debugLog('✅ Extracted user ID from JWT:', userId);
          }
        } catch (jwtError) {
          debugLog('❌ Could not decode JWT token:', jwtError.message);
        }
      }
    }

    const extractedData = {
      channel: 'vinted',
      fullCookies: cookieString,
      userId: userId,
      vintedUsername: null, // We'll get this from the HTML if needed
      hasAccessTokenWeb: hasAccessTokenWeb,
      baseUrl: baseUrl
    };
    
    sendTokenToAPI(extractedData, baseUrl, userIdentifier, null);
    console.groupEnd();

    return { success: true, message: 'Tokens found and sent to API' };

  } catch (error) {
    console.error('💥 Error extracting Vinted tokens:', error);
    console.groupEnd();
    return { success: false, error: error.message };
  }
}

// Function to extract Depop tokens using content script from opened tab
async function getDepopTokensViaContentScript(userIdentifier = "") {
  console.group('🟡 DEPOP TOKEN EXTRACTION');

  try {
    // Check if we already have a Depop tab open
    debugLog('🔍 Searching for existing Depop tabs...');
    let depopTab = await chrome.tabs.query({
      url: ["*://*.depop.com/*", "*://depop.com/*"]
    });
    debugLog('🔍 Found Depop tabs:', depopTab.length);

    let createdNewDepopTab = false;
    let tabId = null;
    if (depopTab.length === 0) {
      debugLog('📱 Creating new Depop tab...');
      const newTab = await chrome.tabs.create({
        url: 'https://www.depop.com',
        active: false // Open in background
      });
      tabId = newTab.id;
      createdNewDepopTab = true;
      debugLog('📱 Created new Depop tab with ID:', tabId);

      // Wait for page to load
      debugLog('⏳ Waiting for Depop page to load...');
      await new Promise(resolve => {
        const listener = function (updatedTabId, changeInfo, tab) {
          debugLog('🔧 Tab update event:', updatedTabId, changeInfo.status);
          if (updatedTabId === newTab.id && changeInfo.status === 'complete') {
            debugLog('✅ Depop page loaded successfully');
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Fallback timeout
        setTimeout(() => {
          debugLog('⏰ Depop page load timeout - proceeding anyway');
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 10000); // 10 second timeout
      });

      debugLog('✅ Depop tab loaded successfully');
    } else {
      debugLog('📱 Using existing Depop tab:', depopTab[0].url);
      tabId = depopTab[0].id;
    }

    // Inject content script to extract tokens from page context
    debugLog('🔧 Attempting to inject content script into Depop tab:', tabId);
    debugLog('🔧 Tab URL:', depopTab.length > 0 ? depopTab[0].url : 'New tab');
    
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
        console.log('🔧 Content script injected successfully into Depop page');
        // This function runs in the Depop page context
        function getCookie(name) {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop().split(';').shift();
          return null;
        }

        // Get all cookies from the page context
        const allCookies = document.cookie;
        console.log('🔧 All cookies:', allCookies);
        const accessToken = getCookie('access_token');
        const userId = getCookie('user_id');

        console.log('🔧 DEPOP COOKIES FOUND:', allCookies.length, 'chars');
        console.log('🔧 - access_token:', accessToken ? '[PRESENT]' : '[MISSING]');
        console.log('🔧 - user_id:', userId ? '[PRESENT]' : '[MISSING]');
        console.log('🔧 - Full cookie string:', allCookies.substring(0, 200) + '...');

        return {
          success: !!(accessToken && userId),
          accessToken: accessToken,
          userId: userId,
          allCookies: allCookies,
          sourceUrl: "https://www.depop.com"
        };
      }
      });
    } catch (injectionError) {
      console.error('💥 Script injection error:', injectionError);
      debugLog('🔧 Injection error details:', injectionError.message);
      
      // Close tab if we created it
      if (createdNewDepopTab && tabId) {
        debugLog('🗂️ Closing Depop tab that was created (injection error)');
        chrome.tabs.remove(tabId);
      }
      
      console.groupEnd();
      return { 
        success: false, 
        message: 'Script injection failed: ' + injectionError.message,
        error: injectionError.message 
      };
    }

    debugLog('🔧 Content script injection results:', results);
    
    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      debugLog('🔧 Content script result:', result);

      if (result.success) {
        debugLog('✅ DEPOP SUCCESS: Both access token and user ID found');
        const extractedData = {
          channel: 'depop',
          accessToken: result.accessToken,
          userId: result.userId
        };

        sendTokenToAPI(extractedData, result.sourceUrl, userIdentifier, null);

        // Close tab if we created it
        if (createdNewDepopTab && tabId) {
          debugLog('🗂️ Closing Depop tab that was created for token extraction');
          chrome.tabs.remove(tabId);
        }

        console.groupEnd();
        return { success: true, message: 'Tokens found and sent to API' };
      } else {
        debugLog('❌ DEPOP FAIL: Missing required tokens');

        // Close tab if we created it and failed
        if (createdNewDepopTab && tabId) {
          debugLog('🗂️ Closing Depop tab that was created (missing tokens)');
          chrome.tabs.remove(tabId);
        }

        console.groupEnd();
        return { success: false, message: 'User not logged in' };
      }
    } else {
      console.error('❌ DEPOP FAIL: Content script returned unexpected results');
      console.error('🔧 Results object:', results);
      console.error('🔧 Results length:', results ? results.length : 'null');
      console.error('🔧 First result:', results && results[0] ? results[0] : 'null');
      
      debugLog('❌ DEPOP FAIL: Content script injection failed');
      debugLog('🔧 Results object:', results);
      debugLog('🔧 Results length:', results ? results.length : 'null');
      debugLog('🔧 First result:', results && results[0] ? results[0] : 'null');

      // Close tab if we created it and failed
      if (createdNewDepopTab && tabId) {
        debugLog('🗂️ Closing Depop tab that was created (injection failed)');
        chrome.tabs.remove(tabId);
      }

      console.groupEnd();
      
      let errorDetail = 'Unknown error';
      if (!results) {
        errorDetail = 'No results returned from script execution';
      } else if (!results[0]) {
        errorDetail = 'Results array is empty';
      } else if (!results[0].result) {
        errorDetail = 'Result object is missing or undefined';
      }
      
      return { 
        success: false, 
        message: 'Content script injection failed: ' + errorDetail,
        error: errorDetail 
      };
    }

  } catch (error) {
    console.error('💥 Error extracting Depop tokens:', error);
    debugLog('🔧 Error details:', error);
    debugLog('🔧 Error stack:', error.stack);
    console.groupEnd();
    return { success: false, error: error.message };
  }
}

// Enhanced Vinted session refresh handler (based on Zipsale approach)
async function handleVintedSessionRefresh(request) {
  debugLog('🔄 VINTED SESSION REFRESH: Starting enhanced session refresh...');

  const userIdentifier = request.userIdentifier;
  const hasValidSession = request.hasValidSession;
  const validateSession = request.validateSession;

  try {
    // Step 1: Try API refresh first (like Zipsale)
    if (validateSession && !hasValidSession) {
      debugLog('🔄 VINTED SESSION REFRESH: Session appears expired, trying API refresh first...');

      try {
        // Try Vinted's session refresh API endpoint
        const baseUrl = request.base_url || 'https://www.vinted.co.uk/';
        const normalizedUrl = baseUrl.replace(/\/$/, '');
        const apiRefreshResult = await fetch(normalizedUrl + '/api/v2/sessions', {
          method: 'POST',
          headers: {
            'User-Agent': navigator.userAgent,
            'Content-Type': 'application/json',
          },
        });

        if (apiRefreshResult.ok) {
          debugLog('🔄 VINTED SESSION REFRESH: API refresh successful, proceeding with token extraction...');
          // Wait a moment for cookies to be updated
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          debugLog('🔄 VINTED SESSION REFRESH: API refresh failed, falling back to tab method...');
          throw new Error('API refresh failed');
        }
      } catch (apiError) {
        debugLog('🔄 VINTED SESSION REFRESH: API refresh error, using tab fallback:', apiError.message);

        // Step 2: Fallback to tab opening (like Zipsale)
        const refreshResult = await openVintedRefreshTab(baseUrl);
        if (!refreshResult) {
          debugLog('🔄 VINTED SESSION REFRESH: Both API and tab refresh failed');
        } else {
          debugLog('🔄 VINTED SESSION REFRESH: Tab refresh succeeded, waiting before token extraction...');
          // Wait a bit for cookies to be updated
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Step 3: Extract Vinted tokens (same as existing flow)
    const result = await getVintedTokensViaContentScript(userIdentifier, baseUrl);

    if (result && result.success) {
      debugLog('🔄 VINTED SESSION REFRESH: Tokens extracted successfully');
      return {
        success: true,
        message: 'Vinted session refresh completed successfully',
        channel: 'vinted',
        hasValidSession: true
      };
    } else {
      debugLog('🔄 VINTED SESSION REFRESH: Token extraction failed');
      return {
        success: false,
        message: result?.message || 'Failed to extract Vinted tokens',
        channel: 'vinted',
        hasValidSession: false,
        requiresRefresh: true
      };
    }
  } catch (error) {
    console.error('🔄 VINTED SESSION REFRESH: Error during refresh:', error);
    return {
      success: false,
      error: error.message,
      channel: 'vinted',
      hasValidSession: false,
      requiresRefresh: true
    };
  }
}

// Enhanced Vinted refresh tab (based on Zipsale's robust approach)
async function openVintedRefreshTab(baseUrl = 'https://www.vinted.co.uk/') {
  return new Promise((resolve) => {
    debugLog('🔄 Using base URL:', baseUrl);

    const vintedUrl = baseUrl.replace(/\/$/, '');
    const refreshUrl = `${vintedUrl}/items/new`;
    const redirectCheckUrls = [`${vintedUrl}/items/new`, `${vintedUrl}/member/signup/select_type*`];

    chrome.tabs.create({
      url: refreshUrl,
      active: false  // Hidden tab like Zipsale
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('🔄 VINTED SESSION REFRESH: Error creating tab:', chrome.runtime.lastError);
        resolve(false);
        return;
      }

      let resolved = false;
      let redirectedTo = null;

      // Enhanced webRequest listener (like Zipsale)
      const webRequestListener = async (details) => {
        if (details.tabId !== tab.id) {
          debugLog('🔄 VINTED SESSION REFRESH: Different tab ID, ignoring');
          return;
        }

        redirectedTo = details.url;
        debugLog('🔄 VINTED SESSION REFRESH: WebRequest detected:', redirectedTo);

        resolved = true;
        if (redirectedTo.startsWith(`${vintedUrl}/items/new`)) {
          debugLog('🔄 VINTED SESSION REFRESH: Success - redirected to new item page');
          cleanup(true);
        } else if (redirectedTo.includes('/signup') || redirectedTo.includes('/login')) {
          debugLog('🔄 VINTED SESSION REFRESH: Failure - redirected to signup/login');
          cleanup(false);
        } else {
          debugLog('🔄 VINTED SESSION REFRESH: Unknown redirect, treating as success');
          cleanup(true);
        }
      };

      // Fallback tab update listener
      const tabUpdateListener = (tabId, changeInfo, updatedTab) => {
        if (tabId !== tab.id || resolved) return;

        if (changeInfo.status === 'complete') {
          debugLog('🔄 VINTED SESSION REFRESH: Tab completed loading:', updatedTab.url);

          // If webRequest didn't catch it, check URL directly
          if (!resolved) {
            if (updatedTab.url && updatedTab.url.includes('/items/new')) {
              debugLog('🔄 VINTED SESSION REFRESH: Tab update - success');
              cleanup(true);
            } else if (updatedTab.url && (updatedTab.url.includes('/login') || updatedTab.url.includes('/signup'))) {
              debugLog('🔄 VINTED SESSION REFRESH: Tab update - failure');
              cleanup(false);
            }
          }
        }
      };

      // Set up listeners
      chrome.webRequest.onCompleted.addListener(webRequestListener, { urls: redirectCheckUrls });
      chrome.tabs.onUpdated.addListener(tabUpdateListener);

      // Timeout after 20 seconds (like Zipsale)
      const timeout = setTimeout(() => {
        if (!resolved) {
          debugLog('🔄 VINTED SESSION REFRESH: Timeout waiting for refresh (20s)');
          debugLog('🔄 VINTED SESSION REFRESH: Last known URL:', redirectedTo || 'none');
          cleanup(false);
        }
      }, 20000);

      const cleanup = (success) => {
        resolved = true;
        clearTimeout(timeout);

        // Remove listeners
        chrome.webRequest.onCompleted.removeListener(webRequestListener);
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);

        // Close the tab
        chrome.tabs.remove(tab.id, () => {
          debugLog('🔄 VINTED SESSION REFRESH: Refresh tab closed, success:', success);
          resolve(success);
        });
      };
    });
  });
}

// Main approach - check both platforms
function getTokenViaContentScript(sourceUrl = "", sendResponse = null, userIdentifier = "") {
  debugLog("Starting getTokenViaContentScript for sourceUrl:", sourceUrl);
  debugLog("Using userIdentifier:", userIdentifier);
  
  // If called from popup, treat as manual trigger to bypass rate limits
  const isManualTrigger = userIdentifier === "" && sourceUrl === "";

  console.group('🚀 Checking Both Platforms');
  debugLog('📋 Starting parallel checks for Depop and Vinted...');

  let completedChecks = 0;
  let allResults = [];
  let hasResponded = false;

  // Check Depop
    debugLog('🟡 Initiating Depop check...');
  getDepopTokensViaContentScript(userIdentifier).then((result) => {
    if (result && result.success) {
      debugLog('✅ Depop check completed successfully');
      allResults.push({ platform: 'Depop', success: true, data: { channel: 'depop' } });
    } else {
      debugLog('❌ Depop check completed but no data sent to API');
      allResults.push({ platform: 'Depop', success: false, error: result ? result.message : 'Unknown error' });
    }
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      debugLog(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  }).catch((error) => {
    console.error('❌ Depop extraction failed:', error);
    allResults.push({ platform: 'Depop', success: false, error: error.message });
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      debugLog(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  });

  // Check Vinted
  debugLog('🟣 Initiating Vinted check...');
  getVintedTokensViaContentScript(isManualTrigger ? "manual_trigger" : userIdentifier).then((result) => {
    if (result && result.success) {
      debugLog('✅ Vinted check completed successfully');
      allResults.push({ platform: 'Vinted', success: true, data: { channel: 'vinted' } });
    } else {
      debugLog('❌ Vinted check completed but no data sent to API');
      allResults.push({ platform: 'Vinted', success: false, error: result ? result.message : 'Unknown error' });
    }
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      debugLog(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  }).catch((error) => {
    console.error('❌ Vinted extraction failed:', error);
    allResults.push({ platform: 'Vinted', success: false, error: error.message });
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      debugLog(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FCU_getStatus") {
    chrome.storage.local.get("FCU_lastCheck", (data) => {
      sendResponse(data.FCU_lastCheck || { message: "No checks performed yet" });
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === "FCU_checkNow") {
    debugLog('🔄 MANUAL CHECK INITIATED from popup - checking both platforms (bypassing rate limits)...');
    debugLog('⚠️  WARNING: This is a legacy "check all platforms" action from the extension popup');
    debugLog('⚠️  For channel-specific auth, use FCU_getTokenViaContentScript with channel parameter');
    getTokenViaContentScript();
    sendResponse({ message: "Check initiated" });

  } else if (request.action === "checkExtension") {
    // Simple extension check - just respond that we're here
    sendResponse({ installed: true });
  } else if (request.action === "FCU_getVintedCoordinationStatus") {
    // Get Vinted coordination status for debugging
    getVintedCoordinationStatus().then(status => {
      sendResponse(status);
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === "FCU_VINTED_CREATE_LISTING") {
    // Handle Vinted listing creation from FLUF backend
    debugLog("🚀 VINTED LISTING: Received create listing request from FLUF");
    debugLog("Request data:", request);

    handleVintedListingCreation(request).then(result => {
      debugLog("✅ VINTED LISTING: Result:", result);
      sendResponse(result);
    }).catch(error => {
      console.error("❌ VINTED LISTING: Error:", error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error',
        channel: 'vinted'
      });
    });

    return true; // Keep message channel open for async response
  } else if (request.action === "FCU_getTokenViaContentScript") {
    debugLog("Received getTokenViaContentScript via content.js message");
    debugLog("Request data:", request);

    const channel = request.channel || 'depop'; // Default to depop for backward compatibility
    
    debugLog(`🔐 CHANNEL-SPECIFIC AUTH: Processing ${channel.toUpperCase()} authentication request`);
    debugLog(`🔐 CHANNEL ISOLATION: Will ONLY authenticate ${channel.toUpperCase()}, not other platforms`);

    // Route to specific platform based on channel
    if (channel === 'vinted') {
      const baseUrl = request.base_url; // Don't provide default here, let the function handle it

      debugLog('🟣 Processing Vinted auth request with baseUrl:', baseUrl);
      
      // Record frontend refresh timestamp for alarm coordination
      chrome.storage.local.set({ 
        vinted_last_frontend_refresh: Date.now() 
      });
      debugLog('🔔 VINTED COORDINATION: Recorded frontend refresh timestamp');
      
      getVintedTokensViaContentScript(request.userIdentifier, baseUrl, true).then(result => {
        debugLog('🟣 Vinted auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'vinted'
        };
        debugLog('🟣 Sending Vinted response to content script:', response);
        sendResponse(response);
      }).catch(error => {
        console.error('🟣 Vinted auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'vinted'
        };
        debugLog('🟣 Sending Vinted error response:', errorResponse);
        sendResponse(errorResponse);
      });
    } else {
      // Default to Depop
      debugLog('🟡 Processing Depop auth request');
      debugLog('🟡 DEPOP ONLY: Will authenticate ONLY Depop, not Vinted or other platforms');
      getDepopTokensViaContentScript(request.userIdentifier).then(result => {
        debugLog('🟡 Depop auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'depop'
        };
        debugLog('🟡 Sending Depop response to content script:', response);
        sendResponse(response);
      }).catch(error => {
        console.error('🟡 Depop auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'depop'
        };
        debugLog('🟡 Sending Depop error response:', errorResponse);
        sendResponse(errorResponse);
      });
    }

    return true; // ✅ ✅ ✅ ***CRUCIAL: TELL CHROME YOU WILL SEND RESPONSE LATER***
  }
});

// Function to handle Vinted listing creation
async function handleVintedListingCreation(request) {
  debugLog('🚀 VINTED LISTING: Starting listing creation process');
  debugLog('📋 VINTED LISTING: Request data:', { fid: request.fid, vid: request.vid, uid: request.uid });

  const { payload, headers, endpoint, method, fid, vid, uid, cookies } = request;
  
  // Extract cookies from headers if provided (backend fallback)
  const backendCookies = cookies || (headers && headers.cookies) || null;

  // Validate required parameters
  if (!fid) {
    throw new Error('Missing required parameter: fid');
  }
  if (!vid) {
    throw new Error('Missing required parameter: vid');
  }
  if (!uid) {
    throw new Error('Missing required parameter: uid');
  }

    debugLog(`✅ VINTED LISTING: Parameters validated - FID: ${fid}, VID: ${vid}, UID: ${uid}`);

  try {
    // Extract base URL from endpoint to get the right domain, or use stored preference
    let baseUrl;
    if (endpoint) {
      const endpointUrl = new URL(endpoint);
      baseUrl = `${endpointUrl.protocol}//${endpointUrl.hostname}/`;
    } else {
      // If no endpoint provided, use stored domain preference
      baseUrl = await getVintedDomainPreference();
    }
    
    debugLog('🎯 Using dynamic Vinted domain for listing creation:', baseUrl);
    
    // First, try to get cookies from extension, with backend cookies as fallback
    let cookieString = null;
    
    try {
      // Try to get fresh cookies from extension
      cookieString = await getVintedHeadersCookies(baseUrl, true);
      debugLog('✅ VINTED LISTING: Got fresh cookies from extension');
    } catch (extensionError) {
      debugLog('⚠️ VINTED LISTING: Extension cookie extraction failed:', extensionError.message);
      
      // Fallback to backend-provided cookies
      if (backendCookies && backendCookies.trim()) {
        cookieString = backendCookies.trim();
        debugLog('🔄 VINTED LISTING: Using backend-provided cookies as fallback');
        debugLog('📊 VINTED LISTING: Backend cookie length:', cookieString.length);
        debugLog('🍪 VINTED LISTING: Backend cookie source:', cookies ? 'direct cookies param' : 'headers.cookies');
      } else {
        debugLog('❌ VINTED LISTING: No backend cookies provided as fallback');
      }
    }

    if (!cookieString) {
      throw new Error('No Vinted cookies found - user needs to authenticate');
    }

    // Check if we have access_token_web cookie
    const hasAccessTokenWeb = cookieString.includes('access_token_web=');
    debugLog('🔍 access_token_web check:', hasAccessTokenWeb ? '✅ PRESENT' : '❌ MISSING');

    if (!hasAccessTokenWeb) {
      throw new Error('Missing access_token_web cookie - Vinted session expired');
    }

    // Build the complete headers for the request using dynamic domain
    const originUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const requestHeaders = {
      'Cookie': cookieString,
      'User-Agent': navigator.userAgent,
      'Referer': `${originUrl}/items/new`,
      'Origin': originUrl,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-uk-fr',
      'X-Enable-Multiple-Size-Groups': 'true',
      'X-Upload-Form': 'true',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    };

    // Add anon_id if provided
    if (headers && headers.anon_id) {
      requestHeaders['X-Anon-Id'] = headers.anon_id;
      debugLog('🆔 VINTED LISTING: Added anon ID from backend');
    }

    // Add CSRF token if provided - this is crucial for Vinted
    if (headers && headers.csrf_token) {
      requestHeaders['X-CSRF-token'] = headers.csrf_token;
      debugLog('🔐 VINTED LISTING: Added CSRF token from backend');
    } else {
      debugLog('⚠️ VINTED LISTING: No CSRF token provided - request may fail');
    }

    debugLog('📡 VINTED LISTING: Making request to:', endpoint);
    debugLog('📦 VINTED LISTING: Payload size:', JSON.stringify(payload).length, 'chars');

    // Make the actual request to Vinted
    const response = await fetch(endpoint, {
      method: method || 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      redirect: 'manual'
    });

    debugLog('📡 VINTED LISTING: Response status:', response.status);

    const responseData = await response.json();

    if (response.ok && responseData.item && responseData.item.id) {
      debugLog('✅ VINTED LISTING: Success! Item ID:', responseData.item.id);

      // Send success callback to WordPress
      const callbackResult = await sendVintedCallbackToWordPress({
        success: true,
        item_id: responseData.item.id,
        fid: fid,
        vid: vid,
        uid: uid
      });

      return {
        success: true,
        item_id: responseData.item.id,
        item_url: `${originUrl}/items/${responseData.item.id}`,
        channel: 'vinted'
      };
    } else {
      debugLog('❌ VINTED LISTING: Failed with response:', responseData);

      // Extract error message
      let errorMessage = 'Failed to list on Vinted';
      let errorCode = null;

      if (responseData.errors) {
        if (Array.isArray(responseData.errors)) {
          // Extract meaningful error messages from objects
          const errorMessages = responseData.errors.map(error => {
            if (typeof error === 'object' && error !== null) {
              return error.message || error.text || JSON.stringify(error);
            }
            return String(error);
          }).filter(msg => msg && msg !== '{}');

          errorMessage = errorMessages.length > 0 ? errorMessages.join(', ') : 'Validation errors occurred';
        } else if (typeof responseData.errors === 'object') {
          const errorMessages = Object.values(responseData.errors).flat().map(error => {
            if (typeof error === 'object' && error !== null) {
              return error.message || error.text || JSON.stringify(error);
            }
            return String(error);
          }).filter(msg => msg && msg !== '{}');

          errorMessage = errorMessages.length > 0 ? errorMessages.join(', ') : 'Validation errors occurred';
        }
      } else if (responseData.message) {
        errorMessage = responseData.message;
      }

      debugLog('🔍 VINTED ERROR: Extracted message:', errorMessage);

      if (responseData.code) errorCode = responseData.code;

      // Send error callback to WordPress
      await sendVintedCallbackToWordPress({
        success: false,
        location: 'else',
        error: errorMessage,
        error_code: errorCode,
        fid: fid,
        vid: vid,
        uid: uid,
        response: responseData,
        body: payload,
      });

      return {
        success: false,
        error: errorMessage,
        error_code: errorCode,
        channel: 'vinted'
      };
    }

  } catch (error) {
    console.error('💥 VINTED LISTING: Exception:', error);

    // Send error callback to WordPress
    await sendVintedCallbackToWordPress({
      success: false,
      location: 'try-catch',
      error: error.message,
      fid: fid,
      vid: vid,
      uid: uid,
      body: payload,
    });

    // Return error response instead of throwing to allow frontend to handle properly
    return {
      success: false,
      error: error.message,
      channel: 'vinted'
    };
  }
}

// Function to send callback to WordPress after Vinted listing attempt
async function sendVintedCallbackToWordPress(data) {
  debugLog('📤 Sending callback to FLUF:', data);

  const endpoints = [
    'http://localhost:10006/wp-json/fc/listings/v1/vinted-extension-callback',
    'https://fluf.io/wp-json/fc/listings/v1/vinted-extension-callback'
  ];

  // Try all endpoints and return first successful result
  let firstSuccessfulResult = null;
  const results = [];

  for (const endpoint of endpoints) {
    try {
      debugLog(`🔄 Trying callback endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        debugLog(`✅ Callback successful at ${endpoint}:`, result);
        results.push({ endpoint, success: true, result });

        // Store first successful result but continue trying other endpoints
        if (!firstSuccessfulResult) {
          firstSuccessfulResult = result;
        }
      } else {
        debugLog(`❌ Callback failed at ${endpoint}: ${response.status} ${response.statusText}`);
        results.push({ endpoint, success: false, status: response.status });
      }
    } catch (error) {
      console.error(`❌ Callback error at ${endpoint}:`, error);
      results.push({ endpoint, success: false, error: error.message });
    }
  }

  // Log summary of all attempts
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  debugLog(`📊 Callback summary: ${successful} successful, ${failed} failed out of ${results.length} endpoints`);

  if (firstSuccessfulResult) {
    debugLog('✅ Returning first successful result');
    return firstSuccessfulResult;
  } else {
    debugLog('❌ All callback endpoints failed');
    return null;
  }
}

// Function to send the token to the WordPress API using fetch
function sendTokenToAPI(extractedData, sourceUrl = "", userIdentifier = "", sendResponse = null) {
  const { accessToken, userId, channel, fullCookies, anonId, vintedUsername, baseUrl } = extractedData;

  if (!channel) {
    debugLog("No channel detected");
    if (sendResponse) {
      sendResponse({
        success: false,
        error: "No channel detected"
      });
    }
    return;
  }

  // Validate required data based on channel
  if (channel === 'depop' && (!accessToken || !userId)) {
    debugLog("No Depop token or user_id found");
    if (sendResponse) {
      sendResponse({
        success: false,
        error: "No Depop token or user_id found"
      });
    }
    return;
  }

  if (channel === 'vinted' && !fullCookies) {
    debugLog("No Vinted cookies found");
    if (sendResponse) {
      sendResponse({
        success: false,
        error: "No Vinted cookies found"
      });
    }
    return;
  }

  // Send to both endpoints
  debugLog("Sending data to both localhost and production endpoints");

  // Build request body based on channel
  let requestBody = {
    channel: channel
  };

  if (channel === 'depop') {
    requestBody.token = accessToken;
    requestBody.user_id = userId;
  } else if (channel === 'vinted') {
    requestBody.cookies = fullCookies;

    // Verify access_token_web is included in the aggregated cookies
    const hasAccessTokenWeb = fullCookies.includes('access_token_web');
    debugLog('🔍 VERIFYING VINTED COOKIES:');
    debugLog(' - access_token_web present:', hasAccessTokenWeb ? '✅ YES' : '❌ NO');
    debugLog(' - Total cookie string length:', fullCookies.length);

    if (hasAccessTokenWeb) {
      // Extract and log a preview of the access_token_web value
      const accessTokenMatch = fullCookies.match(/access_token_web=([^;]+)/);
      if (accessTokenMatch) {
        debugLog(' - access_token_web value length:', accessTokenMatch[1].length);
        debugLog(' - access_token_web preview:', accessTokenMatch[1].substring(0, 50) + '...');
      }
    }

    if (userId) {
      requestBody.user_id = userId;
    }
    if (anonId) {
      requestBody.anon_id = anonId;
    }
    if (vintedUsername) {
      requestBody.vinted_username = vintedUsername;
    }

    // Add access token status to request
    requestBody.has_access_token_web = hasAccessTokenWeb;
    
    // Add base_url and country for Vinted domain persistence
    if (baseUrl) {
      requestBody.base_url = baseUrl;
      // Extract country from base_url
      const country = getCountryFromVintedUrl(baseUrl);
      if (country) {
        requestBody.country = country;
      }
    }
  }

  // Add userIdentifier if provided (should be the WordPress UID or RID)
  debugLog("🔍 DEBUG: userIdentifier parameter:", userIdentifier, "type:", typeof userIdentifier);
  if (userIdentifier) {
    requestBody.userIdentifier = userIdentifier;
    debugLog("✅ Using WordPress user identifier:", userIdentifier);
  } else {
    debugLog("❌ No userIdentifier provided - this will cause issues!");
  }

  debugLog("Sending data to API:", { ...requestBody, cookies: requestBody.cookies ? '[REDACTED]' : undefined });
  debugLog("Endpoints:", ENDPOINTS);
  
  // Log Vinted-specific fields for debugging
  if (channel === 'vinted') {
    debugLog('🟣 VINTED API DATA:');
    debugLog(' - base_url:', requestBody.base_url);
    debugLog(' - country:', requestBody.country);
    debugLog(' - user_id:', requestBody.user_id);
    debugLog(' - has_access_token_web:', requestBody.has_access_token_web);
  }

  // Add additional logging for debugging
  debugLog("Source URL:", sourceUrl);
  debugLog("User Identifier:", userIdentifier);
  debugLog("Channel:", channel);

  // Additional validation for Vinted cookies
  if (channel === 'vinted' && requestBody.cookies) {
    debugLog('📋 FINAL VINTED COOKIE VALIDATION:');
    debugLog(' - Total cookies being sent:', requestBody.cookies.split(';').length);
    debugLog(' - Cookie names being sent:', requestBody.cookies.split(';').map(c => c.split('=')[0].trim()).join(', '));
    debugLog(' - access_token_web included:', requestBody.cookies.includes('access_token_web') ? '✅ YES' : '❌ NO');

    debugLog(' - vinted_fr_session included:', requestBody.cookies.includes('vinted_fr_session') ? '✅ YES' : '❌ NO');
    debugLog(' - anon_id included:', requestBody.cookies.includes('anon_id') ? '✅ YES' : '❌ NO');

    // Check for critical cookies for crosslisting
    const criticalCookies = ['access_token_web', 'anon_id'];
    const missingCritical = criticalCookies.filter(cookie => !requestBody.cookies.includes(cookie));

    if (missingCritical.length > 0) {
      debugLog('⚠️ WARNING: Missing critical cookies for crosslisting:', missingCritical.join(', '));
    } else {
      debugLog('✅ All critical cookies present for crosslisting');
    }
  }

  // Send to both endpoints simultaneously
  const fetchPromises = ENDPOINTS.map(endpoint =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
      .then(async response => {
        debugLog(`API response status for ${endpoint}:`, response.status);
        if (response.ok) {
          const data = await response.json();
          return { endpoint, success: true, data };
        } else {
          // Capture error details
          let errorDetails = `${response.status} ${response.statusText}`;
          try {
            const errorBody = await response.text();
            if (errorBody) {
              errorDetails += ` - ${errorBody}`;
            }
          } catch (parseError) {
            // If we can't parse the error body, just use status
          }
          console.error(`❌ API Error for ${endpoint}:`, errorDetails);
          return { endpoint, success: false, error: errorDetails };
        }
      })
      .catch(error => {
        console.error(`❌ Network Error for ${endpoint}:`, error);
        return { endpoint, success: false, error: error.message };
      })
  );

  // Wait for all requests to complete
  Promise.all(fetchPromises)
    .then(results => {
      debugLog("All API responses:", results);

      // Check if at least one request succeeded
      const successfulResults = results.filter(result => result.success);
      const failedResults = results.filter(result => !result.success);

      if (successfulResults.length > 0) {
        logStatus(`Data sent successfully`, true);

        if (sendResponse) {
          sendResponse({
            success: true,
            data: successfulResults[0].data, // Return data from first successful response
            channel: channel,
            results: results // Include all results for debugging
          });
        }
      } else {

        if (sendResponse) {
          sendResponse({
            success: false,
            error: errorMessage,
            channel: channel,
            results: results
          });
        }
      }
    });
}

// Log the status to storage for the popup to display
function logStatus(message, success) {
  chrome.storage.local.set({
    FCU_lastCheck: {
      message: message,
      success: success,
      timestamp: new Date().toISOString()
    }
  });
}