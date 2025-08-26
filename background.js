// Endpoints - send to localhost, local development, and production
const ENDPOINTS = [
  "http://localhost:10006/wp-json/fc/circular-auth/v1/token",
  "http://fluf.local/wp-json/fc/circular-auth/v1/token",
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
    console.log('🌍 Detecting user country from IP...');
    const response = await fetch('https://ipapi.co/country_code/', {
      method: 'GET',
      headers: {
        'User-Agent': 'FLUF-Extension/1.0'
      }
    });
    
    if (response.ok) {
      const countryCode = (await response.text()).trim().toUpperCase();
      console.log('🌍 Detected country code:', countryCode);
      return countryCode;
    } else {
      console.log('❌ IP detection failed, using default');
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
      console.log('✅ Using stored Vinted domain preference:', stored.vinted_domain_preference);
      return stored.vinted_domain_preference;
    }
    
    // If no stored preference, detect from IP
    console.log('🔍 No stored Vinted domain preference, detecting from IP...');
    const countryCode = await getUserCountryFromIP();
    const detectedDomain = COUNTRY_TO_VINTED_DOMAIN[countryCode] || COUNTRY_TO_VINTED_DOMAIN['DEFAULT'];
    
    // Store the detected domain for future use
    await chrome.storage.local.set({ vinted_domain_preference: detectedDomain });
    console.log('💾 Stored detected Vinted domain preference:', detectedDomain);
    
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
    console.log('💾 Updated Vinted domain preference:', baseUrl);
  } catch (error) {
    console.error('❌ Error updating Vinted domain preference:', error);
  }
}

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
  // Use stored domain preference for scheduled checks
  return await getVintedTokensViaContentScript();
}

// Listen for the alarms to trigger
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "FCU_checkDepop") {
    getDepopTokensDirectly();
  } else if (alarm.name === "FCU_checkVinted") {
    handleVintedAlarmCheck();
  }
});

// Enhanced Vinted alarm handler with coordination
async function handleVintedAlarmCheck() {
  console.log('🔔 VINTED ALARM: Checking if refresh is needed...');
  
  try {
    // Check when the last frontend refresh occurred
    const storage = await chrome.storage.local.get(['vinted_last_frontend_refresh']);
    const lastFrontendRefresh = storage.vinted_last_frontend_refresh || 0;
    const timeSinceLastFrontendRefresh = Date.now() - lastFrontendRefresh;
    
    // If frontend refreshed within the last 15 minutes, skip this alarm
    const FRONTEND_GRACE_PERIOD = 15 * 60 * 1000; // 15 minutes
    
    if (timeSinceLastFrontendRefresh < FRONTEND_GRACE_PERIOD) {
      console.log('🔔 VINTED ALARM: Skipping - frontend refreshed', Math.round(timeSinceLastFrontendRefresh / 60000), 'minutes ago');
      
      // Reset the alarm to fire after the remaining grace period
      const remainingGracePeriod = FRONTEND_GRACE_PERIOD - timeSinceLastFrontendRefresh;
      const nextAlarmDelay = Math.max(remainingGracePeriod + (5 * 60 * 1000), 10 * 60 * 1000); // At least 10 minutes
      
      console.log('🔔 VINTED ALARM: Rescheduling alarm for', Math.round(nextAlarmDelay / 60000), 'minutes from now');
      
      // Clear existing alarm and create new one with adjusted timing
      chrome.alarms.clear("FCU_checkVinted");
      chrome.alarms.create("FCU_checkVinted", { 
        delayInMinutes: nextAlarmDelay / 60000,
        periodInMinutes: 20 // Resume normal 20-minute interval after this
      });
      
      return;
    }
    
    console.log('🔔 VINTED ALARM: Proceeding with scheduled check');
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
      console.log('🍪 VINTED SET-COOKIE HEADERS CAPTURED:', setCookieHeaders.length, 'headers');
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
      console.log('🔍 API CALL cookies captured from:', details.url);
    }
  },
  { urls: VINTED_DOMAINS.map(domain => `*://${domain}/*`) },
  ["requestHeaders"]
);

// Function to get complete Vinted cookie string
async function getVintedHeadersCookies(baseUrl = 'https://www.vinted.co.uk/') {
  try {
    
    // Extract hostname from baseUrl to target the specific Vinted domain
    const targetUrl = new URL(baseUrl);
    const targetDomain = targetUrl.hostname;
    
    console.log('🎯 Targeting specific Vinted domain:', targetDomain);
    
    // Build domain variations for the specific country
    const domains = [
      baseUrl.replace(/\/$/, ''), // https://www.vinted.co.uk
      `https://${targetDomain}`, // https://www.vinted.co.uk  
    ];
    
    // If it's a www domain, also try without www
    if (targetDomain.startsWith('www.')) {
      const nonWwwDomain = targetDomain.replace('www.', '');
      domains.push(`https://${nonWwwDomain}`); // https://vinted.co.uk
      domains.push(`https://.${nonWwwDomain}`); // https://.vinted.co.uk
    }
    
    console.log('🔍 Checking domains for cookies:', domains);
    
    let allCookies = [];
    
    for (const domain of domains) {
      try {
        const cookies = await chrome.cookies.getAll({ url: domain });
        if (cookies.length > 0) {
          console.log(`✅ Found ${cookies.length} cookies for domain: ${domain}`);
          allCookies = allCookies.concat(cookies);
        } else {
          console.log(`❌ No cookies found for domain: ${domain}`);
        }
      } catch (error) {
        console.log(`⚠️ Error getting cookies for domain ${domain}:`, error.message);
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
    
    console.log('🍪 VINTED COOKIES for', targetDomain + ':', uniqueCookies.length, 'cookies,', cookieString.length, 'chars');
    
    return cookieString;
  } catch (error) {
    console.error('Error collecting Vinted cookies:', error);
    throw error;
  }
}

// Function to extract Vinted CSRF token from /items/new page
async function getVintedCSRFFromItemsNewWithCookies(cookieHeader, baseUrl = 'https://www.vinted.co.uk/') {
  try {
    console.log('🔍 Extracting CSRF token from /items/new...');
    console.log('🔍 Using base URL:', baseUrl);

    // Request the /items/new page with the complete cookie string
    const response = await fetch(baseUrl + 'items/new', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': navigator.userAgent,
        Referer: baseUrl,
        Origin: baseUrl.replace(/\/$/, ''),
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


// Function to get Vinted CSRF token using Zipsale's exact method (direct fetch)
async function getVintedCSRFTokenZipsaleStyle(baseUrl = 'https://www.vinted.co.uk/') {
  console.log('🔍 Using base URL:', baseUrl);

  // Normalize baseUrl: remove trailing slash to match Zipsale's format
  const normalizedUrl = baseUrl.replace(/\/$/, '');

  let response, status, redirectUrl;
  
  // Step 1: Request CSRF token (like Zipsale's requestVintedCSRFToken)
  try {
    const cookieHeader = await getVintedHeadersCookies(baseUrl);
    
    if (!cookieHeader || cookieHeader.length === 0) {
      console.log('❌ No Vinted cookies found - user needs to log in first');
      return { csrfToken: null, anonId: null, status: 401 };
    }

    response = await fetch(normalizedUrl + '/items/new', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': navigator.userAgent,
        Referer: normalizedUrl,
        Origin: normalizedUrl,
        Accept: 'text/html',
      },
      redirect: 'manual', // Key: prevent automatic redirects like Zipsale
    });

    status = response.status;
    console.log('📡 /items/new response status:', status);

    // Check for status 0 with redirect info (like Zipsale)
    if (status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (lastRequestInfo && lastRequestInfo.status === 307) {
        console.log('🔄 Detected 307 redirect via webRequest listener');
        status = 307;
        redirectUrl = lastRequestInfo.location;
      }
    }
    lastRequestInfo = null;

    // Handle 307 redirect (session refresh needed) - Zipsale approach
    if (status === 307) {
      console.log('🔄 Session expired, attempting refresh...');
      
      // Try to refresh session first
      try {
        const refreshResponse = await fetch(normalizedUrl + '/api/v2/sessions', {
          method: 'POST',
          headers: {
            Cookie: cookieHeader,
            'User-Agent': navigator.userAgent,
            'Content-Type': 'application/json',
          },
        });

        if (refreshResponse.ok) {
          console.log('✅ Session refreshed via API, retrying...');
          // Retry the original request
          response = await fetch(baseUrl + 'items/new', {
            method: 'GET',
            headers: {
              Cookie: cookieHeader,
              'User-Agent': navigator.userAgent,
              Referer: baseUrl,
              Origin: baseUrl.replace(/\/$/, ''),
              Accept: 'text/html',
            },
            redirect: 'manual',
          });
          status = response.status;
        } else {
          console.log('❌ API refresh failed, trying tab method...');
          // Fallback to tab opening like Zipsale
          const refreshed = await openVintedRefreshTab(redirectUrl || normalizedUrl);
          if (!refreshed) {
            return { csrfToken: null, anonId: null, status: 401 };
          }
          
          // Retry after tab refresh
          const newCookieHeader = await getVintedHeadersCookies(normalizedUrl + '/');
          response = await fetch(normalizedUrl + '/items/new', {
            method: 'GET',
            headers: {
              Cookie: newCookieHeader,
              'User-Agent': navigator.userAgent,
              Referer: normalizedUrl,
              Origin: normalizedUrl,
              Accept: 'text/html',
            },
            redirect: 'manual',
          });
          status = response.status;
        }
      } catch (refreshError) {
        console.log('❌ Session refresh error:', refreshError);
        return { csrfToken: null, anonId: null, status: 401 };
      }
    }

    // Handle successful response
    if (status === 200) {
      const html = await response.text();
      
      // Use Zipsale's exact pattern
      const match = html.match(/\\"CSRF_TOKEN\\":\\"([^"]+)\\"/);
      const csrfToken = match ? match[1] : null;
      const anonId = response.headers.get('x-anon-id');

      if (csrfToken) {
        console.log('✅ CSRF token extracted:', csrfToken.substring(0, 10) + '...');
        return { csrfToken, anonId, status };
      } else {
        console.log('❌ CSRF token not found in HTML');
        return { csrfToken: null, anonId, status };
      }
    } else {
      console.log('❌ Unexpected response status:', status);
      return { csrfToken: null, anonId: null, status };
    }

  } catch (error) {
    console.log('💥 Error in CSRF extraction:', error);
    return { csrfToken: null, anonId: null, status: null };
  }
}

// Function to extract Vinted CSRF token from /items/new page
async function getVintedCSRFFromItemsNewWithCookies(cookieHeader, baseUrl = 'https://www.vinted.co.uk/') {
  try {
    console.log('🔍 Extracting CSRF token from /items/new...');
    console.log('🔍 Using base URL:', baseUrl);

    // Request the /items/new page with the complete cookie string
    const response = await fetch(baseUrl + 'items/new', {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': navigator.userAgent,
        Referer: baseUrl,
        Origin: baseUrl.replace(/\/$/, ''),
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
async function getVintedTokensViaContentScript(userIdentifier = "", baseUrl = null) {
  console.group('🟣 VINTED TOKEN EXTRACTION');
  
  // If no baseUrl provided, get from stored preference or detect from IP
  if (!baseUrl) {
    baseUrl = await getVintedDomainPreference();
  } else {
    // ALWAYS update stored preference when baseUrl is explicitly provided (user reconnection)
    console.log('🔄 Updating stored Vinted domain preference to:', baseUrl);
    await updateVintedDomainPreference(baseUrl);
  }
  
  console.log('🔍 Using base URL:', baseUrl);
  console.log('🔍 Using userIdentifier:', userIdentifier);

  try {
    // First, debug what cookies are available
    // const debugInfo = await debugVintedCookies(); // Removed

    // if (!debugInfo || !debugInfo.isLoggedIn) { // Removed
    //   console.log('❌ User not logged into Vinted - cannot proceed'); // Removed
    //   console.log('💡 Please log into Vinted first, then try again'); // Removed
    //   console.groupEnd(); // Removed
    //   return { success: false, message: 'User not logged into Vinted' }; // Removed
    // } // Removed


    console.log('❌ access_token_web cookie not found - attempting authentication...');

    // Try Zipsale-style CSRF token extraction
    const csrfResult = await getVintedCSRFTokenZipsaleStyle(baseUrl);

    if (!csrfResult || !csrfResult.csrfToken) {
      console.log('❌ CSRF token extraction failed');
      console.log('💡 Try manually navigating to', baseUrl.replace(/\/$/, '') + '/items/new');
      console.groupEnd();
      return {
        success: false,
        error: 'Please refresh Session by visiting ' + baseUrl.replace(/\/$/, '') + '/items/new, then try connecting again.'
      };
    }

    // Get cookies from browser cookie store
    const cookieString = await getVintedHeadersCookies(baseUrl);

    if (!cookieString) {
      console.log('❌ No Vinted cookies found');
      console.groupEnd();
      return { success: false, message: 'No cookies found' };
    }

    // Check if we have critical cookies for Vinted
    const hasAccessTokenWeb = cookieString.includes('access_token_web=');
    console.log('🔍 FINAL cookie check:', {
      access_token_web: hasAccessTokenWeb ? '✅ PRESENT' : '❌ MISSING'
    });

    // If critical cookies are missing, trigger session refresh
    if (!hasAccessTokenWeb) {
      console.log('🔄 CRITICAL COOKIES MISSING - triggering session refresh...');
      console.log('💡 Missing cookies indicate expired session, attempting refresh...');

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
          console.log('✅ Session refresh successful, retrying token extraction...');
          // Retry getting cookies after refresh
          const refreshedCookieString = await getVintedHeadersCookies(baseUrl);
          if (refreshedCookieString) {
            cookieString = refreshedCookieString;
            console.log('✅ Updated cookies after refresh');

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
              console.log('Could not notify frontend of auth restoration:', error);
            }
          }
        } else {
          console.log('❌ Session refresh failed:', refreshResult.error);
        }
      } catch (refreshError) {
        console.error('❌ Session refresh error:', refreshError);
      }
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
    const csrfResult2 = await getVintedCSRFTokenZipsaleStyle(baseUrl);
    
    if (csrfResult2 && csrfResult2.csrfToken) {
      console.log('✅ SUCCESS: CSRF token extracted');
      const extractedData = {
        channel: 'vinted',
        fullCookies: cookieString,
        userId: userId,
        csrfToken: csrfResult2.csrfToken,
        anonId: csrfResult2.anonId,
        vintedUsername: null, // We'll get this from the HTML if needed
        hasAccessTokenWeb: hasAccessTokenWeb,
        baseUrl: baseUrl
      };
      
      sendTokenToAPI(extractedData, baseUrl, userIdentifier, null);
      console.groupEnd();
      return { success: true, message: 'Tokens found and sent to API' };
    } else {
      console.log('❌ CSRF extraction failed - trying fallback...');
      // Fallback to the old method if Zipsale approach fails
      const csrfResultFallback = await getVintedCSRFFromItemsNewWithCookies(cookieString, baseUrl);
      
      if (csrfResultFallback && csrfResultFallback.csrfToken) {
        console.log('✅ SUCCESS: CSRF token extracted using fallback method');
        const extractedData = {
          channel: 'vinted',
          fullCookies: cookieString,
          userId: userId,
          csrfToken: csrfResultFallback.csrfToken,
          anonId: csrfResultFallback.anonId,
          vintedUsername: csrfResultFallback.vintedUsername,
          hasAccessTokenWeb: hasAccessTokenWeb,
          baseUrl: baseUrl
        };
        
        sendTokenToAPI(extractedData, baseUrl, userIdentifier, null);
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
        const listener = function (updatedTabId, changeInfo, tab) {
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

// Enhanced Vinted session refresh handler (based on Zipsale approach)
async function handleVintedSessionRefresh(request) {
  console.log('🔄 VINTED SESSION REFRESH: Starting enhanced session refresh...');

  const userIdentifier = request.userIdentifier;
  const hasValidSession = request.hasValidSession;
  const validateSession = request.validateSession;

  try {
    // Step 1: Try API refresh first (like Zipsale)
    if (validateSession && !hasValidSession) {
      console.log('🔄 VINTED SESSION REFRESH: Session appears expired, trying API refresh first...');

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
          console.log('🔄 VINTED SESSION REFRESH: API refresh successful, proceeding with token extraction...');
          // Wait a moment for cookies to be updated
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('🔄 VINTED SESSION REFRESH: API refresh failed, falling back to tab method...');
          throw new Error('API refresh failed');
        }
      } catch (apiError) {
        console.log('🔄 VINTED SESSION REFRESH: API refresh error, using tab fallback:', apiError.message);

        // Step 2: Fallback to tab opening (like Zipsale)
        const refreshResult = await openVintedRefreshTab(baseUrl);
        if (!refreshResult) {
          console.log('🔄 VINTED SESSION REFRESH: Both API and tab refresh failed');
        } else {
          console.log('🔄 VINTED SESSION REFRESH: Tab refresh succeeded, waiting before token extraction...');
          // Wait a bit for cookies to be updated
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Step 3: Extract Vinted tokens (same as existing flow)
    const result = await getVintedTokensViaContentScript(userIdentifier, baseUrl);

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

// Enhanced Vinted refresh tab (based on Zipsale's robust approach)
async function openVintedRefreshTab(baseUrl = 'https://www.vinted.co.uk/') {
  return new Promise((resolve) => {
    console.log('🔄 Using base URL:', baseUrl);

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
          console.log('🔄 VINTED SESSION REFRESH: Different tab ID, ignoring');
          return;
        }

        redirectedTo = details.url;
        console.log('🔄 VINTED SESSION REFRESH: WebRequest detected:', redirectedTo);

        resolved = true;
        if (redirectedTo.startsWith(`${vintedUrl}/items/new`)) {
          console.log('🔄 VINTED SESSION REFRESH: Success - redirected to new item page');
          cleanup(true);
        } else if (redirectedTo.includes('/signup') || redirectedTo.includes('/login')) {
          console.log('🔄 VINTED SESSION REFRESH: Failure - redirected to signup/login');
          cleanup(false);
        } else {
          console.log('🔄 VINTED SESSION REFRESH: Unknown redirect, treating as success');
          cleanup(true);
        }
      };

      // Fallback tab update listener
      const tabUpdateListener = (tabId, changeInfo, updatedTab) => {
        if (tabId !== tab.id || resolved) return;

        if (changeInfo.status === 'complete') {
          console.log('🔄 VINTED SESSION REFRESH: Tab completed loading:', updatedTab.url);

          // If webRequest didn't catch it, check URL directly
          if (!resolved) {
            if (updatedTab.url && updatedTab.url.includes('/items/new')) {
              console.log('🔄 VINTED SESSION REFRESH: Tab update - success');
              cleanup(true);
            } else if (updatedTab.url && (updatedTab.url.includes('/login') || updatedTab.url.includes('/signup'))) {
              console.log('🔄 VINTED SESSION REFRESH: Tab update - failure');
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
          console.log('🔄 VINTED SESSION REFRESH: Timeout waiting for refresh (20s)');
          console.log('🔄 VINTED SESSION REFRESH: Last known URL:', redirectedTo || 'none');
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
          console.log('🔄 VINTED SESSION REFRESH: Refresh tab closed, success:', success);
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
  } else if (request.action === "FCU_getTokenViaContentScript") {
    console.log("Received getTokenViaContentScript via content.js message");
    console.log("Request data:", request);

    const channel = request.channel || 'depop'; // Default to depop for backward compatibility

    // Route to specific platform based on channel
    if (channel === 'vinted') {
      const baseUrl = request.base_url; // Don't provide default here, let the function handle it

      console.log('🟣 Processing Vinted auth request with baseUrl:', baseUrl);
      
      // Record frontend refresh timestamp for alarm coordination
      chrome.storage.local.set({ 
        vinted_last_frontend_refresh: Date.now() 
      });
      console.log('🔔 VINTED COORDINATION: Recorded frontend refresh timestamp');
      
      getVintedTokensViaContentScript(request.userIdentifier, baseUrl).then(result => {
        console.log('🟣 Vinted auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'vinted'
        };
        console.log('🟣 Sending Vinted response to content script:', response);
        sendResponse(response);
      }).catch(error => {
        console.error('🟣 Vinted auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'vinted'
        };
        console.log('🟣 Sending Vinted error response:', errorResponse);
        sendResponse(errorResponse);
      });
    } else {
      // Default to Depop
      console.log('🟡 Processing Depop auth request');
      getDepopTokensViaContentScript(request.userIdentifier).then(result => {
        console.log('🟡 Depop auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'depop'
        };
        console.log('🟡 Sending Depop response to content script:', response);
        sendResponse(response);
      }).catch(error => {
        console.error('🟡 Depop auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'depop'
        };
        console.log('🟡 Sending Depop error response:', errorResponse);
        sendResponse(errorResponse);
      });
    }

    return true; // ✅ ✅ ✅ ***CRUCIAL: TELL CHROME YOU WILL SEND RESPONSE LATER***
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
    // Extract base URL from endpoint to get the right domain, or use stored preference
    let baseUrl;
    if (endpoint) {
      const endpointUrl = new URL(endpoint);
      baseUrl = `${endpointUrl.protocol}//${endpointUrl.hostname}/`;
    } else {
      // If no endpoint provided, use stored domain preference
      baseUrl = await getVintedDomainPreference();
    }
    
    console.log('🎯 Using dynamic Vinted domain for listing creation:', baseUrl);
    
    // First, ensure we have valid cookies for the specific domain
    const cookieString = await getVintedHeadersCookies(baseUrl);

    if (!cookieString) {
      throw new Error('No Vinted cookies found - user needs to authenticate');
    }

    // Check if we have access_token_web cookie
    const hasAccessTokenWeb = cookieString.includes('access_token_web=');
    console.log('🔍 access_token_web check:', hasAccessTokenWeb ? '✅ PRESENT' : '❌ MISSING');

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

    // Add CSRF token if provided - this is crucial for Vinted
    if (headers && headers.csrf_token) {
      requestHeaders['X-CSRF-token'] = headers.csrf_token;
      console.log('🔐 VINTED LISTING: Added CSRF token from backend');
    } else {
      console.warn('⚠️ VINTED LISTING: No CSRF token provided - request may fail');
    }

    // Add anon_id if provided
    if (headers && headers.anon_id) {
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
        item_url: `${originUrl}/items/${responseData.item.id}`,
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
    'https://fluf.io/wp-json/fc/listings/v1/vinted-extension-callback'
  ];

  // Try all endpoints and return first successful result
  let firstSuccessfulResult = null;
  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔄 Trying callback endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Callback successful at ${endpoint}:`, result);
        results.push({ endpoint, success: true, result });

        // Store first successful result but continue trying other endpoints
        if (!firstSuccessfulResult) {
          firstSuccessfulResult = result;
        }
      } else {
        console.log(`❌ Callback failed at ${endpoint}: ${response.status} ${response.statusText}`);
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
  console.log(`📊 Callback summary: ${successful} successful, ${failed} failed out of ${results.length} endpoints`);

  if (firstSuccessfulResult) {
    console.log('✅ Returning first successful result');
    return firstSuccessfulResult;
  } else {
    console.log('❌ All callback endpoints failed');
    return null;
  }
}

// Function to send the token to the WordPress API using fetch
function sendTokenToAPI(extractedData, sourceUrl = "", userIdentifier = "", sendResponse = null) {
  const { accessToken, userId, csrfToken, channel, fullCookies, anonId, vintedUsername, baseUrl } = extractedData;

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
    console.log('🔍 VERIFYING VINTED COOKIES:');
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
  console.log("🔍 DEBUG: userIdentifier parameter:", userIdentifier, "type:", typeof userIdentifier);
  if (userIdentifier) {
    requestBody.userIdentifier = userIdentifier;
    console.log("✅ Using WordPress user identifier:", userIdentifier);
  } else {
    console.log("❌ No userIdentifier provided - this will cause issues!");
  }

  console.log("Sending data to API:", { ...requestBody, cookies: requestBody.cookies ? '[REDACTED]' : undefined });
  console.log("Endpoints:", ENDPOINTS);
  
  // Log Vinted-specific fields for debugging
  if (channel === 'vinted') {
    console.log('🟣 VINTED API DATA:');
    console.log(' - base_url:', requestBody.base_url);
    console.log(' - country:', requestBody.country);
    console.log(' - user_id:', requestBody.user_id);
    console.log(' - has_access_token_web:', requestBody.has_access_token_web);
  }

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

    // Check for critical cookies for crosslisting
    const criticalCookies = ['access_token_web', 'anon_id'];
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