// Endpoints - send to localhost, local development, and production
const ENDPOINTS = [
  "http://localhost:10006/wp-json/fc/circular-auth/v1/token",
  "http://fluf.local/wp-json/fc/circular-auth/v1/token",
  "https://fluf.local/wp-json/fc/circular-auth/v1/token",
  "https://fluf.io/wp-json/fc/circular-auth/v1/token"
];

// Initialize the extension when installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Set up separate alarms for each platform
  chrome.alarms.create("FCU_checkDepop", { periodInMinutes: 360 }); // Every 6 hours
  chrome.alarms.create("FCU_checkVinted", { periodInMinutes: 20 }); // Every 30 minutes

  // Run once on installation for both platforms
  getTokenViaContentScript();
});

// Direct extraction functions for scheduled checks
async function getDepopTokensDirectly() {
  console.log('🔄 SCHEDULED DEPOP CHECK');
  return await getDepopTokensViaContentScript();
}

async function getVintedTokensDirectly() {
  console.log('🔄 SCHEDULED VINTED CHECK');  
  return await getVintedTokensViaContentScript();
}

// Listen for the alarms to trigger
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "FCU_checkDepop") {
    getDepopTokensDirectly();
  } else if (alarm.name === "FCU_checkVinted") {
    getVintedTokensDirectly();
  }
});

// WebRequest listener to capture Vinted cookies from XHR requests
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Only capture Vinted requests
    if (!details.url.includes('vinted.co.uk') && !details.url.includes('vinted.com')) {
      return;
    }
    
    // Look for cookie headers
    const cookieHeader = details.requestHeaders.find(header => 
      header.name.toLowerCase() === 'cookie'
    );
    
    if (cookieHeader && cookieHeader.value) {
      console.log('🍪 VINTED XHR COOKIES CAPTURED:', cookieHeader.value.length, 'chars');
      
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
  { urls: ["*://*.vinted.co.uk/*", "*://*.vinted.com/*"] },
  ["requestHeaders"]
);

// WebRequest listener to capture Vinted cookies from response headers
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only capture Vinted responses
    if (!details.url.includes('vinted.co.uk') && !details.url.includes('vinted.com')) {
      return;
    }
    
    // Look for Set-Cookie headers
    const setCookieHeaders = details.responseHeaders.filter(header => 
      header.name.toLowerCase() === 'set-cookie'
    );
    
    if (setCookieHeaders.length > 0) {
      console.log('🍪 VINTED SET-COOKIE HEADERS CAPTURED:', setCookieHeaders.length, 'headers');
    }
  },
  { urls: ["*://*.vinted.co.uk/*", "*://*.vinted.com/*"] },
  ["responseHeaders"]
);

// Additional listener for API calls specifically
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Focus on API calls
    if (!details.url.includes('vinted.co.uk') && !details.url.includes('vinted.com')) {
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
      console.log('🔍 API CALL cookies captured from:', details.url);
    }
  },
  { urls: ["*://*.vinted.co.uk/*", "*://*.vinted.com/*"] },
  ["requestHeaders"]
);

// Function to get Vinted cookies from captured XHR data
async function getVintedCookiesFromXHR() {
  try {
    const data = await chrome.storage.local.get(['vinted_captured_cookies']);
    
    // Check for recently captured XHR cookies
    if (data.vinted_captured_cookies) {
      const captured = data.vinted_captured_cookies;
      const age = Date.now() - captured.timestamp;
      
      // Only use cookies captured in the last 5 minutes
      if (age < 5 * 60 * 1000) {
        console.log('✅ Using captured XHR cookies (age:', Math.round(age/1000), 'seconds)');
        return captured.cookies;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting captured XHR cookies:', error);
    return null;
  }
}

// Function to get complete Vinted cookie string
async function getVintedHeadersCookies() {
  try {
    // First, try to get from XHR capture
    const xhrCookies = await getVintedCookiesFromXHR();
    if (xhrCookies) {
      console.log('✅ Using XHR-captured cookies');
      return xhrCookies;
    }
    
    // Fallback to browser cookie store
    const domains = [
      'https://www.vinted.co.uk',
      'https://vinted.co.uk', 
      'https://www.vinted.com',
      'https://vinted.com',
      'https://.vinted.co.uk',
      'https://.vinted.com',
      'https://.www.vinted.co.uk',
      'https://.www.vinted.com'
    ];
    
    let allCookies = [];
    
    for (const domain of domains) {
      try {
        const cookies = await chrome.cookies.getAll({ url: domain });
        allCookies = allCookies.concat(cookies);
      } catch (error) {
        // Silently skip domains that fail
      }
    }
    
    // Remove duplicates based on name and domain
    const uniqueCookies = [];
    const seen = new Set();
    
    allCookies.forEach(cookie => {
      const key = `${cookie.name}:${cookie.domain}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCookies.push(cookie);
      }
    });
    
    const cookieString = uniqueCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    
    console.log('🍪 VINTED COOKIES:', uniqueCookies.length, 'cookies,', cookieString.length, 'chars');
    
    return cookieString;
  } catch (error) {
    console.error('Error collecting Vinted cookies:', error);
    throw error;
  }
}

// Function to extract Vinted CSRF token from /items/new page
async function getVintedCSRFFromItemsNewWithCookies(cookieHeader) {
  try {
    console.log('🔍 Extracting CSRF token from /items/new...');
    
    // Request the /items/new page with the complete cookie string
    const response = await fetch('https://www.vinted.co.uk/items/new', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': navigator.userAgent,
        Referer: 'https://www.vinted.co.uk',
        Origin: 'https://www.vinted.co.uk',
        Accept: 'text/html',
      },
      redirect: 'manual',
    });
    
    console.log('📡 /items/new response status:', response.status);
    
    if (response.status === 200) {
      const html = await response.text();
      
      // Use Zipsale's exact pattern
      const match = html.match(/\\"CSRF_TOKEN\\":\\"([^"]+)\\"/);
      const csrfToken = match ? match[1] : null;
      const anonId = response.headers.get('x-anon-id');
      
      // Extract Vinted username from figure img alt attribute
      let vintedUsername = null;
      
      // Try multiple patterns to extract the username from HTML
      // Pattern 1: Look for figure with class "header-avatar" containing img with alt
      let usernameMatch = html.match(/<figure[^>]*class="[^"]*header-avatar[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"[^>]*>/i);
      
      // Pattern 2: Basic figure img alt attribute  
      if (!usernameMatch) {
        usernameMatch = html.match(/<figure[^>]*>\s*<img[^>]*alt="([^"]+)"[^>]*>/i);
      }
      
      // Pattern 3: Look for img with alt inside any figure (more flexible)
      if (!usernameMatch) {
        usernameMatch = html.match(/<figure[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"[^>]*>[\s\S]*?<\/figure>/i);
      }
      
      // Pattern 4: Look for div with header-avatar class containing img
      if (!usernameMatch) {
        usernameMatch = html.match(/<div[^>]*class="[^"]*header-avatar[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"[^>]*>/i);
      }
      
      // Pattern 5: Look for any img with class containing "avatar" or "user"
      if (!usernameMatch) {
        usernameMatch = html.match(/<img[^>]*class="[^"]*(?:avatar|user)[^"]*"[^>]*alt="([^"]+)"[^>]*>/i);
      }
      
      // Pattern 6: Look for username in data attributes or specific patterns
      if (!usernameMatch) {
        usernameMatch = html.match(/data-username="([^"]+)"/i);
      }
      
      // Pattern 7: Look for any img with alt that looks like a username (no spaces, alphanumeric)
      if (!usernameMatch) {
        const allImgMatches = html.match(/<img[^>]*alt="([a-zA-Z0-9_.-]+)"[^>]*/gi);
        if (allImgMatches) {
          for (const imgMatch of allImgMatches) {
            const altMatch = imgMatch.match(/alt="([a-zA-Z0-9_.-]+)"/);
            if (altMatch && altMatch[1] && altMatch[1].length > 3 && !altMatch[1].includes(' ')) {
              usernameMatch = altMatch;
              break;
            }
          }
        }
      }
      
      if (usernameMatch) {
        vintedUsername = usernameMatch[1];
        console.log('✅ Vinted username extracted:', vintedUsername);
      } else {
        console.log('❌ Vinted username not found in HTML - trying alternative methods...');
        
        // Log a sample of the HTML around figure tags for debugging
        const figureMatch = html.match(/<figure[\s\S]{0,200}>/i);
        if (figureMatch) {
          console.log('🔍 Sample figure HTML found:', figureMatch[0]);
        }
        
        // Look for any img tags with alt attributes for debugging
        const allImgAlts = html.match(/<img[^>]*alt="([^"]+)"[^>]*/gi);
        if (allImgAlts) {
          console.log('🔍 All img alt attributes found:', allImgAlts.slice(0, 5)); // Show first 5
        }
      }
      
      if (csrfToken) {
        console.log('✅ CSRF token extracted successfully');
        return { csrfToken, anonId, vintedUsername };
      } else {
        console.log('❌ CSRF token not found in HTML response');
        
        // Try alternative patterns
        const altMatch = html.match(/CSRF_TOKEN["\s]*:["\s]*"([^"]+)"/);
        if (altMatch) {
          console.log('✅ Found CSRF token with alternative pattern');
          return { csrfToken: altMatch[1], anonId, vintedUsername };
        }
      }
    } else if (response.status === 307 || response.status === 401) {
      console.log('❌ Session expired or not authenticated (status:', response.status, ')');
      return null;
    } else {
      console.log('❌ Unexpected response status:', response.status);
    }
    
  } catch (error) {
    console.error('💥 Error fetching CSRF from /items/new:', error);
    return null;
  }
  
  return null;
}
// Function to get Vinted CSRF token using Zipsale's exact method
async function getVintedCSRFTokenZipsaleStyle() {
  console.log('🔍 Getting Vinted CSRF token using Zipsale method...');
  
  try {
    const cookieString = await getVintedHeadersCookies();
    
    // Use Zipsale's exact approach - direct fetch with manual redirect
    const response = await fetch('https://www.vinted.co.uk/items/new', {
      method: 'GET',
      headers: {
        Cookie: cookieString,
        'User-Agent': navigator.userAgent,
        Referer: 'https://www.vinted.co.uk',
        Origin: 'https://www.vinted.co.uk',
        Accept: 'text/html',
      },
      redirect: 'manual', // Key: prevent automatic redirects
    });
    
    console.log('📡 /items/new response status:', response.status);
    
    // Handle 307 redirect (session refresh needed)
    if (response.status === 307) {
      console.log('🔄 Session expired, attempting refresh...');
      
      // Try to refresh session
      const refreshResponse = await fetch('https://www.vinted.co.uk/api/v2/sessions', {
        method: 'POST',
        headers: {
          Cookie: cookieString,
          'User-Agent': navigator.userAgent,
          'Content-Type': 'application/json',
        },
      });
      
      if (refreshResponse.ok) {
        console.log('✅ Session refreshed, retrying...');
        // Retry the original request
        const retryResponse = await fetch('https://www.vinted.co.uk/items/new', {
          method: 'GET',
          headers: {
            Cookie: cookieString,
            'User-Agent': navigator.userAgent,
            Referer: 'https://www.vinted.co.uk',
            Origin: 'https://www.vinted.co.uk',
            Accept: 'text/html',
          },
          redirect: 'manual',
        });
        
        if (retryResponse.ok) {
          const html = await retryResponse.text();
          const match = html.match(/\\"CSRF_TOKEN\\":\\"([^"]+)\\"/);
          const csrfToken = match ? match[1] : null;
          const anonId = retryResponse.headers.get('x-anon-id');
          
          console.log('✅ CSRF token extracted after refresh');
          return { csrfToken, anonId, status: retryResponse.status };
        }
      }
      
      console.log('❌ Session refresh failed');
      return { csrfToken: null, anonId: null, status: 401 };
    }
    
    if (response.ok) {
      const html = await response.text();
      
      // Use Zipsale's exact pattern
      const match = html.match(/\\"CSRF_TOKEN\\":\\"([^"]+)\\"/);
      const csrfToken = match ? match[1] : null;
      const anonId = response.headers.get('x-anon-id');
      
      if (csrfToken) {
        console.log('✅ CSRF token extracted successfully');
        return { csrfToken, anonId, status: response.status };
      } else {
        console.log('❌ CSRF token not found in HTML');
        return { csrfToken: null, anonId: null, status: response.status };
      }
    } else {
      console.log('❌ Request failed with status:', response.status);
      return { csrfToken: null, anonId: null, status: response.status };
    }
    
  } catch (error) {
    console.error('💥 Error in Zipsale-style CSRF extraction:', error);
    return { csrfToken: null, anonId: null, status: null };
  }
}

// Function to check if user is logged into Vinted and trigger v_udt
async function checkVintedLoginAndTriggerVUdt() {
  console.log('🔍 Checking Vinted login status using Zipsale method...');
  
  try {
    // First, check if we have any authentication cookies
    const cookies = await chrome.cookies.getAll({ url: 'https://www.vinted.co.uk' });
    const authCookies = cookies.filter(c => 
      c.name.includes('access_token') || 
      c.name.includes('session') || 
      c.name.includes('auth') ||
      c.name.includes('user')
    );
    
    console.log('🔍 Found auth cookies:', authCookies.map(c => c.name));
    
    if (authCookies.length === 0) {
      console.log('❌ No authentication cookies found - user not logged in');
      return false;
    }
    
    // Try Zipsale's direct fetch approach first
    console.log('🔄 Trying Zipsale-style direct fetch...');
    const csrfResult = await getVintedCSRFTokenZipsaleStyle();
    
    if (csrfResult.csrfToken) {
      console.log('✅ Successfully authenticated using Zipsale method');
      
      // Check if v_udt was captured during the request
      const data = await chrome.storage.local.get('vinted_v_udt_cookie');
      if (data.vinted_v_udt_cookie) {
        console.log('✅ v_udt cookie captured during Zipsale-style request');
        return true;
      }
      
      // If no v_udt captured, try one more direct request to trigger it
      console.log('🔄 Making additional request to trigger v_udt...');
      const cookieString = await getVintedHeadersCookies();
      
      const triggerResponse = await fetch('https://www.vinted.co.uk/account', {
        method: 'GET',
        headers: {
          Cookie: cookieString,
          'User-Agent': navigator.userAgent,
          Referer: 'https://www.vinted.co.uk',
          Origin: 'https://www.vinted.co.uk',
          Accept: 'text/html',
        },
        redirect: 'manual',
      });
      
      // Check again for v_udt
      const data2 = await chrome.storage.local.get('vinted_v_udt_cookie');
      if (data2.vinted_v_udt_cookie) {
        console.log('✅ v_udt cookie captured from account page');
        return true;
      }
      
      console.log('❌ v_udt cookie still not captured, but authentication successful');
      return true; // Authentication worked, even if v_udt not captured
    }
    
    console.log('❌ Zipsale-style authentication failed');
    return false;
    
  } catch (error) {
    console.error('Error in Zipsale-style login check:', error);
    return false;
  }
}

// Function to trigger Vinted activity to capture v_udt cookie
async function triggerVintedActivityForVUdt() {
  console.log('🔄 Triggering Vinted activity to capture v_udt cookie...');
  
  // First check if user is logged in and trigger v_udt
  const isLoggedIn = await checkVintedLoginAndTriggerVUdt();
  
  if (!isLoggedIn) {
    console.log('❌ User not logged into Vinted - cannot capture v_udt');
    return false;
  }
  
  // Check if we successfully captured v_udt
  const data = await chrome.storage.local.get('vinted_v_udt_cookie');
  if (data.vinted_v_udt_cookie) {
    console.log('✅ v_udt cookie successfully captured');
    return true;
  } else {
    console.log('❌ v_udt cookie still not captured after all attempts');
    return false;
  }
}

// Function to extract Vinted tokens
async function getVintedTokensViaContentScript(userIdentifier = "") {
  console.group('🟣 VINTED TOKEN EXTRACTION');
  
  try {
    // First, debug what cookies are available
    // const debugInfo = await debugVintedCookies(); // Removed
    
    // if (!debugInfo || !debugInfo.isLoggedIn) { // Removed
    //   console.log('❌ User not logged into Vinted - cannot proceed'); // Removed
    //   console.log('💡 Please log into Vinted first, then try again'); // Removed
    //   console.groupEnd(); // Removed
    //   return { success: false, message: 'User not logged into Vinted' }; // Removed
    // } // Removed
    
    // Check if v_udt is already present // Removed
    // if (debugInfo.hasVUdt) { // Removed
    //   console.log('✅ v_udt cookie already present - no need to trigger activity'); // Removed
    // } else { // Removed
      console.log('❌ v_udt cookie not found - attempting Zipsale-style authentication...');
      
      // Try Zipsale-style authentication
      const authenticated = await checkVintedLoginAndTriggerVUdt();
      
      if (!authenticated) {
        console.log('❌ Zipsale-style authentication failed');
        console.log('💡 Try manually navigating to https://www.vinted.co.uk/items/new');
      }
    // } // Removed
    
    // Get cookies from browser cookie store with v_udt priority
    const cookieString = await getVintedHeadersCookies();
    
    if (!cookieString) {
      console.log('❌ No Vinted cookies found');
      console.groupEnd();
      return { success: false, message: 'No cookies found' };
    }
    
    // Check if we have v_udt cookie
    const hasVUdt = cookieString.includes('v_udt=');
    console.log('🔍 FINAL v_udt check:', hasVUdt ? '✅ PRESENT' : '❌ MISSING');
    
    if (!hasVUdt) {
      console.log('⚠️ WARNING: v_udt cookie not found - crosslisting may fail');
      console.log('💡 This usually means:');
      console.log('   1. User needs to log into Vinted first');
      console.log('   2. User needs to navigate to /items/new page');
      console.log('   3. Vinted session has expired');
      console.log('   4. v_udt cookie may not be required for your region');
    }
    
    // Extract user ID from cookies
    let userId = null;
    const vUidMatch = cookieString.match(/v_uid=([^;]+)/);
    if (vUidMatch) {
      userId = vUidMatch[1];
      console.log('✅ Extracted user ID from v_uid cookie:', userId);
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
            console.log('✅ Extracted user ID from JWT:', userId);
          }
        } catch (jwtError) {
          console.log('❌ Could not decode JWT token:', jwtError.message);
        }
      }
    }
    
    // Try to extract CSRF token using Zipsale's method
    const csrfResult = await getVintedCSRFTokenZipsaleStyle();
    
    if (csrfResult && csrfResult.csrfToken) {
      console.log('✅ SUCCESS: CSRF token extracted using Zipsale method');
      const extractedData = {
        channel: 'vinted',
        fullCookies: cookieString,
        userId: userId,
        csrfToken: csrfResult.csrfToken,
        anonId: csrfResult.anonId,
        vintedUsername: null, // We'll get this from the HTML if needed
        hasVUdt: hasVUdt
      };
      
      sendTokenToAPI(extractedData, "https://www.vinted.co.uk", userIdentifier, null);
      console.groupEnd();
      return { success: true, message: 'Tokens found and sent to API' };
    } else {
      console.log('❌ Zipsale-style CSRF extraction failed - trying fallback...');
      
      // Fallback to the old method if Zipsale approach fails
      const csrfResultFallback = await getVintedCSRFFromItemsNewWithCookies(cookieString);
      
      if (csrfResultFallback && csrfResultFallback.csrfToken) {
        console.log('✅ SUCCESS: CSRF token extracted using fallback method');
        const extractedData = {
          channel: 'vinted',
          fullCookies: cookieString,
          userId: userId,
          csrfToken: csrfResultFallback.csrfToken,
          anonId: csrfResultFallback.anonId,
          vintedUsername: csrfResultFallback.vintedUsername,
          hasVUdt: hasVUdt
        };
        
        sendTokenToAPI(extractedData, "https://www.vinted.co.uk", userIdentifier, null);
        console.groupEnd();
        return { success: true, message: 'Tokens found and sent to API' };
      } else {
        console.log('❌ All CSRF extraction methods failed');
        console.groupEnd();
        return { success: false, message: 'CSRF extraction failed' };
      }
    }
    
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
    let depopTab = await chrome.tabs.query({ 
      url: ["*://*.depop.com/*", "*://depop.com/*"] 
    });
    
    let createdNewDepopTab = false;
    let tabId = null;
    if (depopTab.length === 0) {
      console.log('📱 Creating new Depop tab...');
      const newTab = await chrome.tabs.create({ 
        url: 'https://www.depop.com',
        active: false // Open in background
      });
      tabId = newTab.id;
              createdNewDepopTab = true;
        
        // Wait for page to load
        await new Promise(resolve => {
          const listener = function(updatedTabId, changeInfo, tab) {
            if (updatedTabId === newTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
        
        console.log('✅ Depop tab loaded successfully');
    } else {
      console.log('📱 Using existing Depop tab:', depopTab[0].url);
      tabId = depopTab[0].id;
    }
    
    // Inject content script to extract tokens from page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // This function runs in the Depop page context
        function getCookie(name) {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop().split(';').shift();
          return null;
        }
        
        // Get all cookies from the page context
        const allCookies = document.cookie;
        const accessToken = getCookie('access_token');
        const userId = getCookie('user_id');
        
        console.log('🍪 DEPOP COOKIES:', allCookies.length, 'chars');
        console.log(' - access_token:', accessToken ? '[PRESENT]' : '[MISSING]');
        console.log(' - user_id:', userId ? '[PRESENT]' : '[MISSING]');
        
        return {
          success: !!(accessToken && userId),
          accessToken: accessToken,
          userId: userId,
          allCookies: allCookies,
          sourceUrl: window.location.href
        };
      }
    });
    
    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      
      if (result.success) {
        console.log('✅ DEPOP SUCCESS: Both access token and user ID found');
        const extractedData = {
          channel: 'depop',
          accessToken: result.accessToken,
          userId: result.userId
        };
        
        sendTokenToAPI(extractedData, result.sourceUrl, userIdentifier, null);
        
        // Close tab if we created it
        if (createdNewDepopTab && tabId) {
          console.log('🗂️ Closing Depop tab that was created for token extraction');
          chrome.tabs.remove(tabId);
        }
        
        console.groupEnd();
        return { success: true, message: 'Tokens found and sent to API' };
      } else {
        console.log('❌ DEPOP FAIL: Missing required tokens');
        
        // Close tab if we created it and failed
        if (createdNewDepopTab && tabId) {
          console.log('🗂️ Closing Depop tab that was created (missing tokens)');
          chrome.tabs.remove(tabId);
        }
        
        console.groupEnd();
        return { success: false, message: 'Missing required tokens' };
      }
    } else {
      console.log('❌ DEPOP FAIL: Content script injection failed');
      
      // Close tab if we created it and failed
      if (createdNewDepopTab && tabId) {
        console.log('🗂️ Closing Depop tab that was created (injection failed)');
        chrome.tabs.remove(tabId);
      }
      
      console.groupEnd();
      return { success: false, message: 'Content script injection failed' };
    }
    
  } catch (error) {
    console.error('💥 Error extracting Depop tokens:', error);
    console.groupEnd();
    return { success: false, error: error.message };
  }
}

// Function to check a single platform (used by alarms)
function getTokenForSinglePlatform(platformName, platformUrl, sourceUrl = "", userIdentifier = "") {
  console.log(`Starting single platform check for ${platformName}`);
  
  if (platformName === 'Vinted') {
    getVintedTokensViaContentScript(userIdentifier);
  } else if (platformName === 'Depop') {
    getDepopTokensViaContentScript(userIdentifier);
  } else {
    console.error(`Unsupported platform: ${platformName}`);
  }
}

// Enhanced Vinted session refresh handler (based on Zipsale approach)
async function handleVintedSessionRefresh(request) {
  console.log('🔄 VINTED SESSION REFRESH: Starting enhanced session refresh...');
  
  const userIdentifier = request.userIdentifier;
  const hasValidSession = request.hasValidSession;
  const validateSession = request.validateSession;
  
  try {
    // If session appears invalid and we need to validate, try to refresh first
    if (validateSession && !hasValidSession) {
      console.log('🔄 VINTED SESSION REFRESH: Session appears expired, attempting refresh...');
      
      // Try to open a refresh tab (similar to Zipsale's approach)
      const refreshResult = await openVintedRefreshTab();
      if (!refreshResult) {
        console.log('🔄 VINTED SESSION REFRESH: Refresh tab failed, proceeding with token extraction anyway...');
      } else {
        console.log('🔄 VINTED SESSION REFRESH: Refresh tab succeeded, waiting before token extraction...');
        // Wait a bit for cookies to be updated
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Extract Vinted tokens (same as existing flow)
    const result = await getVintedTokensViaContentScript(userIdentifier);
    
    if (result && result.success) {
      console.log('🔄 VINTED SESSION REFRESH: Tokens extracted successfully');
      return {
        success: true,
        message: 'Vinted session refresh completed successfully',
        channel: 'vinted',
        hasValidSession: true
      };
    } else {
      console.log('🔄 VINTED SESSION REFRESH: Token extraction failed');
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

// Open Vinted refresh tab (similar to Zipsale's openVintedRefreshedTab)
async function openVintedRefreshTab() {
  return new Promise((resolve) => {
    console.log('🔄 VINTED SESSION REFRESH: Opening refresh tab...');
    
    const vintedUrl = 'https://www.vinted.co.uk';
    const refreshUrl = `${vintedUrl}/items/new`;
    
    chrome.tabs.create({ 
      url: refreshUrl, 
      active: false 
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('🔄 VINTED SESSION REFRESH: Error creating tab:', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      
      let resolved = false;
      
      // Listen for tab updates
      const listener = (tabId, changeInfo, updatedTab) => {
        if (tabId !== tab.id || resolved) return;
        
        if (changeInfo.status === 'complete') {
          console.log('🔄 VINTED SESSION REFRESH: Tab loaded:', updatedTab.url);
          
          // Check if we're on the new item page (successful refresh)
          if (updatedTab.url && updatedTab.url.includes('/items/new')) {
            console.log('🔄 VINTED SESSION REFRESH: Refresh successful');
            cleanup(true);
          } else if (updatedTab.url && (updatedTab.url.includes('/login') || updatedTab.url.includes('/signup'))) {
            console.log('🔄 VINTED SESSION REFRESH: Redirected to login - session expired');
            cleanup(false);
          }
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after 15 seconds
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.log('🔄 VINTED SESSION REFRESH: Timeout waiting for refresh');
          cleanup(false);
        }
      }, 15000);
      
      const cleanup = (success) => {
        resolved = true;
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Close the tab
        chrome.tabs.remove(tab.id, () => {
          console.log('🔄 VINTED SESSION REFRESH: Refresh tab closed');
          resolve(success);
        });
      };
    });
  });
}

// Main approach - check both platforms
function getTokenViaContentScript(sourceUrl = "", sendResponse = null, userIdentifier = "") {
  console.log("Starting getTokenViaContentScript for sourceUrl:", sourceUrl);
  console.log("Using userIdentifier:", userIdentifier);
  
  console.group('🚀 Checking Both Platforms');
  console.log('📋 Starting parallel checks for Depop and Vinted...');

  let completedChecks = 0;
  let allResults = [];
  let hasResponded = false;

  // Check Depop
  console.log('🟡 Initiating Depop check...');
  getDepopTokensViaContentScript(userIdentifier).then((result) => {
    if (result && result.success) {
      console.log('✅ Depop check completed successfully');
      allResults.push({ platform: 'Depop', success: true, data: { channel: 'depop' } });
    } else {
      console.log('❌ Depop check completed but no data sent to API');
      allResults.push({ platform: 'Depop', success: false, error: result ? result.message : 'Unknown error' });
    }
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      console.log(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      console.log(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  }).catch((error) => {
    console.error('❌ Depop extraction failed:', error);
    allResults.push({ platform: 'Depop', success: false, error: error.message });
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      console.log(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      console.log(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  });

  // Check Vinted
  console.log('🟣 Initiating Vinted check...');
  getVintedTokensViaContentScript(userIdentifier).then((result) => {
    if (result && result.success) {
      console.log('✅ Vinted check completed successfully');
      allResults.push({ platform: 'Vinted', success: true, data: { channel: 'vinted' } });
    } else {
      console.log('❌ Vinted check completed but no data sent to API');
      allResults.push({ platform: 'Vinted', success: false, error: result ? result.message : 'Unknown error' });
    }
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      console.log(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      console.log(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
    }
  }).catch((error) => {
    console.error('❌ Vinted extraction failed:', error);
    allResults.push({ platform: 'Vinted', success: false, error: error.message });
    completedChecks++;

    if (completedChecks === 2 && !hasResponded && sendResponse) {
      hasResponded = true;
      const successfulResults = allResults.filter(r => r.success);
      console.log(`🏁 Both checks complete: ${successfulResults.length}/2 successful`);
      console.groupEnd();
      sendResponse({
        success: successfulResults.length > 0,
        results: allResults,
        message: `Checked 2 platforms, ${successfulResults.length} successful`
      });
    } else if (completedChecks === 2) {
      console.log(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
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
    console.log('🔄 MANUAL CHECK INITIATED from popup - checking both platforms...');
    getTokenViaContentScript();
    sendResponse({ message: "Check initiated" });
  } else if (request.type === "FCU_VINTED_SESSION_REFRESH") {
    // Handle enhanced Vinted session refresh with validation
    console.log('🔄 VINTED SESSION REFRESH: Background received request');
    console.log("Session refresh data:", request);
    
    handleVintedSessionRefresh(request).then(result => {
      console.log('🔄 VINTED SESSION REFRESH: Result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ VINTED SESSION REFRESH: Error:', error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error',
        channel: 'vinted'
      });
    });
    
    return true; // Keep the message channel open for async response
  } else if (request.action === "checkExtension") {
    // Simple extension check - just respond that we're here
    sendResponse({ installed: true });
  } else if (request.action === "FCU_getTokenViaContentScript") {
    console.log("Received getTokenViaContentScript via content.js message");
    console.log("Request data:", request);

    const channel = request.channel || 'depop'; // Default to depop for backward compatibility
    
    // Route to specific platform based on channel
    if (channel === 'vinted') {
      getVintedTokensViaContentScript(request.userIdentifier).then(result => {
        sendResponse({
          success: result?.success || false,
          error: result?.message || result?.error || 'Unknown error',
          channel: 'vinted'
        });
      }).catch(error => {
        sendResponse({
          success: false,
          error: error.message || 'Unknown error',
          channel: 'vinted'
        });
      });
    } else {
      // Default to Depop
      getDepopTokensViaContentScript(request.userIdentifier).then(result => {
        sendResponse({
          success: result?.success || false,
          error: result?.message || result?.error || 'Unknown error',
          channel: 'depop'
        });
      }).catch(error => {
        sendResponse({
          success: false,
          error: error.message || 'Unknown error',
          channel: 'depop'
        });
      });
    }

    return true; // ✅ ✅ ✅ ***CRUCIAL: TELL CHROME YOU WILL SEND RESPONSE LATER***
  } else if (request.action === "FCU_VINTED_CREATE_LISTING") {
    // Handle Vinted listing creation from FLUF backend
    console.log("🚀 VINTED LISTING: Received create listing request from FLUF");
    console.log("Request data:", request);
    
    handleVintedListingCreation(request).then(result => {
      console.log("✅ VINTED LISTING: Result:", result);
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
  }
});

// Function to handle Vinted listing creation
async function handleVintedListingCreation(request) {
  console.log('🚀 VINTED LISTING: Starting listing creation process');
  console.log('📋 VINTED LISTING: Request data:', { fid: request.fid, vid: request.vid, uid: request.uid });
  
  const { payload, headers, endpoint, method, fid, vid, uid } = request;
  
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
  
  console.log(`✅ VINTED LISTING: Parameters validated - FID: ${fid}, VID: ${vid}, UID: ${uid}`);
  
  try {
    // First, ensure we have valid cookies
    const cookieString = await getVintedHeadersCookies();
    
    if (!cookieString) {
      throw new Error('No Vinted cookies found - user needs to authenticate');
    }
    
    // Check if we have v_udt cookie
    const hasVUdt = cookieString.includes('v_udt=');
    console.log('🔍 v_udt check:', hasVUdt ? '✅ PRESENT' : '❌ MISSING');
    
    // Ensure v_udt cookie is present
    let finalCookieString = cookieString;
    
    // If v_udt is not in browser cookies, add it from the backend
    if (!cookieString.includes('v_udt=') && headers.v_udt_cookie) {
      finalCookieString = cookieString + '; ' + headers.v_udt_cookie;
      console.log('🔧 VINTED LISTING: Added v_udt from backend');
    }
    
    // Build the complete headers for the request
    const requestHeaders = {
      'Cookie': finalCookieString,
      'User-Agent': navigator.userAgent,
      'Referer': 'https://www.vinted.co.uk/items/new',
      'Origin': 'https://www.vinted.co.uk',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-uk-fr',
      'X-Enable-Multiple-Size-Groups': 'true',
      'X-Upload-Form': 'true',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    
    // Add CSRF token if provided - this is crucial for Vinted
    if (headers.csrf_token) {
      requestHeaders['X-CSRF-token'] = headers.csrf_token;
      console.log('🔐 VINTED LISTING: Added CSRF token from backend');
    } else {
      console.warn('⚠️ VINTED LISTING: No CSRF token provided - request may fail');
    }
    
    // Add anon_id if provided
    if (headers.anon_id) {
      requestHeaders['X-Anon-Id'] = headers.anon_id;
      console.log('🆔 VINTED LISTING: Added anon ID from backend');
    }
    
    console.log('📡 VINTED LISTING: Making request to:', endpoint);
    console.log('📦 VINTED LISTING: Payload size:', JSON.stringify(payload).length, 'chars');
    
    // Make the actual request to Vinted
    const response = await fetch(endpoint, {
      method: method || 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      redirect: 'manual'
    });
    
    console.log('📡 VINTED LISTING: Response status:', response.status);
    
    const responseData = await response.json();
    
    if (response.ok && responseData.item && responseData.item.id) {
      console.log('✅ VINTED LISTING: Success! Item ID:', responseData.item.id);
      
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
        item_url: `https://www.vinted.co.uk/items/${responseData.item.id}`,
        channel: 'vinted'
      };
    } else {
      console.log('❌ VINTED LISTING: Failed with response:', responseData);
      
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
      
      console.log('🔍 VINTED ERROR: Extracted message:', errorMessage);
      
      if (responseData.code) {
        errorCode = responseData.code;
      }
      
      // Send error callback to WordPress
      await sendVintedCallbackToWordPress({
        success: false,
        error: errorMessage,
        error_code: errorCode,
        fid: fid,
        vid: vid,
        uid: uid
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
      error: error.message,
      fid: fid,
      vid: vid,
      uid: uid
    });
    
    throw error;
  }
}

// Function to send callback to WordPress after Vinted listing attempt
async function sendVintedCallbackToWordPress(data) {
  console.log('📤 Sending callback to WordPress:', data);
  
  const endpoints = [
    'http://localhost:10006/wp-json/fc/listings/v1/vinted-extension-callback',
    'http://fluf.local/wp-json/fc/listings/v1/vinted-extension-callback',
    'https://fluf.local/wp-json/fc/listings/v1/vinted-extension-callback',
    'https://fluf.io/wp-json/fc/listings/v1/vinted-extension-callback'
  ];
  
  const promises = endpoints.map(endpoint => 
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .catch(error => {
      console.error(`Callback failed for ${endpoint}:`, error);
      return null;
    })
  );
  
  const results = await Promise.all(promises);
  const successfulResult = results.find(r => r !== null);
  
  if (successfulResult) {
    console.log('✅ Callback sent successfully:', successfulResult);
  } else {
    console.error('❌ All callback attempts failed');
  }
  
  return successfulResult;
}

// Function to send the token to the WordPress API using fetch
function sendTokenToAPI(extractedData, sourceUrl = "", userIdentifier = "", sendResponse = null) {
  const { accessToken, userId, csrfToken, channel, fullCookies, anonId, vintedUsername } = extractedData;
  
  if (!channel) {
    console.log("No channel detected");
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
    console.log("No Depop token or user_id found");
    if (sendResponse) {
      sendResponse({
        success: false,
        error: "No Depop token or user_id found"
      });
    }
    return;
  }
  
  if (channel === 'vinted' && !fullCookies) {
    console.log("No Vinted cookies found");
    if (sendResponse) {
      sendResponse({
        success: false,
        error: "No Vinted cookies found"
      });
    }
    return;
  }

  // Send to both endpoints
  console.log("Sending data to both localhost and production endpoints");
  
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
    const hasVUdt = fullCookies.includes('v_udt=');
    console.log('🔍 VERIFYING VINTED COOKIES:');
    console.log(' - access_token_web present:', hasAccessTokenWeb ? '✅ YES' : '❌ NO');
    console.log(' - v_udt present:', hasVUdt ? '✅ YES' : '❌ NO');
    console.log(' - Total cookie string length:', fullCookies.length);
    
    if (hasAccessTokenWeb) {
      // Extract and log a preview of the access_token_web value
      const accessTokenMatch = fullCookies.match(/access_token_web=([^;]+)/);
      if (accessTokenMatch) {
        console.log(' - access_token_web value length:', accessTokenMatch[1].length);
        console.log(' - access_token_web preview:', accessTokenMatch[1].substring(0, 50) + '...');
      }
    }
    
    if (hasVUdt) {
      // Extract and log a preview of the v_udt value
      const vUdtMatch = fullCookies.match(/v_udt=([^;]+)/);
      if (vUdtMatch) {
        console.log(' - v_udt value length:', vUdtMatch[1].length);
        console.log(' - v_udt preview:', vUdtMatch[1].substring(0, 20) + '...');
      }
    }
    
    if (csrfToken) {
      requestBody.csrf_token = csrfToken;
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
    
    // Add v_udt status to request
    requestBody.has_v_udt = hasVUdt;
  }
  
  // Add userIdentifier if provided (should be the WordPress UID or RID)
  if (userIdentifier) {
    requestBody.userIdentifier = userIdentifier;
    console.log("Using WordPress user identifier:", userIdentifier);
  }
  
  console.log("Sending data to API:", { ...requestBody, cookies: requestBody.cookies ? '[REDACTED]' : undefined });
  console.log("Endpoints:", ENDPOINTS);
  
  // Add additional logging for debugging
  console.log("Source URL:", sourceUrl);
  console.log("User Identifier:", userIdentifier);
  console.log("Channel:", channel);
  
  // Additional validation for Vinted cookies
  if (channel === 'vinted' && requestBody.cookies) {
    console.log('📋 FINAL VINTED COOKIE VALIDATION:');
    console.log(' - Total cookies being sent:', requestBody.cookies.split(';').length);
    console.log(' - Cookie names being sent:', requestBody.cookies.split(';').map(c => c.split('=')[0].trim()).join(', '));
    console.log(' - access_token_web included:', requestBody.cookies.includes('access_token_web') ? '✅ YES' : '❌ NO');
    console.log(' - v_udt included:', requestBody.cookies.includes('v_udt=') ? '✅ YES' : '❌ NO');
    console.log(' - vinted_fr_session included:', requestBody.cookies.includes('vinted_fr_session') ? '✅ YES' : '❌ NO');
    console.log(' - anon_id included:', requestBody.cookies.includes('anon_id') ? '✅ YES' : '❌ NO');
    
    // Check for critical cookies for crosslisting
    const criticalCookies = ['access_token_web', 'v_udt', 'anon_id'];
    const missingCritical = criticalCookies.filter(cookie => !requestBody.cookies.includes(cookie));
    
    if (missingCritical.length > 0) {
      console.log('⚠️ WARNING: Missing critical cookies for crosslisting:', missingCritical.join(', '));
    } else {
      console.log('✅ All critical cookies present for crosslisting');
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
      console.log(`API response status for ${endpoint}:`, response.status);
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
      console.log("All API responses:", results);
      
      // Check if at least one request succeeded
      const successfulResults = results.filter(result => result.success);
      const failedResults = results.filter(result => !result.success);
      
      if (successfulResults.length > 0) {
        logStatus(`Data sent successfully at ${new Date().toLocaleString()}`, true);
        
        if (sendResponse) {
          sendResponse({
            success: true,
            data: successfulResults[0].data, // Return data from first successful response
            channel: channel,
            results: results // Include all results for debugging
          });
        }
      } else {
        const errorMessage = `Failed to send to all endpoints: ${failedResults.map(r => `${r.endpoint}: ${r.error}`).join(', ')}`;
        logStatus(`Error: ${errorMessage}`, false);
        
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