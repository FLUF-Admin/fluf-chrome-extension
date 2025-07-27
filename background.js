// Endpoints - send to both localhost and production
const ENDPOINTS = [
  "http://localhost:10006/wp-json/fc/circular-auth/v1/token",
  "https://fluf.io/wp-json/fc/circular-auth/v1/token"
];

// Initialize the extension when installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Set up separate alarms for each platform
  chrome.alarms.create("FCU_checkDepop", { periodInMinutes: 360 }); // Every 6 hours
  chrome.alarms.create("FCU_checkVinted", { periodInMinutes: 30 }); // Every 30 minutes

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

// Function to get Vinted cookies from captured XHR data
async function getVintedCookiesFromXHR() {
  try {
    const data = await chrome.storage.local.get('vinted_captured_cookies');
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
    // Try multiple domain patterns to catch all Vinted cookies
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

// Function to extract Vinted tokens
async function getVintedTokensViaContentScript(userIdentifier = "") {
  console.group('🟣 VINTED TOKEN EXTRACTION');
  
  try {
    // Get cookies from browser cookie store
    const cookieString = await getVintedHeadersCookies();
    
    if (!cookieString) {
      console.log('❌ No Vinted cookies found');
      console.groupEnd();
      return { success: false, message: 'No cookies found' };
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
    
    // Try to extract CSRF token using the cookies
    const csrfResult = await getVintedCSRFFromItemsNewWithCookies(cookieString);
    
    if (csrfResult && csrfResult.csrfToken) {
      console.log('✅ SUCCESS: CSRF token extracted');
      const extractedData = {
        channel: 'vinted',
        fullCookies: cookieString,
        userId: userId,
        csrfToken: csrfResult.csrfToken,
        anonId: csrfResult.anonId,
        vintedUsername: csrfResult.vintedUsername
      };
      
      sendTokenToAPI(extractedData, "https://www.vinted.co.uk", userIdentifier, null);
      console.groupEnd();
      return { success: true, message: 'Tokens found and sent to API' };
    } else {
      console.log('❌ CSRF extraction failed - trying content script approach...');
      
      // Fallback to content script approach if CSRF extraction fails
      // Check if we already have a Vinted tab open
      let vintedTab = await chrome.tabs.query({ 
        url: ["*://*.vinted.co.uk/*", "*://vinted.co.uk/*", "*://*.vinted.com/*", "*://vinted.com/*"] 
      });
      
      let createdNewTab = false;
      if (vintedTab.length === 0) {
        console.log('📱 Creating new Vinted tab...');
        vintedTab = await chrome.tabs.create({ 
          url: 'https://www.vinted.co.uk',
          active: false // Open in background
        });
        createdNewTab = true;
        
        // Wait for page to load
        await new Promise(resolve => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
            if (tabId === vintedTab[0].id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          });
        });
        
        console.log('✅ Vinted tab loaded successfully');
      } else {
        console.log('📱 Using existing Vinted tab:', vintedTab[0].url);
      }
      
      // Inject content script to extract tokens from page context
      const results = await chrome.scripting.executeScript({
        target: { tabId: vintedTab[0].id },
        func: () => {
          // This function runs in the Vinted page context
          function getCookie(name) {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
          }
          
          // Get all cookies from the page context
          const allCookies = document.cookie;
          
          // Extract important Vinted cookies
          const vUdt = getCookie('v_udt');
          const vUid = getCookie('v_uid');
          const accessTokenWeb = getCookie('access_token_web');
          const anonId = getCookie('anon_id');
          const vSid = getCookie('v_sid');
          
          console.log('🍪 VINTED PAGE COOKIES:', allCookies.length, 'chars');
          console.log(' - v_udt:', vUdt ? '[PRESENT]' : '[MISSING]');
          console.log(' - v_uid:', vUid ? '[PRESENT]' : '[MISSING]');
          console.log(' - access_token_web:', accessTokenWeb ? '[PRESENT]' : '[MISSING]');
          console.log(' - anon_id:', anonId ? '[PRESENT]' : '[MISSING]');
          console.log(' - v_sid:', vSid ? '[PRESENT]' : '[MISSING]');
          
          // Extract user ID from JWT if available
          let userId = vUid;
          if (!userId && accessTokenWeb) {
            try {
              const tokenParts = accessTokenWeb.split('.');
              if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                userId = payload.user_id || payload.sub || payload.id;
              }
            } catch (jwtError) {
              console.log('Could not decode JWT token:', jwtError.message);
            }
          }
          
          // Try to extract Vinted username from figure img alt attribute on items/new page
          let vintedUsername = null;
          if (window.location.pathname === '/items/new') {
            const figureImg = document.querySelector('figure img');
            if (figureImg && figureImg.alt) {
              vintedUsername = figureImg.alt;
              console.log('✅ Vinted username extracted from page:', vintedUsername);
            } else {
              console.log('❌ Vinted username not found on items/new page');
            }
          }
          
          return {
            success: !!(allCookies && allCookies.length > 0),
            allCookies: allCookies,
            vUdt: vUdt,
            vUid: vUid,
            accessTokenWeb: accessTokenWeb,
            anonId: anonId,
            vSid: vSid,
            userId: userId,
            vintedUsername: vintedUsername,
            sourceUrl: window.location.href
          };
        }
      });
      
      if (results && results[0] && results[0].result) {
        const result = results[0].result;
        
        if (result.success) {
          console.log('✅ VINTED SUCCESS: Cookies found from content script');
          const extractedData = {
            channel: 'vinted',
            fullCookies: result.allCookies,
            userId: result.userId,
            csrfToken: null, // CSRF extraction failed, so we don't have it
            anonId: result.anonId,
            vintedUsername: result.vintedUsername
          };
          
          sendTokenToAPI(extractedData, result.sourceUrl, userIdentifier, null);
          
          // Close tab if we created it
          if (createdNewTab && vintedTab[0]) {
            console.log('🗂️ Closing Vinted tab that was created for token extraction');
            chrome.tabs.remove(vintedTab[0].id);
          }
          
          console.groupEnd();
          return { success: true, message: 'Tokens found and sent to API' };
        } else {
          console.log('❌ VINTED FAIL: No cookies found in content script');
          
          // Close tab if we created it and failed
          if (createdNewTab && vintedTab[0]) {
            console.log('🗂️ Closing Vinted tab that was created (extraction failed)');
            chrome.tabs.remove(vintedTab[0].id);
          }
          
          console.groupEnd();
          return { success: false, message: 'No cookies found' };
        }
      } else {
        console.log('❌ VINTED FAIL: Content script injection failed');
        
        // Close tab if we created it and failed
        if (createdNewTab && vintedTab[0]) {
          console.log('🗂️ Closing Vinted tab that was created (injection failed)');
          chrome.tabs.remove(vintedTab[0].id);
        }
        
        console.groupEnd();
        return { success: false, message: 'Content script injection failed' };
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
    if (depopTab.length === 0) {
      console.log('📱 Creating new Depop tab...');
      depopTab = await chrome.tabs.create({ 
        url: 'https://www.depop.com',
        active: false // Open in background
      });
      createdNewDepopTab = true;
      
      // Wait for page to load
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
          if (tabId === depopTab[0].id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });
      
      console.log('✅ Depop tab loaded successfully');
    } else {
      console.log('📱 Using existing Depop tab:', depopTab[0].url);
    }
    
    // Inject content script to extract tokens from page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: depopTab[0].id },
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
        if (createdNewDepopTab && depopTab[0]) {
          console.log('🗂️ Closing Depop tab that was created for token extraction');
          chrome.tabs.remove(depopTab[0].id);
        }
        
        console.groupEnd();
        return { success: true, message: 'Tokens found and sent to API' };
      } else {
        console.log('❌ DEPOP FAIL: Missing required tokens');
        
        // Close tab if we created it and failed
        if (createdNewDepopTab && depopTab[0]) {
          console.log('🗂️ Closing Depop tab that was created (missing tokens)');
          chrome.tabs.remove(depopTab[0].id);
        }
        
        console.groupEnd();
        return { success: false, message: 'Missing required tokens' };
      }
    } else {
      console.log('❌ DEPOP FAIL: Content script injection failed');
      
      // Close tab if we created it and failed
      if (createdNewDepopTab && depopTab[0]) {
        console.log('🗂️ Closing Depop tab that was created (injection failed)');
        chrome.tabs.remove(depopTab[0].id);
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
  } else if (request.action === "checkExtension") {
    // Simple extension check - just respond that we're here
    sendResponse({ installed: true });
  } else if (request.action === "FCU_getTokenViaContentScript") {
    console.log("Received getTokenViaContentScript via content.js message");
    console.log("Request data:", request);

    getTokenViaContentScript(request.sourceUrl, sendResponse, request.userIdentifier);

    return true; // ✅ ✅ ✅ ***CRUCIAL: TELL CHROME YOU WILL SEND RESPONSE LATER***
  }
});

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
    console.log('🔍 VERIFYING access_token_web in aggregated cookies:');
    console.log(' - access_token_web present:', hasAccessTokenWeb ? '✅ YES' : '❌ NO');
    console.log(' - Total cookie string length:', fullCookies.length);
    
    if (hasAccessTokenWeb) {
      // Extract and log a preview of the access_token_web value
      const accessTokenMatch = fullCookies.match(/access_token_web=([^;]+)/);
      if (accessTokenMatch) {
        console.log(' - access_token_web value length:', accessTokenMatch[1].length);
        console.log(' - access_token_web preview:', accessTokenMatch[1].substring(0, 50) + '...');
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
    console.log(' - vinted_fr_session included:', requestBody.cookies.includes('vinted_fr_session') ? '✅ YES' : '❌ NO');
    console.log(' - anon_id included:', requestBody.cookies.includes('anon_id') ? '✅ YES' : '❌ NO');
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
        logStatus(`${channel.charAt(0).toUpperCase() + channel.slice(1)} data sent successfully to ${successfulResults.length} endpoint(s) at ${new Date().toLocaleString()}`, true);
        
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