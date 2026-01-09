const DEV_MODE = false;

// Debug mode - must be declared early as debugLog uses it
let debugModeEnabled = DEV_MODE ? true : false;

// Endpoints - send to localhost, local development, and production
const ENDPOINTS = DEV_MODE ? ["http://localhost:10008/wp-json/fc/circular-auth/v1/token", "https://fluf.local/wp-json/fc/circular-auth/v1/token"] : [
  "https://fluf.io/wp-json/fc/circular-auth/v1/token"
];

// ============================================================================
// AGENT CORE - Inline agent functionality for Chrome Extension
// ============================================================================

// Agent state
let agentState = {
  active: false,
  currentJob: null,
  executionQueue: [],
  safetyPaused: false,
  rateLimits: new Map(),
  domainWhitelist: new Set()
};

// Rate limit configuration (actions per minute)
const AGENT_RATE_LIMITS = {
  'vinted.list-product': 10,
  'vinted.login': 5,
  'vinted.*': 30,
  'depop.*': 30,
  '*': 100
};

// Initialize domain whitelist
const INITIAL_WHITELIST = [
  'vinted.co.uk', 'vinted.com', 'vinted.fr', 'vinted.de', 'vinted.nl',
  'vinted.at', 'vinted.be', 'vinted.cz', 'vinted.dk', 'vinted.es',
  'vinted.fi', 'vinted.gr', 'vinted.hr', 'vinted.hu', 'vinted.ie',
  'vinted.it', 'vinted.lt', 'vinted.lu', 'vinted.pl', 'vinted.pt',
  'vinted.ro', 'vinted.se', 'vinted.sk',
  'depop.com',
  'fluf.io', 'fluf.local', 'localhost'
];

INITIAL_WHITELIST.forEach(domain => agentState.domainWhitelist.add(domain));

// Skill Registry
const skillRegistry = {
  skills: new Map(),
  
  register(skill) {
    this.skills.set(skill.id, skill);
    debugLog(`✅ Registered skill: ${skill.id}`);
  },
  
  get(id) {
    return this.skills.get(id);
  },
  
  getAll() {
    return Array.from(this.skills.values());
  },
  
  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(skill => 
      skill.id.toLowerCase().includes(lowerQuery) ||
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery)
    );
  }
};

// Browser Control API (using Chrome Extension APIs)
const browserControl = {
  async navigateTo(url, tabId = null) {
    debugLog(`🧭 Navigating to: ${url}`);
    
    if (!this.checkDomain(url)) {
      throw new Error(`Domain not whitelisted: ${url}`);
    }
    
    if (tabId) {
      await chrome.tabs.update(tabId, { url });
      await this.waitForTabComplete(tabId);
    } else {
      const tab = await chrome.tabs.create({ url, active: false });
      await this.waitForTabComplete(tab.id);
      return tab.id;
    }
  },
  
  async getCurrentURL(tabId) {
    const tab = await chrome.tabs.get(tabId);
    return tab.url;
  },
  
  async waitForTabComplete(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, timeout);
    });
  },
  
  async click(selector, tabId) {
    debugLog(`🖱️ Clicking: ${selector}`);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.click();
          return { success: true };
        }
        return { success: false, error: 'Element not found' };
      },
      args: [selector]
    });
    
    if (!results[0].result.success) {
      throw new Error(`Failed to click: ${selector}`);
    }
  },
  
  async type(selector, text, tabId) {
    debugLog(`⌨️ Typing into: ${selector}`);
    
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, txt) => {
        const element = document.querySelector(sel);
        if (element) {
          element.focus();
          element.value = txt;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }
        return { success: false, error: 'Element not found' };
      },
      args: [selector, text]
    });
  },
  
  async getText(selector, tabId) {
    debugLog(`📖 Getting text from: ${selector}`);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const element = document.querySelector(sel);
        return element ? element.textContent.trim() : null;
      },
      args: [selector]
    });
    
    return results[0].result;
  },
  
  async waitForSelector(selector, tabId, timeout = 10000) {
    debugLog(`⏳ Waiting for selector: ${selector}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => {
          return document.querySelector(sel) !== null;
        },
        args: [selector]
      });
      
      if (results[0].result) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Selector not found: ${selector}`);
  },
  
  async evaluate(code, tabId) {
    debugLog(`💻 Evaluating code`);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (codeStr) => {
        return eval(codeStr);
      },
      args: [code]
    });
    
    return results[0].result;
  },
  
  checkDomain(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      
      for (const allowedDomain of agentState.domainWhitelist) {
        if (hostname === allowedDomain || hostname.endsWith('.' + allowedDomain)) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      return false;
    }
  },
  
  async checkRateLimit(skillId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const skillLimit = AGENT_RATE_LIMITS[skillId] || AGENT_RATE_LIMITS[`${skillId.split('.')[0]}.*`] || AGENT_RATE_LIMITS['*'];
    
    if (!agentState.rateLimits.has(skillId)) {
      agentState.rateLimits.set(skillId, []);
    }
    
    const timestamps = agentState.rateLimits.get(skillId);
    const recentActions = timestamps.filter(ts => ts > oneMinuteAgo);
    
    if (recentActions.length >= skillLimit) {
      throw new Error(`Rate limit exceeded for ${skillId}: ${recentActions.length}/${skillLimit} per minute`);
    }
    
    recentActions.push(now);
    agentState.rateLimits.set(skillId, recentActions);
    
    return true;
  }
};

// Register generic skills
const genericSkills = {
  navigate: {
    id: 'generic.navigate',
    name: 'Navigate to URL',
    description: 'Navigate browser to a specific URL',
    category: 'navigation',
    inputs: [
      { name: 'url', type: 'string', required: true },
      { name: 'tabId', type: 'number', required: false }
    ],
    async execute(context, browser) {
      const { url, tabId } = context.inputs;
      const resultTabId = await browser.navigateTo(url, tabId);
      return { success: true, tabId: resultTabId || tabId };
    }
  },
  
  click: {
    id: 'generic.click',
    name: 'Click Element',
    description: 'Click an element by CSS selector',
    category: 'interaction',
    inputs: [
      { name: 'selector', type: 'string', required: true },
      { name: 'tabId', type: 'number', required: true }
    ],
    async execute(context, browser) {
      const { selector, tabId } = context.inputs;
      await browser.click(selector, tabId);
      return { success: true };
    }
  },
  
  type: {
    id: 'generic.type',
    name: 'Type Text',
    description: 'Type text into an input field',
    category: 'interaction',
    inputs: [
      { name: 'selector', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'tabId', type: 'number', required: true }
    ],
    async execute(context, browser) {
      const { selector, text, tabId } = context.inputs;
      await browser.type(selector, text, tabId);
      return { success: true };
    }
  },
  
  waitForSelector: {
    id: 'generic.waitForSelector',
    name: 'Wait for Element',
    description: 'Wait for an element to appear',
    category: 'interaction',
    inputs: [
      { name: 'selector', type: 'string', required: true },
      { name: 'tabId', type: 'number', required: true },
      { name: 'timeout', type: 'number', required: false }
    ],
    async execute(context, browser) {
      const { selector, tabId, timeout = 10000 } = context.inputs;
      await browser.waitForSelector(selector, tabId, timeout);
      return { success: true };
    }
  }
};

Object.values(genericSkills).forEach(skill => skillRegistry.register(skill));

// Agent Engine
const agentEngine = {
  async executeSkill(skillId, context) {
    debugLog(`🚀 Executing skill: ${skillId}`);
    
    if (agentState.safetyPaused) {
      throw new Error('Agent is paused');
    }
    
    const skill = skillRegistry.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    
    await browserControl.checkRateLimit(skillId);
    
    if (context.inputs?.url && !browserControl.checkDomain(context.inputs.url)) {
      throw new Error(`Domain not whitelisted: ${context.inputs.url}`);
    }
    
    try {
      const result = await skill.execute(context, browserControl);
      debugLog(`✅ Skill executed successfully: ${skillId}`);
      return result;
    } catch (error) {
      debugLog(`❌ Skill execution failed: ${skillId}`, error);
      throw error;
    }
  },
  
  async executeJob(job) {
    debugLog(`📋 Executing job: ${job.id}`);
    
    agentState.currentJob = job;
    agentState.active = true;
    
    const results = [];
    
    try {
      for (const task of job.tasks) {
        debugLog(`📝 Executing task: ${task.id} (${task.skillId})`);
        
        try {
          const result = await this.executeSkill(task.skillId, task.context);
          results.push({ taskId: task.id, success: true, result });
        } catch (error) {
          results.push({ taskId: task.id, success: false, error: error.message });
          
          if (!job.continueOnError) {
            throw error;
          }
        }
      }
      
      debugLog(`✅ Job completed: ${job.id}`);
      return { success: true, results };
    } catch (error) {
      debugLog(`❌ Job failed: ${job.id}`, error);
      return { success: false, error: error.message, results };
    } finally {
      agentState.currentJob = null;
      agentState.active = false;
    }
  },
  
  pause() {
    agentState.safetyPaused = true;
    debugLog('⏸️ Agent paused');
  },
  
  resume() {
    agentState.safetyPaused = false;
    debugLog('▶️ Agent resumed');
  },
  
  addDomain(domain) {
    agentState.domainWhitelist.add(domain);
    debugLog(`✅ Added domain to whitelist: ${domain}`);
  },
  
  getStatus() {
    return {
      active: agentState.active,
      currentJob: agentState.currentJob?.id || null,
      paused: agentState.safetyPaused,
      skillsCount: skillRegistry.getAll().length,
      whitelistedDomains: Array.from(agentState.domainWhitelist)
    };
  }
};

// Initialize agent on extension load
debugLog('🤖 Agent core initialized');


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

// ============================================================================
// CLIENT HINTS HEADERS - Anti-detection for Vinted API requests
// ============================================================================

/**
 * Get Client Hints headers that Chrome normally sends on navigation requests
 * but NOT on fetch() requests. Adding these makes our API calls look more
 * like real browser navigation requests.
 *
 * Uses the ACTUAL browser values (not spoofed) via navigator.userAgentData
 *
 * @returns {Object} Headers object with sec-ch-ua headers
 */
function getClientHintHeaders() {
  const headers = {};

  try {
    if (navigator.userAgentData) {
      // Modern browsers with User-Agent Client Hints API
      const brands = navigator.userAgentData.brands;
      if (brands?.length) {
        headers['sec-ch-ua'] = brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
      }
      headers['sec-ch-ua-mobile'] = navigator.userAgentData.mobile ? '?1' : '?0';
      if (navigator.userAgentData.platform) {
        headers['sec-ch-ua-platform'] = `"${navigator.userAgentData.platform}"`;
      }

      debugLog('🔍 CLIENT HINTS: Using navigator.userAgentData:', {
        brands: headers['sec-ch-ua'],
        mobile: headers['sec-ch-ua-mobile'],
        platform: headers['sec-ch-ua-platform']
      });
    } else {
      // Fallback for older Chrome or if userAgentData unavailable
      // Detect platform from userAgent string
      const ua = navigator.userAgent;
      let platform = '"Windows"';
      if (ua.includes('Mac OS X')) platform = '"macOS"';
      else if (ua.includes('Linux')) platform = '"Linux"';
      else if (ua.includes('Android')) platform = '"Android"';
      else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) platform = '"iOS"';

      // Extract Chrome version from user agent
      const chromeMatch = ua.match(/Chrome\/(\d+)/);
      const chromeVersion = chromeMatch ? chromeMatch[1] : '120';

      headers['sec-ch-ua'] = `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"`;
      headers['sec-ch-ua-mobile'] = '?0';
      headers['sec-ch-ua-platform'] = platform;

      debugLog('🔍 CLIENT HINTS: Using fallback values (no userAgentData):', headers);
    }
  } catch (error) {
    debugLog('⚠️ CLIENT HINTS: Error getting client hints:', error);
    // Return empty object - headers will just be missing
  }

  return headers;
}

// ============================================================================
// ERROR 106 RETRY LOGIC - Constants and configuration
// ============================================================================

// Error codes that indicate auth/session issues and are worth retrying
// Note: 403 (Forbidden) excluded - indicates permissions issue, not expired session
const RETRYABLE_AUTH_ERROR_CODES = [106, 401];

// Maximum number of retry attempts for auth errors
const MAX_AUTH_RETRY_ATTEMPTS = 1;

// Delay before retry attempt (ms)
const AUTH_RETRY_DELAY_MS = 1500;

/**
 * Check if an error response indicates an auth/session issue that can be retried
 *
 * @param {Object} responseData - Parsed JSON response from Vinted
 * @param {number} httpStatus - HTTP status code
 * @returns {boolean} True if this is a retryable auth error
 */
function isRetryableAuthError(responseData, httpStatus) {
  // Check HTTP status
  if (httpStatus === 401 || httpStatus === 403) {
    return true;
  }

  // Check Vinted-specific error codes
  const errorCode = responseData?.code || responseData?.error?.code;
  if (errorCode && RETRYABLE_AUTH_ERROR_CODES.includes(errorCode)) {
    return true;
  }

  // Check error message content
  const errorMessage = (responseData?.message || responseData?.error?.message || '').toLowerCase();
  const authKeywords = ['unauthorized', 'session expired', 'invalid token', 'authentication', 'not authenticated', 'login required'];

  if (authKeywords.some(keyword => errorMessage.includes(keyword))) {
    return true;
  }

  return false;
}

// ============================================================================
// DECLARATIVE NET REQUEST (DNR) - Dynamic header modification
// ============================================================================

/**
 * Initialize dynamic DNR rules for client hints
 * This sets the sec-ch-ua header dynamically based on the browser's actual values
 * Complements the static rules in dnr_rules.json
 */
async function initializeDynamicDNRRules() {
  try {
    // Check if declarativeNetRequest API is available
    if (!chrome.declarativeNetRequest) {
      debugLog('⚠️ DNR: declarativeNetRequest API not available');
      return;
    }

    // Get client hints values
    let secChUa = '"Chromium";v="120", "Google Chrome";v="120", "Not-A.Brand";v="99"';
    let secChUaPlatform = '"macOS"';

    if (navigator.userAgentData) {
      const brands = navigator.userAgentData.brands;
      if (brands?.length) {
        secChUa = brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
      }
      if (navigator.userAgentData.platform) {
        secChUaPlatform = `"${navigator.userAgentData.platform}"`;
      }
    }

    // Build dynamic rules for all Vinted domains
    const dynamicRules = VINTED_DOMAINS.map((domain, index) => ({
      id: 1000 + index, // Use IDs 1000+ for dynamic rules
      priority: 2, // Higher priority than static rules
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'sec-ch-ua',
            operation: 'set',
            value: secChUa
          },
          {
            header: 'sec-ch-ua-platform',
            operation: 'set',
            value: secChUaPlatform
          }
        ]
      },
      condition: {
        urlFilter: `*://${domain}/api/*`,
        resourceTypes: ['xmlhttprequest']
      }
    }));

    // Get existing dynamic rule IDs to remove them first
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);

    // Update rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: dynamicRules
    });

    debugLog('✅ DNR: Dynamic client hints rules initialized for', VINTED_DOMAINS.length, 'domains');
    debugLog('📋 DNR: sec-ch-ua:', secChUa);
    debugLog('📋 DNR: sec-ch-ua-platform:', secChUaPlatform);

  } catch (error) {
    debugLog('❌ DNR: Error initializing dynamic rules:', error);
    // Non-fatal - extension will still work with inline headers
  }
}

// Initialize DNR rules on extension load
initializeDynamicDNRRules();

// Re-initialize DNR rules periodically (in case browser updates)
setInterval(initializeDynamicDNRRules, 60 * 60 * 1000); // Every hour

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

  // Try to get userIdentifier from storage (set during last manual auth)
  let userIdentifier = null;
  try {
    const storage = await chrome.storage.local.get(['depop_last_user_identifier']);
    userIdentifier = storage.depop_last_user_identifier || null;
    debugLog('🔍 Retrieved stored Depop userIdentifier:', userIdentifier);
  } catch (error) {
    debugLog('⚠️ Error retrieving stored Depop userIdentifier:', error);
  }

  // Fallback: Try to get userIdentifier from active FLUF Connect tab
  if (!userIdentifier) {
    try {
      const tabs = await chrome.tabs.query({
        url: ['*://fluf.io/*', '*://fluf.local/*', '*://localhost/*']
      });

      if (tabs.length > 0) {
        // Try to get userIdentifier from the first FLUF tab
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              // Try to get from cookie
              const cookieMatch = document.cookie.match(/fc_user_identifier=([^;]+)/);
              if (cookieMatch) return cookieMatch[1];

              // Try to get from DOM element
              const element = document.getElementById('fc-user-identifier');
              if (element) {
                return element.getAttribute('data-user-id') || element.textContent;
              }

              // Try to get from window variables
              if (window._currentUserID) return window._currentUserID.toString();
              if (window._userIdentifier) return window._userIdentifier.toString();

              return null;
            }
          });

          if (results && results[0] && results[0].result) {
            userIdentifier = results[0].result;
            debugLog('✅ Retrieved Depop userIdentifier from active FLUF tab:', userIdentifier);

            // Store it for future use
            chrome.storage.local.set({ depop_last_user_identifier: userIdentifier });
          }
        } catch (scriptError) {
          debugLog('⚠️ Could not read userIdentifier from tab (may not have permission):', scriptError.message);
        }
      }
    } catch (tabError) {
      debugLog('⚠️ Error querying tabs for Depop userIdentifier:', tabError);
    }
  }

  if (!userIdentifier) {
    debugLog('⚠️ WARNING: No userIdentifier available for scheduled Depop check - auth may not be associated with correct user');
  }

  return await getDepopTokensViaContentScript(userIdentifier || '');
}

async function getVintedTokensDirectly() {
  debugLog('🔄 SCHEDULED VINTED CHECK');
  
  // Try to get userIdentifier from storage (set during last manual auth)
  let userIdentifier = null;
  try {
    const storage = await chrome.storage.local.get(['vinted_last_user_identifier']);
    userIdentifier = storage.vinted_last_user_identifier || null;
    debugLog('🔍 Retrieved stored userIdentifier:', userIdentifier);
  } catch (error) {
    debugLog('⚠️ Error retrieving stored userIdentifier:', error);
  }
  
  // Fallback: Try to get userIdentifier from active FLUF Connect tab
  if (!userIdentifier) {
    try {
      const tabs = await chrome.tabs.query({ 
        url: ['*://fluf.io/*', '*://fluf.local/*', '*://localhost/*'] 
      });
      
      if (tabs.length > 0) {
        // Try to get userIdentifier from the first FLUF tab
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              // Try to get from cookie
              const cookieMatch = document.cookie.match(/fc_user_identifier=([^;]+)/);
              if (cookieMatch) return cookieMatch[1];
              
              // Try to get from DOM element
              const element = document.getElementById('fc-user-identifier');
              if (element) {
                return element.getAttribute('data-user-id') || element.textContent;
              }
              
              // Try to get from window variables
              if (window._currentUserID) return window._currentUserID.toString();
              if (window._userIdentifier) return window._userIdentifier.toString();
              
              return null;
            }
          });
          
          if (results && results[0] && results[0].result) {
            userIdentifier = results[0].result;
            debugLog('✅ Retrieved userIdentifier from active FLUF tab:', userIdentifier);
            
            // Store it for future use
            chrome.storage.local.set({ vinted_last_user_identifier: userIdentifier });
          }
        } catch (scriptError) {
          debugLog('⚠️ Could not read userIdentifier from tab (may not have permission):', scriptError.message);
        }
      }
    } catch (tabError) {
      debugLog('⚠️ Error querying tabs for userIdentifier:', tabError);
    }
  }
  
  if (!userIdentifier) {
    debugLog('⚠️ WARNING: No userIdentifier available for scheduled check - auth may not be associated with correct user');
  }
  
  // Use stored domain preference for scheduled checks
  return await getVintedTokensViaContentScript(userIdentifier || '');
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

// Track active authentication requests to prevent duplicates
let activeAuthRequests = new Map(); // key: `${channel}_${userIdentifier}`, value: { timestamp, promise }
const AUTH_REQUEST_TIMEOUT_MS = 120000; // 2 minutes - max time for an auth request

let vintedListingQueue = [];
let vintedListingProcessing = false;
let vintedListingProcessingTimeout = null;
let vintedListingRateDelayMs = 0;
let lastVintedListingTime = 0;

function enqueueVintedListingRequest(request, sendResponse) {
  vintedListingQueue.push({ request, sendResponse });
  
  // Send telemetry for queue status
  sendTelemetry('listing_queued', {
    fid: request.fid,
    vid: request.vid,
    queue_size: vintedListingQueue.length,
    source: request.source || 'manual'
  }, request.uid);
  
  // Broadcast to frontend Extension Status Panel
  broadcastToFlufTabs('FLUF_EXTENSION_STATUS_UPDATE', {
    event: 'listing_queued',
    vid: request.vid,
    fid: request.fid,
    queue_size: vintedListingQueue.length,
    source: request.source || 'manual'
  });
  
  processVintedListingQueue();
}

function getRandomDelay(minMs, maxMs) {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return 0;
  }
  if (maxMs <= minMs) {
    return minMs;
  }
  let range = maxMs - minMs;
  return minMs + Math.floor(Math.random() * range);
}

async function processVintedListingQueue() {
  if (vintedListingProcessing) {
    return;
  }
  if (vintedListingQueue.length === 0) {
    return;
  }

  vintedListingProcessing = true;
  let { request, sendResponse } = vintedListingQueue.shift();

  try {
    let now = Date.now();
    if (vintedListingRateDelayMs === 0) {
      // HUMAN-LIKE TIMING: Balanced delays (5-10 seconds) to prevent captcha while maintaining throughput
      // This allows ~50 items to process within 30-minute token window
      vintedListingRateDelayMs = getRandomDelay(5_000, 10_000);
    }

    let timeSinceLast = now - lastVintedListingTime;
    if (timeSinceLast < vintedListingRateDelayMs) {
      let waitMs = vintedListingRateDelayMs - timeSinceLast;
      debugLog(`⏳ VINTED LISTING: Waiting ${Math.round(waitMs / 1000)} seconds before next listing (human-like timing)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // HUMAN-LIKE TIMING: Natural jitter (1-3 seconds) to prevent pattern detection
    let jitter = getRandomDelay(1_000, 3_000);
    debugLog(`⏳ VINTED LISTING: Adding jitter delay ${Math.round(jitter / 1000)} seconds`);
    await new Promise(resolve => setTimeout(resolve, jitter));

    let result = await handleVintedListingCreation(request);
    sendResponse(result);
  } catch (queueError) {
    console.error('❌ VINTED LISTING: Queue processing error:', queueError);
    
    // Send telemetry for queue error
    sendTelemetry('queue_error', {
      fid: request.fid,
      vid: request.vid,
      error: queueError?.message || 'Queue processing error',
      queue_size: vintedListingQueue.length
    }, request.uid);
    
    sendResponse({
      success: false,
      error: queueError?.message || 'Queue processing error',
      channel: 'vinted'
    });
  } finally {
    lastVintedListingTime = Date.now();
    vintedListingProcessing = false;
    // Reset delay to 5-10 seconds for next item
    vintedListingRateDelayMs = getRandomDelay(5_000, 10_000);

    // Process next item immediately if queue has items
    if (vintedListingQueue.length > 0) {
      vintedListingProcessingTimeout = setTimeout(() => {
        vintedListingProcessingTimeout = null;
        processVintedListingQueue();
      }, 0);
    }
  }
}

// Helper function to close duplicate Vinted tabs, keeping only one
async function closeDuplicateVintedTabs(keepTabId = null) {
  try {
    const allVintedTabs = await chrome.tabs.query({
      url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)
    });
    
    if (allVintedTabs.length <= 1) {
      debugLog('✅ VINTED: Only one tab exists, no duplicates to close');
      return;
    }
    
    debugLog(`🧹 VINTED: Found ${allVintedTabs.length} Vinted tabs, closing duplicates...`);
    
    // Sort by last accessed time (keep the most recently used)
    const sortedTabs = allVintedTabs.sort((a, b) => {
      // If we specified a tab to keep, prioritize it
      if (keepTabId) {
        if (a.id === keepTabId) return -1;
        if (b.id === keepTabId) return 1;
      }
      // Otherwise keep the most recently accessed
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
    
    // Keep the first tab, close the rest
    const tabToKeep = sortedTabs[0];
    const tabsToClose = sortedTabs.slice(1);
    
    debugLog(`🧹 VINTED: Keeping tab ${tabToKeep.id} (${tabToKeep.url})`);
    debugLog(`🧹 VINTED: Closing ${tabsToClose.length} duplicate tabs`);
    
    for (const tab of tabsToClose) {
      try {
        await chrome.tabs.remove(tab.id);
        debugLog(`🗑️ VINTED: Closed duplicate tab ${tab.id}`);
      } catch (error) {
        debugLog(`❌ VINTED: Failed to close tab ${tab.id}:`, error.message);
      }
    }
    
    debugLog('✅ VINTED: Duplicate tab cleanup complete');
  } catch (error) {
    debugLog('❌ VINTED: Error during duplicate tab cleanup:', error);
  }
}

// Debug mode management
let debugModeChecked = false;
let debugModeCheckPromise = null;

// Rate limiting for Vinted cookie extraction
let lastVintedDebuggerCheck = 0;
const VINTED_DEBUGGER_COOLDOWN = 10 * 60 * 1000; // 15 minutes in milliseconds

// Debug logging function
function debugLog(...args) {
  if (DEV_MODE || debugModeEnabled) {
    console.log(...args);
  }
}

// ============================================================================
// FRONTEND STATUS BROADCASTING - Send status updates to FLUF tabs
// ============================================================================

// Broadcast status update to all FLUF Connect tabs
async function broadcastToFlufTabs(type, data) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://fluf.io/*', '*://fluf.local/*', '*://localhost/*']
    });
    
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type, data });
      } catch (error) {
        // Tab might not have content script loaded, ignore
      }
    }
  } catch (error) {
    debugLog('Error broadcasting to FLUF tabs:', error);
  }
}

// ============================================================================
// TELEMETRY SYSTEM - Send diagnostic events to FLUF backend for debugging
// ============================================================================

// Telemetry buffer to batch events
let telemetryBuffer = [];
let telemetryFlushTimeout = null;
const TELEMETRY_FLUSH_INTERVAL = 5000; // Flush every 5 seconds
const TELEMETRY_MAX_BUFFER_SIZE = 20; // Or when buffer reaches 20 events

// Send telemetry event to FLUF backend
// Parameters:
// - eventType: Event type/category (e.g., 'vinted_token_refresh')
// - data: Event data object (may contain channel)
// - uid: WordPress user ID (0 if not available)
// - userIdentifier: Platform-specific identifier (e.g., Vinted user ID)
// - channel: Platform channel (vinted, depop, etc.) - can also be in data.channel
async function sendTelemetry(eventType, data, uid = null, userIdentifier = null, channel = null) {
  // Determine channel from parameter, data object, or default to 'unknown'
  const eventChannel = channel || (data && data.channel) || 'unknown';
  
  const event = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    uid: uid,
    user_identifier: userIdentifier || null,
    channel: eventChannel,
    data: data,
    extension_version: chrome.runtime.getManifest().version || '1.0.0'
  };
  
  telemetryBuffer.push(event);
  
  // Flush immediately for critical events
  const criticalEvents = [
    'listing_error', 
    'auth_error', 
    'queue_stuck', 
    'captcha_detected',
    // Auth flow critical events
    'vinted_auth_failed',
    'vinted_auth_error',
    'vinted_auth_missing_user_identifier',
    'vinted_cookie_extraction_failed',
    'vinted_cookie_extraction_error',
    'vinted_auth_api_failed',
    'vinted_token_refresh' // Track token refreshes immediately
  ];
  if (criticalEvents.includes(eventType) || telemetryBuffer.length >= TELEMETRY_MAX_BUFFER_SIZE) {
    await flushTelemetry();
  } else if (!telemetryFlushTimeout) {
    telemetryFlushTimeout = setTimeout(flushTelemetry, TELEMETRY_FLUSH_INTERVAL);
  }
}

// Flush telemetry buffer to backend
async function flushTelemetry() {
  if (telemetryFlushTimeout) {
    clearTimeout(telemetryFlushTimeout);
    telemetryFlushTimeout = null;
  }
  
  if (telemetryBuffer.length === 0) return;
  
  const eventsToSend = [...telemetryBuffer];
  telemetryBuffer = [];
  
  try {
    const response = await fetch('https://fluf.io/wp-json/fc/v1/extension-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: eventsToSend })
    });
    
    if (!response.ok) {
      // Put events back in buffer if failed (up to max size)
      telemetryBuffer = [...eventsToSend.slice(0, 10), ...telemetryBuffer].slice(0, TELEMETRY_MAX_BUFFER_SIZE);
    }
  } catch (error) {
    // Silently fail - don't break extension for telemetry
    debugLog('Telemetry flush failed:', error.message);
  }
}

// Check debug mode from FLUF web app (simple version)
async function checkDebugMode() {
  if (DEV_MODE) return;

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
  // Send telemetry for cookie extraction start
  sendTelemetry('vinted_cookie_extraction_started', {
    base_url: baseUrl,
    is_manual_trigger: isManualTrigger,
    target_domain: new URL(baseUrl).hostname
  }, null);
  
  // Check rate limiting (unless manually triggered)
  if (!isManualTrigger) {
    const now = Date.now();
    const timeSinceLastCheck = now - lastVintedDebuggerCheck;
    
    if (timeSinceLastCheck < VINTED_DEBUGGER_COOLDOWN) {
      const remainingMinutes = Math.ceil((VINTED_DEBUGGER_COOLDOWN - timeSinceLastCheck) / (60 * 1000));
      debugLog(`⏰ VINTED: Cookie check rate limited. Please wait ${remainingMinutes} more minutes or use manual trigger.`);
      
      // Send telemetry for rate limited
      sendTelemetry('vinted_cookie_extraction_rate_limited', {
        base_url: baseUrl,
        remaining_minutes: remainingMinutes,
        cooldown_ms: VINTED_DEBUGGER_COOLDOWN
      }, null);
      
      return {
        success: false,
        message: `Rate limited. Please wait ${remainingMinutes} more minutes or use manual trigger.`,
        rateLimited: true
      };
    }
  }
  
  // Check global coordination to prevent multiple instances across windows (unless manually triggered)
  if (globalVintedExtractionInProgress && !isManualTrigger) {
    debugLog('🔒 VINTED: Global extraction already in progress in another window, skipping...');
    
    // Send telemetry for concurrent extraction blocked
    sendTelemetry('vinted_cookie_extraction_blocked', {
      base_url: baseUrl,
      reason: 'global_extraction_in_progress'
    }, null);
    
    return {
      success: false,
      message: 'Vinted authentation already in progress in another window',
      rateLimited: true
    };
  }
  
  // Check if authentication is already in progress (manual triggers can bypass)
  if ((vintedCookiesExtractionLock || globalVintedExtractionInProgress) && !isManualTrigger) {
    debugLog('🔒 VINTED: Authentication already in progress, waiting for completion...');
    
    // Wait for the current authentication to complete (max 60 seconds)
    const maxWaitTime = 60000; // 60 seconds
    const startWait = Date.now();
    
    while ((vintedCookiesExtractionLock || globalVintedExtractionInProgress) && (Date.now() - startWait < maxWaitTime)) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (Date.now() - startWait >= maxWaitTime) {
      debugLog('⏰ VINTED: Wait timeout reached, proceeding anyway (locks may be stale)');
      // Reset stale locks
      vintedCookiesExtractionLock = false;
      globalVintedExtractionInProgress = false;
    } else {
      debugLog('🔓 VINTED: Previous authentication completed, checking for existing tabs before proceeding...');
      
      // Re-check for existing tabs after waiting - another process may have created one
      const recheckTabs = await chrome.tabs.query({
        url: VINTED_DOMAINS.map(domain => `*://${domain}/*`)
      });
      
      if (recheckTabs.length > 0) {
        debugLog('✅ VINTED: Found existing tab created by another process, using it instead');
        // Extract cookies from the existing tab without creating a new one
        const targetDomain = new URL(baseUrl).hostname;
        const existingCookies = await chrome.cookies.getAll({ domain: targetDomain });
        const cookieString = existingCookies.map(c => `${c.name}=${c.value}`).join('; ');
        const accessTokenWeb = existingCookies.find(c => c.name === 'access_token_web');
        
        if (accessTokenWeb) {
          return {
            success: true,
            cookieString: cookieString,
            accessTokenWeb: accessTokenWeb.value,
            anonId: existingCookies.find(c => c.name === 'anon_id')?.value || null,
            totalCookies: existingCookies.length,
            cookies: existingCookies,
            tabKeptOpen: false // Didn't create new tab
          };
        }
      }
    }
  } else if (isManualTrigger && (vintedCookiesExtractionLock || globalVintedExtractionInProgress)) {
    debugLog('🔓 VINTED: Manual trigger detected - bypassing locks for immediate user action');
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
    // Step 1: Check for existing Vinted tab in ALL windows (not just current)
    const existingTabs = await chrome.tabs.query({
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
    let vintedCookies = [];
    
    // METHOD 1: Query by URL (most reliable - gets all cookies that would be sent to this URL)
    try {
      let urlCookies = await chrome.cookies.getAll({
        url: baseUrl
      });
      vintedCookies.push(...urlCookies);
      debugLog(`📊 VINTED: Found ${urlCookies.length} cookies by URL ${baseUrl}`);
    } catch (urlError) {
      debugLog('⚠️ VINTED: Error accessing cookies by URL:', urlError);
    }
    
    // METHOD 2: Query by domain (backup)
    try {
      let domainCookies = await chrome.cookies.getAll({
        domain: targetDomain
      });
      vintedCookies.push(...domainCookies);
      debugLog(`📊 VINTED: Found ${domainCookies.length} cookies for domain ${targetDomain}`);
    } catch (cookieError) {
      debugLog('❌ VINTED: Error accessing cookies for target domain:', cookieError);
    }
    
    // METHOD 3: Query with .www prefix (some sites use this)
    try {
      let dotWwwCookies = await chrome.cookies.getAll({
        domain: '.' + targetDomain
      });
      vintedCookies.push(...dotWwwCookies);
      debugLog(`📊 VINTED: Found ${dotWwwCookies.length} cookies for .${targetDomain}`);
    } catch (dotWwwError) {
      debugLog('⚠️ VINTED: Error accessing .www domain cookies:', dotWwwError);
    }
    
    // METHOD 4: Parent domain without www (e.g. .vinted.co.uk)
    if (targetDomain.startsWith('www.')) {
      const parentDomain = targetDomain.replace('www.', '');
      try {
        let parentCookies = await chrome.cookies.getAll({
          domain: parentDomain
        });
        vintedCookies.push(...parentCookies);
        debugLog(`📊 VINTED: Found ${parentCookies.length} cookies for parent domain ${parentDomain}`);
        
        // Also try with leading dot
        let dotParentCookies = await chrome.cookies.getAll({
          domain: '.' + parentDomain
        });
        vintedCookies.push(...dotParentCookies);
        debugLog(`📊 VINTED: Found ${dotParentCookies.length} cookies for .${parentDomain}`);
      } catch (parentError) {
        debugLog('⚠️ VINTED: Error accessing parent domain cookies:', parentError);
      }
    }
    
    // METHOD 5: www subdomain if started with non-www
    if (!targetDomain.startsWith('www.')) {
      const wwwDomain = 'www.' + targetDomain;
      try {
        let wwwCookies = await chrome.cookies.getAll({
          domain: wwwDomain
        });
        vintedCookies.push(...wwwCookies);
        debugLog(`📊 VINTED: Found ${wwwCookies.length} additional cookies for ${wwwDomain}`);
      } catch (wwwError) {
        debugLog('⚠️ VINTED: Error accessing www subdomain cookies:', wwwError);
      }
    }
    
    if (vintedCookies.length === 0) {
      throw new Error('Failed to access cookies. Extension may need cookies permission.');
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
      
      // Send telemetry for missing access_token_web (user not logged in)
      sendTelemetry('vinted_cookie_extraction_failed', {
        base_url: baseUrl,
        target_domain: new URL(baseUrl).hostname,
        reason: 'access_token_web_missing',
        cookies_found: uniqueCookies.map(c => c.name),
        cookie_count: uniqueCookies.length,
        created_new_tab: createdNewTab,
        is_manual_trigger: isManualTrigger
      }, null);
      
      return {
        success: false,
        message: 'Please ensure you are logged into Vinted.',
        cookies: uniqueCookies.map(c => c.name),
        cookieCount: uniqueCookies.length,
        tabKeptOpen: createdNewTab && shouldKeepTabOpen
      };
    }
    
    // Step 7: Format as cookie string
    const cookieString = uniqueCookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    debugLog('✅ VINTED: Success! Extracted', uniqueCookies.length, 'cookies');
    debugLog('🔑 VINTED access_token_web:', finalAccessTokenWeb.value.substring(0, 20) + '...');
    
    // Send telemetry for successful cookie extraction
    sendTelemetry('vinted_cookie_extraction_success', {
      base_url: baseUrl,
      target_domain: new URL(baseUrl).hostname,
      cookie_count: uniqueCookies.length,
      has_access_token_web: true,
      has_anon_id: !!uniqueCookies.find(c => c.name === 'anon_id'),
      created_new_tab: createdNewTab,
      is_manual_trigger: isManualTrigger
    }, null);
    
    // Step 8: Clean up duplicate tabs (keep only the one we used)
    await closeDuplicateVintedTabs(tab.id);
    
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
    
    // Send telemetry for cookie extraction error
    sendTelemetry('vinted_cookie_extraction_error', {
      base_url: baseUrl,
      error: error.message,
      created_new_tab: createdNewTab,
      is_manual_trigger: isManualTrigger
    }, null);
    
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

/**
 * Send fresh Vinted cookies to FC backend for persistence.
 * This is called during auth retry to ensure fresh cookies are saved for future use.
 *
 * @param {Array} cookies - Array of cookie objects from chrome.cookies.getAll
 * @param {string|number} uid - User identifier (WordPress UID)
 * @param {string} baseUrl - Vinted base URL (e.g., 'https://www.vinted.co.uk/')
 * @returns {Promise<boolean>} - True if successfully sent to FC
 */
async function sendVintedCookiesToFC(cookies, uid, baseUrl) {
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    debugLog('⚠️ sendVintedCookiesToFC: No cookies to send');
    return false;
  }

  // Build cookie string format (like fullCookies)
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Verify we have access_token_web
  const hasAccessTokenWeb = cookieString.includes('access_token_web=');
  if (!hasAccessTokenWeb) {
    debugLog('⚠️ sendVintedCookiesToFC: Cookies missing access_token_web, skipping send');
    return false;
  }

  const requestBody = {
    channel: 'vinted',
    cookies: cookieString,
    has_access_token_web: hasAccessTokenWeb,
    is_retry_refresh: true // Flag to indicate this is from auth retry
  };

  if (uid) {
    requestBody.userIdentifier = uid;
  }

  if (baseUrl) {
    requestBody.base_url = baseUrl;
    const country = getCountryFromVintedUrl(baseUrl);
    if (country) {
      requestBody.country = country;
    }
  }

  debugLog('📤 sendVintedCookiesToFC: Sending cookies to FC backend...');
  debugLog('  - Cookie count:', cookies.length);
  debugLog('  - UID:', uid);
  debugLog('  - Base URL:', baseUrl);

  // Send to all configured endpoints
  const fetchPromises = ENDPOINTS.map(endpoint => {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }).then(response => {
      if (response.ok) {
        debugLog(`✅ sendVintedCookiesToFC: Successfully sent to ${endpoint}`);
        return true;
      } else {
        debugLog(`⚠️ sendVintedCookiesToFC: Failed to send to ${endpoint} (status: ${response.status})`);
        return false;
      }
    }).catch(error => {
      debugLog(`❌ sendVintedCookiesToFC: Error sending to ${endpoint}:`, error.message);
      return false;
    });
  });

  const results = await Promise.all(fetchPromises);
  const anySuccess = results.some(r => r === true);

  if (anySuccess) {
    sendTelemetry('vinted_cookies_sent_to_fc_during_retry', {
      uid: uid,
      base_url: baseUrl,
      cookie_count: cookies.length
    }, uid);
  }

  return anySuccess;
}

// ============================================================================
// VINTED IMAGE UPLOAD - Upload images to Vinted using extension cookies
// ============================================================================

/**
 * Apply image distortion transformations to bypass duplicate detection
 * Migrated from PHP process_image_for_bypass() to run in extension with Canvas API
 *
 * @param {Blob} imageBlob - Original image blob
 * @param {string} distortionLevel - 'unchanged', 'medium', or 'high'
 * @returns {Promise<Blob>} - Processed image blob
 */
async function processImageForBypass(imageBlob, distortionLevel = 'unchanged') {
  // If no distortion needed, return original
  if (distortionLevel === 'unchanged' || !distortionLevel) {
    debugLog('📷 IMAGE BYPASS: No distortion requested, using original image');
    return imageBlob;
  }

  debugLog(`📷 IMAGE BYPASS: Applying ${distortionLevel} distortion...`);

  try {
    // Use createImageBitmap instead of new Image() - works in service workers
    const imageBitmap = await createImageBitmap(imageBlob);

    let width = imageBitmap.width;
    let height = imageBitmap.height;

    // Resize if too large (optimization)
    const maxDimension = 1200;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // Technique 1: Micro-rotation
    let rotationAngle = 0;
    if (distortionLevel === 'medium') {
      rotationAngle = (Math.random() * 0.6 - 0.3); // -0.3 to 0.3 degrees
      if (rotationAngle === 0) rotationAngle = 0.15;
    } else if (distortionLevel === 'high') {
      rotationAngle = (Math.random() * 1.0 - 0.5); // -0.5 to 0.5 degrees
      if (rotationAngle === 0) rotationAngle = 0.2;
    }

    // Technique 2: Border addition
    let borderSize = 0;
    if (distortionLevel === 'medium') {
      borderSize = Math.floor(Math.random() * 2) + 1; // 1-2px
    } else if (distortionLevel === 'high') {
      borderSize = Math.floor(Math.random() * 3) + 1; // 1-3px
    }

    const newWidth = width + (borderSize * 2);
    const newHeight = height + (borderSize * 2);

    // Use OffscreenCanvas instead of document.createElement('canvas') - works in service workers
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // Fill with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, newWidth, newHeight);

    // Apply rotation if needed
    if (rotationAngle !== 0) {
      ctx.save();
      ctx.translate(newWidth / 2, newHeight / 2);
      ctx.rotate((rotationAngle * Math.PI) / 180);
      ctx.translate(-newWidth / 2, -newHeight / 2);
    }

    // Draw the image (with border offset)
    ctx.drawImage(imageBitmap, borderSize, borderSize, width, height);

    if (rotationAngle !== 0) {
      ctx.restore();
    }

    // Technique 3: Subtle pixel manipulation (for high distortion)
    if (distortionLevel === 'high') {
      const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
      const data = imageData.data;
      const stepSize = Math.max(10, Math.floor(newWidth / 100));
      const adjustmentRange = 2;

      for (let y = 0; y < newHeight; y += stepSize) {
        for (let x = 0; x < newWidth; x += stepSize) {
          if (Math.random() < 0.05) { // 5% of pixels
            const idx = (y * newWidth + x) * 4;
            data[idx] = Math.min(255, Math.max(0, data[idx] + Math.floor(Math.random() * adjustmentRange * 2 - adjustmentRange)));
            data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + Math.floor(Math.random() * adjustmentRange * 2 - adjustmentRange)));
            data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + Math.floor(Math.random() * adjustmentRange * 2 - adjustmentRange)));
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    // Determine JPEG quality based on distortion level
    let quality = 0.99;
    if (distortionLevel === 'high') {
      quality = 0.85 + Math.random() * 0.05; // 85-90%
    } else if (distortionLevel === 'medium') {
      quality = 0.90 + Math.random() * 0.05; // 90-95%
    }

    // Convert to blob using OffscreenCanvas.convertToBlob()
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality });

    if (blob) {
      debugLog(`📷 IMAGE BYPASS: Distortion applied - Level: ${distortionLevel}, Quality: ${Math.round(quality * 100)}%, Size: ${Math.round(blob.size / 1024)}KB`);
      imageBitmap.close(); // Clean up
      return blob;
    } else {
      debugLog('📷 IMAGE BYPASS: Failed to create blob, using original');
      imageBitmap.close();
      return imageBlob;
    }
  } catch (error) {
    debugLog('📷 IMAGE BYPASS: Error during processing, using original:', error.message);
    return imageBlob;
  }
}

/**
 * Upload a single image to Vinted using extension cookies
 * This runs in the extension context, using the same session as listing creation
 *
 * @param {string} imageUrl - URL of the image to upload
 * @param {string} baseUrl - Vinted base URL (e.g., 'https://www.vinted.co.uk/')
 * @param {string} cookieString - Cookie string from getVintedHeadersCookies
 * @param {string} csrfToken - CSRF token for the request
 * @param {string} anonId - Anon ID for the request (optional)
 * @param {string} distortionLevel - Image distortion level ('unchanged', 'medium', 'high')
 * @returns {Promise<{success: boolean, photoId?: number, error?: string}>}
 */
async function uploadVintedPhoto(imageUrl, baseUrl, cookieString, csrfToken, anonId = null, distortionLevel = 'unchanged') {
  debugLog(`📸 VINTED PHOTO UPLOAD: Starting upload for ${imageUrl.substring(0, 50)}...`);

  // Image metadata for diagnostics
  const imageMeta = {
    source_url: imageUrl,
    distortion_level: distortionLevel
  };

  try {
    // Step 1: Fetch the image
    debugLog('📸 VINTED PHOTO UPLOAD: Fetching image...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: HTTP ${imageResponse.status}`);
    }

    let imageBlob = await imageResponse.blob();

    // Capture original image metadata
    imageMeta.original_size_bytes = imageBlob.size;
    imageMeta.original_size_kb = Math.round(imageBlob.size / 1024);
    imageMeta.original_mime_type = imageBlob.type;

    debugLog(`📸 VINTED PHOTO UPLOAD: Got image blob, size: ${imageMeta.original_size_kb}KB, type: ${imageMeta.original_mime_type}`);

    // Step 2: Get image dimensions (before distortion)
    try {
      const dimensions = await getImageDimensions(imageBlob);
      imageMeta.original_width = dimensions.width;
      imageMeta.original_height = dimensions.height;
      debugLog(`📸 VINTED PHOTO UPLOAD: Original dimensions: ${dimensions.width}x${dimensions.height}`);
    } catch (dimError) {
      debugLog('📸 VINTED PHOTO UPLOAD: Could not get dimensions:', dimError.message);
    }

    // Step 3: Apply image distortion if requested (for bypass feature)
    if (distortionLevel && distortionLevel !== 'unchanged') {
      imageBlob = await processImageForBypass(imageBlob, distortionLevel);

      // Capture processed image metadata
      imageMeta.processed_size_bytes = imageBlob.size;
      imageMeta.processed_size_kb = Math.round(imageBlob.size / 1024);
      imageMeta.processed_mime_type = imageBlob.type;

      // Get processed dimensions
      try {
        const processedDimensions = await getImageDimensions(imageBlob);
        imageMeta.processed_width = processedDimensions.width;
        imageMeta.processed_height = processedDimensions.height;
      } catch (dimError) {
        // Ignore dimension errors for processed image
      }
    }

    // Final size for upload
    imageMeta.upload_size_bytes = imageBlob.size;
    imageMeta.upload_size_kb = Math.round(imageBlob.size / 1024);

    // Step 4: Prepare upload request
    const originUrl = baseUrl.replace(/\/$/, '');
    const uploadEndpoint = `${originUrl}/api/v2/photos`;
    const tempUuid = crypto.randomUUID();

    const formData = new FormData();
    formData.append('photo[type]', 'item');
    formData.append('photo[temp_uuid]', tempUuid);
    formData.append('photo[file]', imageBlob, 'photo.jpg');

    imageMeta.temp_uuid = tempUuid;

    // Get client hints for anti-detection
    const clientHints = getClientHintHeaders();

    const headers = {
      'Cookie': cookieString,
      'User-Agent': navigator.userAgent,
      // Client hints - makes fetch look more like real browser requests
      ...clientHints,
      'Referer': `${originUrl}/items/new`,
      'Origin': originUrl,
      'X-CSRF-token': csrfToken,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-uk-fr',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    };

    if (anonId) {
      headers['X-Anon-Id'] = anonId;
    }

    debugLog('📸 VINTED PHOTO UPLOAD: Uploading to', uploadEndpoint);
    imageMeta.upload_started_at = Date.now();

    // Step 5: Upload to Vinted
    const uploadResponse = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: headers,
      body: formData
    });

    imageMeta.upload_completed_at = Date.now();
    imageMeta.upload_duration_ms = imageMeta.upload_completed_at - imageMeta.upload_started_at;
    imageMeta.response_status = uploadResponse.status;

    debugLog('📸 VINTED PHOTO UPLOAD: Response status:', uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      debugLog('📸 VINTED PHOTO UPLOAD: Error response:', errorText);
      imageMeta.error_response = errorText.substring(0, 500);
      throw new Error(`Photo upload failed: HTTP ${uploadResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const responseData = await uploadResponse.json();
    debugLog('📸 VINTED PHOTO UPLOAD: Success! Photo ID:', responseData.id);

    imageMeta.vinted_photo_id = responseData.id;
    imageMeta.success = true;

    return {
      success: true,
      photoId: responseData.id,
      meta: imageMeta
    };

  } catch (error) {
    debugLog('📸 VINTED PHOTO UPLOAD: Error:', error.message);
    imageMeta.error = error.message;
    imageMeta.success = false;

    return {
      success: false,
      error: error.message,
      meta: imageMeta
    };
  }
}

/**
 * Get image dimensions from a blob
 * Uses createImageBitmap for service worker compatibility (no DOM APIs)
 * @param {Blob} blob - Image blob
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageDimensions(blob) {
  try {
    const imageBitmap = await createImageBitmap(blob);
    const dimensions = { width: imageBitmap.width, height: imageBitmap.height };
    imageBitmap.close(); // Clean up
    return dimensions;
  } catch (error) {
    throw new Error('Failed to load image for dimensions: ' + error.message);
  }
}

/**
 * Upload multiple images to Vinted sequentially
 *
 * @param {string[]} imageUrls - Array of image URLs to upload
 * @param {string} baseUrl - Vinted base URL
 * @param {string} cookieString - Cookie string
 * @param {string} csrfToken - CSRF token
 * @param {string} anonId - Anon ID (optional)
 * @param {string} distortionLevel - Image distortion level
 * @param {string|number} uid - User ID for telemetry
 * @returns {Promise<{success: boolean, assignedPhotos?: Array, error?: string, failedIndex?: number, imagesMeta?: Array}>}
 */
async function uploadVintedPhotos(imageUrls, baseUrl, cookieString, csrfToken, anonId = null, distortionLevel = 'unchanged', uid = null) {
  debugLog(`📸 VINTED PHOTOS: Uploading ${imageUrls.length} images...`);

  const assignedPhotos = [];
  const imagesMeta = []; // Collect metadata for all images
  const uploadStartTime = Date.now();

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    debugLog(`📸 VINTED PHOTOS: Uploading image ${i + 1}/${imageUrls.length}`);

    const result = await uploadVintedPhoto(
      imageUrl,
      baseUrl,
      cookieString,
      csrfToken,
      anonId,
      distortionLevel
    );

    // Always collect metadata (even for failures)
    if (result.meta) {
      result.meta.image_index = i;
      imagesMeta.push(result.meta);
    }

    if (!result.success) {
      debugLog(`📸 VINTED PHOTOS: Failed at image ${i + 1}: ${result.error}`);

      // Send telemetry for upload failure WITH full metadata
      sendTelemetry('photo_upload_failed', {
        image_index: i,
        total_images: imageUrls.length,
        error: result.error,
        distortion_level: distortionLevel,
        failed_image_meta: result.meta,
        all_images_meta: imagesMeta,
        total_duration_ms: Date.now() - uploadStartTime
      }, uid);

      return {
        success: false,
        error: `Failed to upload image ${i + 1}: ${result.error}`,
        failedIndex: i,
        failedImageMeta: result.meta,
        imagesMeta: imagesMeta
      };
    }

    assignedPhotos.push({
      id: result.photoId,
      orientation: 0,
      meta: result.meta // Include meta with each photo for PHP callback
    });

    // Small delay between uploads to avoid rate limiting (0.5-1.5 seconds)
    if (i < imageUrls.length - 1) {
      const delay = 500 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const totalDurationMs = Date.now() - uploadStartTime;
  debugLog(`📸 VINTED PHOTOS: All ${imageUrls.length} images uploaded successfully in ${totalDurationMs}ms`);

  // Aggregate metadata for telemetry
  const aggregateMeta = {
    photo_count: imageUrls.length,
    distortion_level: distortionLevel,
    total_duration_ms: totalDurationMs,
    avg_upload_duration_ms: Math.round(totalDurationMs / imageUrls.length),
    total_original_size_kb: imagesMeta.reduce((sum, m) => sum + (m.original_size_kb || 0), 0),
    total_upload_size_kb: imagesMeta.reduce((sum, m) => sum + (m.upload_size_kb || 0), 0),
    photo_ids: assignedPhotos.map(p => p.id),
    dimensions: imagesMeta.map(m => ({
      index: m.image_index,
      original: `${m.original_width || '?'}x${m.original_height || '?'}`,
      processed: m.processed_width ? `${m.processed_width}x${m.processed_height}` : null,
      size_kb: m.upload_size_kb,
      mime: m.original_mime_type
    }))
  };

  // Send telemetry for successful uploads WITH full metadata
  sendTelemetry('photos_upload_success', aggregateMeta, uid);

  return {
    success: true,
    assignedPhotos: assignedPhotos,
    imagesMeta: imagesMeta,
    aggregateMeta: aggregateMeta
  };
}

// Function to extract Vinted tokens
async function getVintedTokensViaContentScript(userIdentifier = "", baseUrl = null, isManualTrigger = false) {
  isManualTrigger = (userIdentifier === "manual_trigger") || isManualTrigger;
  debugLog('🟣 VINTED TOKEN EXTRACTION');
  
  // Send telemetry for auth attempt start
  sendTelemetry('vinted_auth_started', {
    user_identifier: userIdentifier || null,
    base_url: baseUrl,
    is_manual_trigger: isManualTrigger,
    trigger_source: isManualTrigger ? 'manual' : 'automatic'
  }, userIdentifier || null);
  
  // Debounce rapid duplicate calls (unless manually triggered)
  if (!isManualTrigger) {
    const now = Date.now();
    const timeSinceLastAttempt = now - lastVintedAuthAttempt;
    
    if (timeSinceLastAttempt < VINTED_AUTH_DEBOUNCE_MS) {
      debugLog(`⏸️ VINTED: Debouncing duplicate auth attempt (${timeSinceLastAttempt}ms since last attempt)`);
      
      // Send telemetry for debounced attempt
      sendTelemetry('vinted_auth_debounced', {
        user_identifier: userIdentifier || null,
        time_since_last_attempt_ms: timeSinceLastAttempt,
        debounce_threshold_ms: VINTED_AUTH_DEBOUNCE_MS
      }, userIdentifier || null);
      
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
      
      // Send telemetry for no cookies found
      sendTelemetry('vinted_auth_failed', {
        user_identifier: userIdentifier || null,
        base_url: baseUrl,
        reason: 'no_cookies_found',
        is_manual_trigger: isManualTrigger
      }, userIdentifier || null);
      
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
    
    // Send telemetry for successful cookie extraction (before API call)
    sendTelemetry('vinted_cookies_extracted', {
      user_identifier: userIdentifier || null,
      base_url: baseUrl,
      has_access_token_web: hasAccessTokenWeb,
      has_user_id: !!userId,
      vinted_user_id: userId || null,
      is_manual_trigger: isManualTrigger
    }, userIdentifier || null);
    
    sendTokenToAPI(extractedData, baseUrl, userIdentifier, null);
    console.groupEnd();

    return { success: true, message: 'Tokens found and sent to API' };

  } catch (error) {
    console.error('💥 Error extracting Vinted tokens:', error);
    
    // Send telemetry for auth error
    sendTelemetry('vinted_auth_error', {
      user_identifier: userIdentifier || null,
      base_url: baseUrl,
      error: error.message,
      is_manual_trigger: isManualTrigger
    }, userIdentifier || null);
    
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

    // Extract cookies using chrome.cookies API (more reliable than script injection)
    debugLog('🔧 Attempting to extract Depop cookies using chrome.cookies API');
    debugLog('🔧 Tab URL:', depopTab.length > 0 ? depopTab[0].url : 'New tab');
    
    // Verify tab URL matches host permissions
    const tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo.url || (!tabInfo.url.includes('depop.com') && !tabInfo.url.includes('localhost') && !tabInfo.url.includes('fluf.local'))) {
      const errorMsg = `Tab URL does not match host permissions: ${tabInfo.url}`;
      debugLog('❌ ' + errorMsg);
      throw new Error(errorMsg);
    }
    
    let accessToken = null;
    let userId = null;
    let allCookies = null;
    
    try {
      // Method 1: Use chrome.cookies API (preferred - no script injection needed)
      debugLog('🍪 Using chrome.cookies.getAll to extract Depop cookies...');
      const cookies = await chrome.cookies.getAll({ domain: 'depop.com' });
      
      if (cookies.length > 0) {
        debugLog(`🍪 Found ${cookies.length} Depop cookies via chrome.cookies API`);
        
        // Find access_token and user_id cookies
        accessToken = cookies.find(c => c.name === 'access_token')?.value || null;
        userId = cookies.find(c => c.name === 'user_id')?.value || null;
        
        // Build cookie string
        allCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        debugLog('🔧 DEPOP COOKIES FOUND:', allCookies.length, 'chars');
        debugLog('🔧 - access_token:', accessToken ? '[PRESENT]' : '[MISSING]');
        debugLog('🔧 - user_id:', userId ? '[PRESENT]' : '[MISSING]');
      } else {
        debugLog('⚠️ No cookies found via chrome.cookies API, trying script injection fallback...');
        throw new Error('No cookies found via chrome.cookies API');
      }
    } catch (cookieError) {
      // Method 2: Fallback to script injection if cookies API fails
      debugLog('🔄 Falling back to script injection method...');
      debugLog('🔧 Cookie API error:', cookieError.message);
      
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: "MAIN", // Execute in main world to access page context
          func: () => {
            debugLog('🔧 Content script injected successfully into Depop page');
            // This function runs in the Depop page context
            function getCookie(name) {
              const value = `; ${document.cookie}`;
              const parts = value.split(`; ${name}=`);
              if (parts.length === 2) return parts.pop().split(';').shift();
              return null;
            }

            // Get all cookies from the page context
            const allCookies = document.cookie;
            debugLog('🔧 All cookies:', allCookies);
            const accessToken = getCookie('access_token');
            const userId = getCookie('user_id');

            debugLog('🔧 DEPOP COOKIES FOUND:', allCookies.length, 'chars');
            debugLog('🔧 - access_token:', accessToken ? '[PRESENT]' : '[MISSING]');
            debugLog('🔧 - user_id:', userId ? '[PRESENT]' : '[MISSING]');
            debugLog('🔧 - Full cookie string:', allCookies.substring(0, 200) + '...');

            return {
              success: !!(accessToken && userId),
              accessToken: accessToken,
              userId: userId,
              allCookies: allCookies,
              sourceUrl: "https://www.depop.com"
            };
          }
        });
        
        if (results && results[0] && results[0].result) {
          const result = results[0].result;
          accessToken = result.accessToken;
          userId = result.userId;
          allCookies = result.allCookies;
        }
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
          message: 'Failed to extract Depop cookies: ' + injectionError.message,
          error: injectionError.message 
        };
      }
    }
    
    // Check if we have the required cookies
    if (!accessToken || !userId) {
      debugLog('❌ DEPOP FAIL: Missing required tokens');
      
      // Close tab if we created it and failed
      if (createdNewDepopTab && tabId) {
        debugLog('🗂️ Closing Depop tab that was created (missing tokens)');
        chrome.tabs.remove(tabId);
      }
      
      console.groupEnd();
      return { success: false, message: 'User not logged in' };
    }
    
    // Success - we have both tokens
    debugLog('✅ DEPOP SUCCESS: Both access token and user ID found');
    const extractedData = {
      channel: 'depop',
      accessToken: accessToken,
      userId: userId
    };

    sendTokenToAPI(extractedData, "https://www.depop.com", userIdentifier, null);

    // Close tab if we created it
    if (createdNewDepopTab && tabId) {
      debugLog('🗂️ Closing Depop tab that was created for token extraction');
      chrome.tabs.remove(tabId);
    }

    console.groupEnd();
    return { success: true, message: 'Tokens found and sent to API' };

  } catch (error) {
    console.error('💥 Error extracting Depop tokens:', error);
    debugLog('🔧 Error details:', error);
    debugLog('🔧 Error stack:', error.stack);
    console.groupEnd();
    return { success: false, error: error.message };
  }
}

// Facebook token extraction via content script
// Updated 2025-12-28: Now extracts fb_dtsg from page HTML (REQUIRED for API calls)
async function getFacebookTokensViaContentScript(userIdentifier = "") {
  console.group('🔵 FACEBOOK TOKEN EXTRACTION');

  try {
    debugLog('🍪 Using chrome.cookies.getAll to extract Facebook cookies...');
    const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });

    if (cookies.length === 0) {
      debugLog('❌ No Facebook cookies found - user not logged in');
      console.groupEnd();
      return {
        success: false,
        message: 'Not logged into Facebook. Please log in first.',
        error: 'Not logged in'
      };
    }

    debugLog(`🍪 Found ${cookies.length} Facebook cookies via chrome.cookies API`);

    // Build cookie map
    const cookieMap = {};
    cookies.forEach(cookie => {
      cookieMap[cookie.name] = cookie.value;
    });

    // Also get cookies from www.facebook.com specifically
    const wwwCookies = await chrome.cookies.getAll({ url: 'https://www.facebook.com' });
    wwwCookies.forEach(cookie => {
      cookieMap[cookie.name] = cookie.value; // Override with www cookies
    });

    // Check for essential cookies (CONFIRMED MINIMUM: only c_user + xs needed)
    const cUser = cookieMap['c_user'];
    const xs = cookieMap['xs'];

    debugLog('🔧 FACEBOOK COOKIES FOUND:');
    debugLog('🔧 - c_user:', cUser ? '[PRESENT]' : '[MISSING]');
    debugLog('🔧 - xs:', xs ? '[PRESENT]' : '[MISSING]');

    if (!cUser) {
      debugLog('❌ FACEBOOK FAIL: c_user cookie not found - user not logged in');
      console.groupEnd();
      return {
        success: false,
        message: 'Not logged into Facebook. Please log in first.',
        error: 'c_user cookie missing'
      };
    }

    if (!xs) {
      debugLog('❌ FACEBOOK FAIL: xs cookie not found - session invalid');
      console.groupEnd();
      return {
        success: false,
        message: 'Facebook session expired. Please log in again.',
        error: 'xs cookie missing'
      };
    }

    // ============================================
    // EXTRACT fb_dtsg FROM PAGE HTML (REQUIRED!)
    // fb_dtsg is a CSRF token that expires quickly and is REQUIRED for all API calls
    // ============================================
    debugLog('🔑 Fetching fb_dtsg from Facebook page...');

    let fb_dtsg = null;
    try {
      // Fetch a Facebook page to extract fb_dtsg from HTML
      // Using marketplace/you/selling as it's a lightweight page
      const fbPageResponse = await fetch('https://www.facebook.com/marketplace/you/selling', {
        credentials: 'include',
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
        }
      });

      if (fbPageResponse.ok) {
        const fbHtml = await fbPageResponse.text();

        // Try multiple regex patterns to extract fb_dtsg
        // Pattern 1: DTSGInitialData format (most common)
        let dtsgMatch = fbHtml.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/);

        // Pattern 2: Alternative DTSGInitialData format with whitespace
        if (!dtsgMatch) {
          dtsgMatch = fbHtml.match(/"DTSGInitialData",[\n\s]*\[[\n\s]*\][\n\s]*,[\n\s]*\{[\n\s]*"token":[\n\s]*"([^"]+)"/);
        }

        // Pattern 3: Direct fb_dtsg in form or script
        if (!dtsgMatch) {
          dtsgMatch = fbHtml.match(/name="fb_dtsg" value="([^"]+)"/);
        }

        // Pattern 4: JSON format in script
        if (!dtsgMatch) {
          dtsgMatch = fbHtml.match(/"fb_dtsg":\{"token":"([^"]+)"/);
        }

        if (dtsgMatch && dtsgMatch[1]) {
          fb_dtsg = dtsgMatch[1];
          debugLog('🔑 fb_dtsg extracted successfully:', fb_dtsg.substring(0, 20) + '...');
        } else {
          debugLog('⚠️ Could not find fb_dtsg in page HTML');
        }
      } else {
        debugLog('⚠️ Failed to fetch Facebook page:', fbPageResponse.status);
      }
    } catch (dtsgError) {
      debugLog('⚠️ Error extracting fb_dtsg:', dtsgError.message);
    }

    if (!fb_dtsg) {
      debugLog('❌ FACEBOOK FAIL: fb_dtsg not found - cannot make API calls');
      console.groupEnd();
      return {
        success: false,
        message: 'Could not extract Facebook session token. Please refresh Facebook and try again.',
        error: 'fb_dtsg not found'
      };
    }

    // Prepare payload for the API (CONFIRMED MINIMUM - tested 2025-12-28)
    // Only c_user, xs, and fb_dtsg are required
    const cookiePayload = {
      c_user: cUser,
      xs: xs,
      fb_dtsg: fb_dtsg  // CRITICAL: Required for all Facebook API calls
    };

    // Send to FC channels API
    debugLog('📤 Sending Facebook credentials to FC channels API...');

    const apiUrl = DEV_MODE
      ? 'http://localhost:10008/wp-json/fc/channels/v1/facebook/connect'
      : 'https://fluf.io/wp-json/fc/channels/v1/facebook/connect';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cookies: cookiePayload,
        user_agent: navigator.userAgent,
        device_type: 'desktop',
        userIdentifier: userIdentifier
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugLog('❌ FACEBOOK API FAIL:', response.status, errorText);
      console.groupEnd();
      return {
        success: false,
        message: 'Failed to connect Facebook to FLUF',
        error: errorText
      };
    }

    const result = await response.json();
    debugLog('✅ FACEBOOK SUCCESS:', result);

    console.groupEnd();
    return {
      success: true,
      message: result.message || 'Facebook connected successfully',
      fb_user_id: cUser,
      has_full_session: true,
      has_fb_dtsg: true
    };

  } catch (error) {
    console.error('💥 Error extracting Facebook tokens:', error);
    debugLog('🔧 Error details:', error);
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

  // Helper to update popup status when both checks complete
  function updatePopupStatus() {
    const successfulResults = allResults.filter(r => r.success);
    const failedResults = allResults.filter(r => !r.success);

    if (successfulResults.length === 2) {
      logStatus('Connected to Depop and Vinted', true);
    } else if (successfulResults.length === 1) {
      const successPlatform = successfulResults[0].platform;
      const failedPlatform = failedResults[0]?.platform;
      const failedReason = failedResults[0]?.error || 'Unknown error';
      logStatus(`Connected to ${successPlatform}. ${failedPlatform}: ${failedReason}`, true);
    } else {
      // Both failed
      const depopResult = allResults.find(r => r.platform === 'Depop');
      const vintedResult = allResults.find(r => r.platform === 'Vinted');
      const depopError = depopResult?.error || 'Not checked';
      const vintedError = vintedResult?.error || 'Not checked';
      logStatus(`Depop: ${depopError}. Vinted: ${vintedError}`, false);
    }
  }

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
      updatePopupStatus();
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
      updatePopupStatus();
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
      updatePopupStatus();
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
      updatePopupStatus();
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
      updatePopupStatus();
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
      updatePopupStatus();
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
      updatePopupStatus();
    } else if (completedChecks === 2) {
      debugLog(`🏁 Both checks complete: ${allResults.filter(r => r.success).length}/2 successful`);
      console.groupEnd();
      updatePopupStatus();
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

  } else if (request.action === "FCU_getUserId") {
    // Get the current user ID from storage (set during token sync)
    chrome.storage.local.get("FCU_userId", (data) => {
      sendResponse({ userId: data.FCU_userId || null });
    });
    return true; // Keep the message channel open for async response

  } else if (request.action === "FCU_sendTelemetry") {
    // Send telemetry event from popup
    const eventType = request.eventType || 'popup_event';
    const eventData = request.data || {};
    sendTelemetry(eventType, eventData, eventData.uid || null);
    sendResponse({ success: true });
    return true;

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
  } else if (request.action === "FCU_CLOSE_DUPLICATE_VINTED_TABS") {
    // Manual cleanup of duplicate Vinted tabs
    debugLog('🧹 MANUAL CLEANUP: Closing duplicate Vinted tabs requested');
    closeDuplicateVintedTabs().then(() => {
      sendResponse({ success: true, message: 'Duplicate tabs cleaned up' });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === "FCU_VINTED_CREATE_LISTING") {
    // Handle Vinted listing creation from FLUF backend
    debugLog("🚀 VINTED LISTING: Received create listing request from FLUF");
    debugLog("Request data:", request);

    // Send telemetry that we received a listing request
    sendTelemetry('listing_request_received', {
      fid: request.fid,
      vid: request.vid,
      source: request.source || 'manual',
      has_payload: !!request.payload,
      has_cookies: !!(request.cookies || (request.headers && request.headers.cookies))
    }, request.uid);

    enqueueVintedListingRequest(request, (result) => {
      debugLog("✅ VINTED LISTING: Result:", result);
      sendResponse(result);
    });

    return true; // Keep message channel open for async response
  } else if (request.action === "FCU_getTokenViaContentScript") {
    debugLog("Received getTokenViaContentScript via content.js message");
    debugLog("Request data:", request);

    const channel = request.channel || 'depop'; // Default to depop for backward compatibility
    const userIdentifier = request.userIdentifier || '';
    
    // Create a unique key for this auth request
    const requestKey = `${channel}_${userIdentifier}`;
    
    // Clean up stale requests (older than timeout)
    const now = Date.now();
    for (const [key, value] of activeAuthRequests.entries()) {
      if (now - value.timestamp > AUTH_REQUEST_TIMEOUT_MS) {
        debugLog(`🧹 Cleaning up stale auth request: ${key}`);
        activeAuthRequests.delete(key);
      }
    }
    
    // Check if there's already an active request for this channel/user
    // Use a more aggressive debounce for very recent requests (within 1 second)
    const RECENT_REQUEST_DEBOUNCE_MS = 1000; // 1 second
    
    if (activeAuthRequests.has(requestKey)) {
      const existingRequest = activeAuthRequests.get(requestKey);
      const timeSinceRequest = now - existingRequest.timestamp;
      
      if (timeSinceRequest < AUTH_REQUEST_TIMEOUT_MS) {
        // For very recent requests (within 1 second), always return existing
        // For older requests, still return existing but log it
        if (timeSinceRequest < RECENT_REQUEST_DEBOUNCE_MS) {
          debugLog(`🚫 DUPLICATE PREVENTION: Very recent ${channel} auth request (${Math.round(timeSinceRequest)}ms ago) - returning existing result`);
        } else {
          debugLog(`⚠️ DUPLICATE PREVENTION: Active ${channel} auth request already in progress for user ${userIdentifier} (${Math.round(timeSinceRequest / 1000)}s ago)`);
        }
        debugLog(`⚠️ Returning existing promise instead of creating duplicate request`);
        
        // Return the existing promise's result
        existingRequest.promise.then(result => {
          debugLog(`🔄 Duplicate request resolved with existing result:`, result);
          sendResponse(result);
        }).catch(error => {
          debugLog(`🔄 Duplicate request failed with existing error:`, error);
          const errorResponse = typeof error === 'object' && error !== null && !Array.isArray(error)
            ? error
            : {
                success: false,
                error: error?.message || String(error) || 'Unknown error',
                channel: channel
              };
          sendResponse(errorResponse);
        });
        
        return true; // Keep message channel open
      } else {
        // Stale request, remove it
        debugLog(`🧹 Removing stale request: ${requestKey}`);
        activeAuthRequests.delete(requestKey);
      }
    }
    
    debugLog(`🔐 CHANNEL-SPECIFIC AUTH: Processing ${channel.toUpperCase()} authentication request`);
    debugLog(`🔐 CHANNEL ISOLATION: Will ONLY authenticate ${channel.toUpperCase()}, not other platforms`);

    // Create a promise for this auth request
    let authPromise;
    
    // Route to specific platform based on channel
    if (channel === 'vinted') {
      const baseUrl = request.base_url; // Don't provide default here, let the function handle it

      debugLog('🟣 Processing Vinted auth request with baseUrl:', baseUrl);
      
      // Record frontend refresh timestamp and userIdentifier for alarm coordination
      chrome.storage.local.set({ 
        vinted_last_frontend_refresh: Date.now(),
        vinted_last_user_identifier: request.userIdentifier || null
      });
      debugLog('🔔 VINTED COORDINATION: Recorded frontend refresh timestamp and userIdentifier:', request.userIdentifier);
      
      authPromise = getVintedTokensViaContentScript(request.userIdentifier, baseUrl, true).then(result => {
        debugLog('🟣 Vinted auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'vinted'
        };
        
        // Clean up the active request on success
        activeAuthRequests.delete(requestKey);
        
        return response;
      }).catch(error => {
        console.error('🟣 Vinted auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'vinted'
        };
        
        // Clean up the active request on error
        activeAuthRequests.delete(requestKey);
        
        throw errorResponse;
      });
    } else if (channel === 'facebook') {
      debugLog('🔵 Processing Facebook auth request');
      debugLog('🔵 FACEBOOK ONLY: Will authenticate ONLY Facebook, not other platforms');

      authPromise = getFacebookTokensViaContentScript(request.userIdentifier).then(result => {
        debugLog('🔵 Facebook auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'facebook',
          fb_user_id: result?.fb_user_id,
          has_full_session: result?.has_full_session
        };

        // Clean up the active request on success
        activeAuthRequests.delete(requestKey);

        return response;
      }).catch(error => {
        console.error('🔵 Facebook auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'facebook'
        };

        // Clean up the active request on error
        activeAuthRequests.delete(requestKey);

        throw errorResponse;
      });
    } else {
      // Default to Depop
      debugLog('🟡 Processing Depop auth request');
      debugLog('🟡 DEPOP ONLY: Will authenticate ONLY Depop, not Vinted or other platforms');

      // Record frontend refresh timestamp and userIdentifier for alarm coordination
      chrome.storage.local.set({
        depop_last_frontend_refresh: Date.now(),
        depop_last_user_identifier: request.userIdentifier || null
      });
      debugLog('🔔 DEPOP COORDINATION: Recorded frontend refresh timestamp and userIdentifier:', request.userIdentifier);

      authPromise = getDepopTokensViaContentScript(request.userIdentifier).then(result => {
        debugLog('🟡 Depop auth result:', result);
        const response = {
          success: result?.success || false,
          error: result?.success ? null : (result?.message || result?.error || 'Unknown error'),
          message: result?.success ? result?.message : null,
          channel: 'depop'
        };
        
        // Clean up the active request on success
        activeAuthRequests.delete(requestKey);
        
        return response;
      }).catch(error => {
        console.error('🟡 Depop auth error:', error);
        const errorResponse = {
          success: false,
          error: error.message || 'Unknown error',
          channel: 'depop'
        };
        
        // Clean up the active request on error
        activeAuthRequests.delete(requestKey);
        
        throw errorResponse;
      });
    }
    
    // Store the active request
    activeAuthRequests.set(requestKey, {
      timestamp: now,
      promise: authPromise
    });
    
    debugLog(`📝 Stored active auth request: ${requestKey} (${activeAuthRequests.size} total active requests)`);
    
    // Handle the promise
    authPromise.then(result => {
      debugLog(`✅ Auth request completed: ${requestKey}`);
      sendResponse(result);
    }).catch(error => {
      debugLog(`❌ Auth request failed: ${requestKey}`, error);
      // Ensure error is in the correct format
      const errorResponse = typeof error === 'object' && error !== null && !Array.isArray(error)
        ? error
        : {
            success: false,
            error: error?.message || String(error) || 'Unknown error',
            channel: channel
          };
      sendResponse(errorResponse);
    });

    return true; // ✅ ✅ ✅ ***CRUCIAL: TELL CHROME YOU WILL SEND RESPONSE LATER***
  }
  
  // Agent Control Messages
  else if (request.action === "AGENT_EXECUTE_SKILL") {
    debugLog('🤖 AGENT: Execute skill request:', request.skillId);
    
    agentEngine.executeSkill(request.skillId, request.context || {})
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open
  }
  
  else if (request.action === "AGENT_EXECUTE_JOB") {
    debugLog('🤖 AGENT: Execute job request:', request.job?.id);
    
    agentEngine.executeJob(request.job)
      .then(result => {
        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open
  }
  
  else if (request.action === "AGENT_GET_SKILLS") {
    debugLog('🤖 AGENT: Get skills request');
    
    const query = request.query || '';
    const skills = query 
      ? skillRegistry.search(query)
      : skillRegistry.getAll();
    
    sendResponse({ 
      success: true, 
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        requiresApproval: s.requiresApproval || false,
        inputs: s.inputs || []
      }))
    });
    return false;
  }
  
  else if (request.action === "AGENT_GET_STATUS") {
    debugLog('🤖 AGENT: Get status request');
    
    const status = agentEngine.getStatus();
    sendResponse({ success: true, status });
    return false;
  }
  
  else if (request.action === "AGENT_PAUSE") {
    debugLog('🤖 AGENT: Pause request');
    
    agentEngine.pause();
    sendResponse({ success: true });
    return false;
  }
  
  else if (request.action === "AGENT_RESUME") {
    debugLog('🤖 AGENT: Resume request');
    
    agentEngine.resume();
    sendResponse({ success: true });
    return false;
  }
  
  else if (request.action === "AGENT_ADD_DOMAIN") {
    debugLog('🤖 AGENT: Add domain request:', request.domain);
    
    agentEngine.addDomain(request.domain);
    sendResponse({ success: true });
    return false;
  }
});

// Function to handle Vinted listing creation
// @param {Object} request - The listing request object
// @param {number} retryAttempt - Current retry attempt (0 = first try, 1 = retry after auth refresh)
async function handleVintedListingCreation(request, retryAttempt = 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2ae7c98f-f398-47b3-80a8-fdb88173d4b9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FLUF Chrome Extension/background.js:2635',message:'FCU_VINTED_CREATE_LISTING request received',data:{request: request, retryAttempt: retryAttempt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
        if (request.action === 'FCU_VINTED_CREATE_LISTING' && request.payload && request.payload.body && request.payload.body.item) {
          fetch('http://127.0.0.1:7242/ingest/2ae7c98f-f398-47b3-80a8-fdb88173d4b9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FLUF Chrome Extension/background.js:2639',message:'Assigned photos before listing',data:{assignedPhotos: request.payload.body.item.assigned_photos},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion
  let listingStartTime = Date.now();
  const isRetry = retryAttempt > 0;
  debugLog('🚀 VINTED LISTING: Starting listing creation process' + (isRetry ? ' (RETRY ATTEMPT)' : ''));
  debugLog('📋 VINTED LISTING: Request data:', { fid: request.fid, vid: request.vid, uid: request.uid, retryAttempt });

  // Send telemetry immediately when listing request is received
  // This helps track if the extension receives requests but fails silently
  sendTelemetry(isRetry ? 'listing_retry_started' : 'listing_request_received', {
    fid: request.fid,
    vid: request.vid,
    source: request.source || 'manual',
    has_payload: !!request.payload,
    has_endpoint: !!request.endpoint,
    has_headers: !!request.headers,
    retry_attempt: retryAttempt
  }, request.uid);
  
  // Broadcast listing started to frontend
  broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
    event: 'listing_started',
    vid: request.vid,
    fid: request.fid,
    message: 'Preparing your listing...',
    status: 'pending'
  });

  const { payload, headers, endpoint, method, fid, vid, uid, cookies, source } = request;
  let cookieSource = 'none';
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/2ae7c98f-f398-47b3-80a8-fdb88173d4b9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FLUF Chrome Extension/background.js:2665',message:'Vinted listing start',data:{fid:fid,vid:vid,uid:uid,source:source || 'manual',payloadPresent:!!payload,assignedPhotosCount:payload?.item?.assigned_photos?.length ?? 0,assignedPhotoIds:payload?.item?.assigned_photos?.map(photo => photo.id ?? null) ?? []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'photosPayload'})}).catch(()=>{});
  // #endregion
  
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

  // DUPLICATE PREVENTION: Check if this VID was successfully listed in the last 24 hours
  try {
    const storage = await chrome.storage.local.get(['vinted_successful_listings']);
    const successfulListings = storage.vinted_successful_listings || {};
    
    const listingKey = `${uid}_${vid}`;
    const lastSuccess = successfulListings[listingKey];
    
    if (lastSuccess) {
      const hoursSinceSuccess = (Date.now() - lastSuccess.timestamp) / (1000 * 60 * 60);
      
      if (hoursSinceSuccess < 24) {
        debugLog(`⚠️ DUPLICATE PREVENTION: VID ${vid} was successfully listed ${hoursSinceSuccess.toFixed(1)} hours ago`);
        debugLog(`⚠️ Vinted Item ID: ${lastSuccess.item_id}, skipping to prevent duplicate`);
        
        // Return the cached success result instead of creating duplicate
        return {
          success: true,
          item_id: lastSuccess.item_id,
          item_url: lastSuccess.item_url,
          channel: 'vinted',
          cached: true,
          message: 'Already listed successfully within last 24 hours'
        };
      } else {
        debugLog(`✅ Last success was ${hoursSinceSuccess.toFixed(1)} hours ago (>24h), allowing re-list`);
      }
    }
  } catch (storageError) {
    debugLog('⚠️ Error checking successful listings cache:', storageError);
    // Continue anyway - don't block on storage errors
  }

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
      cookieSource = 'extension';
    } catch (extensionError) {
      debugLog('⚠️ VINTED LISTING: Extension cookie extraction failed:', extensionError.message);
      
      // Fallback to backend-provided cookies
      if (backendCookies && backendCookies.trim()) {
        cookieString = backendCookies.trim();
        debugLog('🔄 VINTED LISTING: Using backend-provided cookies as fallback');
        debugLog('📊 VINTED LISTING: Backend cookie length:', cookieString.length);
        debugLog('🍪 VINTED LISTING: Backend cookie source:', cookies ? 'direct cookies param' : 'headers.cookies');
        cookieSource = 'backend';
      } else {
        debugLog('❌ VINTED LISTING: No backend cookies provided as fallback');
      }
    }

    if (!cookieString) {
      throw new Error('No Vinted cookies found - user needs to authenticate');
    }

    // Check if we have access_token_web cookie
    let hasAccessTokenWeb = cookieString.includes('access_token_web=');
    debugLog('🔍 access_token_web check:', hasAccessTokenWeb ? '✅ PRESENT' : '❌ MISSING');

    // AUTH RETRY: If access_token_web is missing, try once more with forced fresh cookie extraction
    if (!hasAccessTokenWeb && retryAttempt < 1) {
      debugLog('🔄 VINTED LISTING: access_token_web missing - attempting fresh cookie extraction...');

      sendTelemetry('listing_initial_auth_retry_started', {
        fid: fid,
        vid: vid,
        reason: 'access_token_web_missing_on_initial_check',
        cookie_source: cookieSource,
        original_cookie_count: cookieString ? cookieString.split(';').length : 0
      }, uid);

      try {
        // Force fresh cookie extraction (bypass rate limits)
        const freshCookieResult = await getVintedCookiesWithDevTools(baseUrl, true);

        if (freshCookieResult.success && freshCookieResult.cookieString) {
          cookieString = freshCookieResult.cookieString;
          hasAccessTokenWeb = cookieString.includes('access_token_web=');

          debugLog('🔍 VINTED LISTING: Fresh cookie extraction result - access_token_web:', hasAccessTokenWeb ? '✅ PRESENT' : '❌ STILL MISSING');

          if (hasAccessTokenWeb) {
            debugLog('✅ VINTED LISTING: Fresh cookies obtained with access_token_web - proceeding with listing');
            cookieSource = 'extension_retry';

            sendTelemetry('listing_initial_auth_retry_success', {
              fid: fid,
              vid: vid,
              total_cookies: freshCookieResult.totalCookies || 0
            }, uid);

            // Also send fresh cookies to FC backend for persistence
            try {
              await sendVintedCookiesToFC(freshCookieResult.cookies || [], uid, baseUrl);
              debugLog('✅ VINTED LISTING: Fresh cookies sent to FC backend for persistence');
            } catch (fcError) {
              debugLog('⚠️ VINTED LISTING: Failed to send cookies to FC (non-blocking):', fcError.message);
            }
          } else {
            sendTelemetry('listing_initial_auth_retry_failed', {
              fid: fid,
              vid: vid,
              reason: 'access_token_web_still_missing_after_extraction',
              cookie_count: cookieString ? cookieString.split(';').length : 0
            }, uid);
          }
        } else {
          debugLog('❌ VINTED LISTING: Fresh cookie extraction failed:', freshCookieResult.message);

          sendTelemetry('listing_initial_auth_retry_failed', {
            fid: fid,
            vid: vid,
            reason: 'cookie_extraction_failed',
            extraction_error: freshCookieResult.message
          }, uid);
        }
      } catch (retryError) {
        debugLog('❌ VINTED LISTING: Error during initial auth retry:', retryError.message);

        sendTelemetry('listing_initial_auth_retry_error', {
          fid: fid,
          vid: vid,
          error: retryError.message
        }, uid);
      }
    }

    // Final check after potential retry
    if (!hasAccessTokenWeb) {
      // Send telemetry for auth failure
      sendTelemetry('auth_error', {
        reason: 'access_token_web_missing',
        has_cookies: !!cookieString,
        cookie_count: cookieString ? cookieString.split(';').length : 0,
        did_attempt_retry: retryAttempt < 1
      }, uid);

      // Broadcast auth error to user
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_error',
        vid: vid,
        fid: fid,
        message: 'Session expired',
        status: 'error',
        details: 'Please log into Vinted and click the FLUF extension to refresh your session.'
      });

      throw new Error('Please ensure you are logged into Vinted.');
    }

    // Build the complete headers for the request using dynamic domain
    const originUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Get client hints to make fetch look more like browser navigation
    const clientHints = getClientHintHeaders();

    const requestHeaders = {
      'Cookie': cookieString,
      'User-Agent': navigator.userAgent,
      // Client hints - makes fetch look more like real browser requests
      ...clientHints,
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

    debugLog('📋 VINTED LISTING: Request headers include client hints:', Object.keys(clientHints));

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

    // ========================================================================
    // IMAGE UPLOAD IN EXTENSION - Upload images if image_sources provided
    // This ensures images are uploaded with the SAME session as listing creation
    // ========================================================================
    const imageSources = payload?.item?.image_sources || payload?.body?.item?.image_sources;
    const distortionLevel = payload?.item?.distortion_level || payload?.body?.item?.distortion_level || 'unchanged';

    if (imageSources && Array.isArray(imageSources) && imageSources.length > 0) {
      debugLog(`📸 VINTED LISTING: Found ${imageSources.length} image sources - uploading in extension`);

      // Send telemetry for image upload start
      sendTelemetry('extension_image_upload_started', {
        fid: fid,
        vid: vid,
        image_count: imageSources.length,
        distortion_level: distortionLevel
      }, uid);

      // Broadcast progress to user
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_uploading_images',
        vid: vid,
        fid: fid,
        message: `Uploading ${imageSources.length} images...`,
        status: 'pending'
      });

      const csrfToken = headers?.csrf_token || requestHeaders['X-CSRF-token'];
      const anonId = headers?.anon_id || requestHeaders['X-Anon-Id'];

      const uploadResult = await uploadVintedPhotos(
        imageSources,
        baseUrl,
        cookieString,
        csrfToken,
        anonId,
        distortionLevel,
        uid
      );

      // Store for PHP callback
      request._imageUploadMeta = uploadResult.imagesMeta || [];
      request._imageAggregateMeta = uploadResult.aggregateMeta || null;

      if (!uploadResult.success) {
        debugLog('❌ VINTED LISTING: Image upload failed:', uploadResult.error);

        // Send telemetry for image upload failure WITH full metadata
        sendTelemetry('extension_image_upload_failed', {
          fid: fid,
          vid: vid,
          error: uploadResult.error,
          failed_index: uploadResult.failedIndex,
          // Include full metadata for pattern identification
          failed_image_meta: uploadResult.failedImageMeta,
          all_images_meta: uploadResult.imagesMeta,
          aggregate: {
            images_attempted: imageSources.length,
            images_uploaded_before_failure: uploadResult.failedIndex || 0,
            distortion_level: distortionLevel
          }
        }, uid);

        // Broadcast image error to user
        broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
          event: 'listing_error',
          vid: vid,
          fid: fid,
          message: 'Error uploading photo',
          status: 'error',
          details: uploadResult.error
        });

        throw new Error(`Image upload failed: ${uploadResult.error}`);
      }

      // Replace image_sources with uploaded assigned_photos in payload
      // Strip meta from assigned_photos for Vinted API (it doesn't expect it)
      const cleanAssignedPhotos = uploadResult.assignedPhotos.map(p => ({
        id: p.id,
        orientation: p.orientation || 0
      }));

      debugLog('✅ VINTED LISTING: Images uploaded, photo IDs:', cleanAssignedPhotos.map(p => p.id));

      // Handle both payload structures (item at root or nested in body)
      if (payload?.item) {
        payload.item.assigned_photos = cleanAssignedPhotos;
        delete payload.item.image_sources;
        delete payload.item.distortion_level;
      } else if (payload?.body?.item) {
        payload.body.item.assigned_photos = cleanAssignedPhotos;
        delete payload.body.item.image_sources;
        delete payload.body.item.distortion_level;
      }

      // Send telemetry for successful image upload WITH full metadata
      sendTelemetry('extension_image_upload_success', {
        fid: fid,
        vid: vid,
        photo_ids: cleanAssignedPhotos.map(p => p.id),
        distortion_level: distortionLevel,
        // Include aggregate metadata for pattern identification
        aggregate: uploadResult.aggregateMeta,
        // Include individual image metadata
        images_meta: uploadResult.imagesMeta?.map(m => ({
          index: m.image_index,
          original_size_kb: m.original_size_kb,
          upload_size_kb: m.upload_size_kb,
          original_dimensions: `${m.original_width || '?'}x${m.original_height || '?'}`,
          mime_type: m.original_mime_type,
          upload_duration_ms: m.upload_duration_ms,
          vinted_photo_id: m.vinted_photo_id
        }))
      }, uid);

      // Broadcast images uploaded
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_images_uploaded',
        vid: vid,
        fid: fid,
        message: 'Images uploaded, creating listing...',
        status: 'pending'
      });
    }

    debugLog('📡 VINTED LISTING: Making request to:', endpoint);
    debugLog('📦 VINTED LISTING: Payload size:', JSON.stringify(payload).length, 'chars');

    // Send telemetry before API call - helps identify if we fail during the fetch
    sendTelemetry('listing_api_call_started', {
      fid: fid,
      vid: vid,
      endpoint: endpoint,
      payload_size: JSON.stringify(payload).length,
      time_since_request: Date.now() - listingStartTime
    }, uid);
    
    // Broadcast progress to user
    broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
      event: 'listing_uploading',
      vid: vid,
      fid: fid,
      message: 'Uploading to Vinted...',
      status: 'pending'
    });

    // Make the actual request to Vinted
    let response;
    try {
      response = await fetch(endpoint, {
        method: method || 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        redirect: 'manual'
      });
    } catch (fetchError) {
      // Network-level error (DNS, connection refused, CORS, etc.)
      sendTelemetry('listing_fetch_error', {
        fid: fid,
        vid: vid,
        error: fetchError.message,
        error_type: fetchError.name,
        time_since_request: Date.now() - listingStartTime
      }, uid);
      
      // Broadcast connection error to user
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_error',
        vid: vid,
        fid: fid,
        message: 'Connection issue',
        status: 'error',
        details: 'Could not connect to Vinted. Please check your internet connection and try again.'
      });
      
      throw fetchError;
    }

    debugLog('📡 VINTED LISTING: Response status:', response.status);
    
    // Send telemetry for response received
    sendTelemetry('listing_api_response', {
      fid: fid,
      vid: vid,
      status: response.status,
      time_since_request: Date.now() - listingStartTime
    }, uid);

        const responseData = await response.json();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2ae7c98f-f398-47b3-80a8-fdb88173d4b9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FLUF Chrome Extension/background.js:XXXX',message:'Vinted listing creation response',data:{responseData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
        // #endregion

    if (response.ok && responseData.item && responseData.item.id) {
      debugLog('✅ VINTED LISTING: Success! Item ID:', responseData.item.id);

      // Send telemetry for successful listing
      sendTelemetry('listing_success', {
        fid: fid,
        vid: vid,
        item_id: responseData.item.id,
        source: source || 'manual'
      }, uid);
      
      // Broadcast success to frontend Extension Status Panel
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_success',
        vid: vid,
        fid: fid,
        item_id: responseData.item.id,
        message: 'Listed on Vinted!',
        status: 'success',
        details: 'Your item is now live on Vinted'
      });

      // Send success callback to WordPress (with image metadata for diagnostics)
      const callbackResult = await sendVintedCallbackToWordPress({
        success: true,
        item_id: responseData.item.id,
        fid: fid,
        vid: vid,
        uid: uid,
        source: source || 'manual', // Pass source (manual, autolist, relist) for relisting tracking
        // Include image upload metadata for PHP logging/diagnostics
        image_upload_meta: request._imageUploadMeta || null,
        image_aggregate_meta: request._imageAggregateMeta || null
      });

      // DUPLICATE PREVENTION: Log successful listing to prevent duplicates within 24 hours
      try {
        const storage = await chrome.storage.local.get(['vinted_successful_listings']);
        const successfulListings = storage.vinted_successful_listings || {};
        
        const listingKey = `${uid}_${vid}`;
        successfulListings[listingKey] = {
          item_id: responseData.item.id,
          item_url: `${originUrl}/items/${responseData.item.id}`,
          timestamp: Date.now(),
          fid: fid,
          vid: vid,
          uid: uid
        };
        
        // Clean up entries older than 48 hours to prevent storage bloat
        const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
        Object.keys(successfulListings).forEach(key => {
          if (successfulListings[key].timestamp < twoDaysAgo) {
            delete successfulListings[key];
          }
        });
        
        await chrome.storage.local.set({ vinted_successful_listings: successfulListings });
        debugLog(`💾 DUPLICATE PREVENTION: Logged successful listing ${listingKey} (${Object.keys(successfulListings).length} total cached)`);
      } catch (storageError) {
        debugLog('⚠️ Error logging successful listing:', storageError);
        // Continue anyway - don't fail the listing on storage errors
      }

      return {
        success: true,
        item_id: responseData.item.id,
        item_url: `${originUrl}/items/${responseData.item.id}`,
        channel: 'vinted'
      };
    } else {
      debugLog('❌ VINTED LISTING: Failed with response:', responseData);

      // ========================================================================
      // ERROR 106 RETRY LOGIC - Attempt re-authentication for auth errors
      // ========================================================================
      const errorCode106 = responseData?.code || responseData?.error?.code;

      if (isRetryableAuthError(responseData, response.status) && retryAttempt < MAX_AUTH_RETRY_ATTEMPTS) {
        debugLog(`🔄 VINTED LISTING: Auth error detected (code ${errorCode106}), attempting re-authentication...`);

        // Send telemetry for retry attempt
        sendTelemetry('listing_auth_retry_started', {
          fid: fid,
          vid: vid,
          error_code: errorCode106,
          http_status: response.status,
          retry_attempt: retryAttempt + 1,
          original_error: responseData?.message || 'Auth error'
        }, uid);

        // Broadcast to user that we're refreshing
        broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
          event: 'listing_reauthenticating',
          vid: vid,
          fid: fid,
          message: 'Session expired, refreshing...',
          status: 'pending'
        });

        try {
          // Force fresh cookie extraction (bypass rate limits for retry)
          debugLog('🔄 VINTED LISTING: Forcing fresh cookie extraction...');
          const freshCookieResult = await getVintedCookiesWithDevTools(baseUrl, true); // isManualTrigger=true bypasses rate limits

          if (freshCookieResult.success && freshCookieResult.cookieString) {
            debugLog('✅ VINTED LISTING: Re-authentication successful, retrying listing...');

            // Send telemetry for successful re-auth
            sendTelemetry('listing_auth_refresh_success', {
              fid: fid,
              vid: vid,
              cookie_count: freshCookieResult.totalCookies || 0
            }, uid);

            // Persist fresh cookies to FC backend (fire-and-forget, don't block retry)
            if (freshCookieResult.cookies && freshCookieResult.cookies.length > 0) {
              sendVintedCookiesToFC(freshCookieResult.cookies, uid, baseUrl)
                .then(success => {
                  if (success) {
                    debugLog('✅ VINTED LISTING: Fresh cookies persisted to FC backend during retry');
                  } else {
                    debugLog('⚠️ VINTED LISTING: Failed to persist fresh cookies to FC (non-blocking)');
                  }
                })
                .catch(err => {
                  debugLog('⚠️ VINTED LISTING: Error persisting fresh cookies to FC:', err.message);
                });
            }

            // Small delay before retry to let session stabilize
            await new Promise(resolve => setTimeout(resolve, AUTH_RETRY_DELAY_MS));

            // Update request with fresh cookies for retry
            request.cookies = freshCookieResult.cookieString;

            // Broadcast retry starting
            broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
              event: 'listing_retrying',
              vid: vid,
              fid: fid,
              message: 'Session refreshed, retrying...',
              status: 'pending'
            });

            // Recursive retry with incremented attempt counter
            return handleVintedListingCreation(request, retryAttempt + 1);
          } else {
            debugLog('❌ VINTED LISTING: Re-authentication failed:', freshCookieResult.message);

            sendTelemetry('listing_auth_refresh_failed', {
              fid: fid,
              vid: vid,
              reason: freshCookieResult.message || 'Cookie extraction failed',
              has_cookies: !!freshCookieResult.cookies
            }, uid);
          }
        } catch (reAuthError) {
          debugLog('❌ VINTED LISTING: Re-authentication error:', reAuthError);

          sendTelemetry('listing_auth_refresh_error', {
            fid: fid,
            vid: vid,
            error: reAuthError.message
          }, uid);
        }

        // If re-auth failed, fall through to normal error handling
        debugLog('⚠️ VINTED LISTING: Re-authentication failed, proceeding with error handling');
      }
      // ========================================================================
      // END ERROR 106 RETRY LOGIC
      // ========================================================================

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

      // Send telemetry for listing error
      sendTelemetry('listing_error', {
        fid: fid,
        vid: vid,
        error: errorMessage,
        error_code: responseData.code || null,
        response_status: response.status,
        source: source || 'manual'
      }, uid);
      
      if (responseData.code) errorCode = responseData.code;
      
      // Determine user-friendly message based on error type
      let userFriendlyMessage = 'Could not list item';
      let userFriendlyDetails = errorMessage;
      
      // Enhance 2FA error message with guidance and link
      if (errorCode === 146 || errorMessage.toLowerCase().includes('two factor') || responseData.message_code === 'entity_2fa_required') {
        const vintedItemsNewUrl = `${originUrl}/items/new`;
        userFriendlyMessage = 'Verification required';
        userFriendlyDetails = 'Vinted requires 2FA verification. Please create one listing manually on Vinted to complete verification, then try again.';
        errorMessage = `Required two factor authentication. Please manually create 1 listing at ${vintedItemsNewUrl} to receive and enter your 2FA code. After completing 2FA once, you should be able to list automatically.`;
        debugLog('🔐 2FA Error detected - enhanced with guidance and link:', vintedItemsNewUrl);
      }
      // Enhance auth-related error messages
      else if (errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('session') || errorMessage.toLowerCase().includes('token')) {
        const vintedItemsNewUrl = `${originUrl}/items/new`;
        userFriendlyMessage = 'Session expired';
        userFriendlyDetails = 'Please log into Vinted and click the FLUF extension to refresh your session.';
        if (!errorMessage.includes(vintedItemsNewUrl)) {
          errorMessage = `${errorMessage} Please visit ${vintedItemsNewUrl} to refresh your Vinted session.`;
          debugLog('🔐 Auth Error detected - enhanced with link:', vintedItemsNewUrl);
        }
      }
      // Picture/image errors
      else if (errorMessage.toLowerCase().includes('picture') || errorMessage.toLowerCase().includes('image') || errorMessage.toLowerCase().includes('photo')) {
        userFriendlyMessage = 'Image issue';
        userFriendlyDetails = 'There was a problem with the listing images. Please check your photos and try again.';
      }
      // Rate limiting
      else if (errorMessage.toLowerCase().includes('rate') || errorMessage.toLowerCase().includes('too many') || errorMessage.toLowerCase().includes('slow down')) {
        userFriendlyMessage = 'Please wait';
        userFriendlyDetails = 'Vinted is rate limiting requests. Your listing will retry automatically in a few minutes.';
      }
      
      // Broadcast error to frontend Extension Status Panel
      broadcastToFlufTabs('VINTED_LISTING_PROGRESS', {
        event: 'listing_error',
        vid: vid,
        fid: fid,
        message: userFriendlyMessage,
        status: 'error',
        details: userFriendlyDetails
      });

      // Send error callback to WordPress (with image metadata for diagnostics)
      await sendVintedCallbackToWordPress({
        success: false,
        location: 'else',
        error: errorMessage,
        error_code: errorCode,
        fid: fid,
        vid: vid,
        uid: uid,
        source: source || 'manual',
        response: responseData,
        body: payload,
        // Include image upload metadata for PHP logging/diagnostics
        image_upload_meta: request._imageUploadMeta || null,
        image_aggregate_meta: request._imageAggregateMeta || null
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

    // Send error callback to WordPress (with image metadata for diagnostics)
    await sendVintedCallbackToWordPress({
      success: false,
      location: 'try-catch',
      error: error.message,
      fid: fid,
      vid: vid,
      uid: uid,
      source: source || 'manual',
      body: payload,
      // Include image upload metadata for PHP logging/diagnostics
      image_upload_meta: request._imageUploadMeta || null,
      image_aggregate_meta: request._imageAggregateMeta || null
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
    'http://localhost:10008/wp-json/fc/listings/v1/vinted-extension-callback',
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
    
    // Send telemetry for missing userIdentifier (critical issue)
    sendTelemetry('vinted_auth_missing_user_identifier', {
      channel: channel,
      base_url: baseUrl || sourceUrl,
      has_cookies: channel === 'vinted' ? !!fullCookies : false,
      has_access_token: channel === 'depop' ? !!accessToken : false
    }, null);
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

        // Store user ID from successful response for popup access
        const responseData = successfulResults[0].data;

        // CRITICAL: Only consider it a true success if backend confirms cookies were saved
        // Backend returns {success: true, user_id: X} when cookies are actually persisted
        // HTTP 200 alone doesn't guarantee save - must verify response content
        const backendConfirmedSave = responseData && responseData.success === true && responseData.user_id;

        if (responseData && responseData.user_id) {
          chrome.storage.local.set({ 'FCU_userId': responseData.user_id });
          debugLog('📱 POPUP: Stored user ID for popup:', responseData.user_id);
        }

        // Detect if this is a token refresh (check if we previously had tokens for this user)
        const storageKey = `last_${channel}_auth_success_${userIdentifier || 'unknown'}`;
        chrome.storage.local.get([storageKey], async (stored) => {
          const lastSuccessTime = stored[storageKey];
          const now = Date.now();
          const isTokenRefresh = lastSuccessTime && (now - lastSuccessTime) < (30 * 24 * 60 * 60 * 1000); // Within 30 days

          if (backendConfirmedSave) {
            // Store current success timestamp only if backend confirmed save
            chrome.storage.local.set({ [storageKey]: now });

            // Send telemetry for successful API submission (backend confirmed save)
            await sendTelemetry('vinted_auth_api_success', {
              channel: channel,
              user_identifier: userIdentifier || null,
              base_url: baseUrl || sourceUrl,
              endpoints_tried: results.length,
              endpoints_succeeded: successfulResults.length,
              is_token_refresh: isTokenRefresh,
              time_since_last_auth_ms: lastSuccessTime ? (now - lastSuccessTime) : null,
              backend_confirmed_user_id: responseData.user_id
            }, userIdentifier || null);

            // Send specific token refresh event if this is a refresh
            if (isTokenRefresh && channel === 'vinted') {
              await sendTelemetry('vinted_token_refresh', {
                user_identifier: userIdentifier || null,
                base_url: baseUrl || sourceUrl,
                time_since_last_auth_ms: now - lastSuccessTime,
                time_since_last_auth_minutes: Math.round((now - lastSuccessTime) / (60 * 1000))
              }, userIdentifier || null);
            }
          } else {
            // HTTP 200 received but backend didn't confirm save - log partial failure
            debugLog('⚠️ HTTP 200 but backend did not confirm cookie save:', responseData);
            await sendTelemetry('vinted_auth_api_partial_failure', {
              channel: channel,
              user_identifier: userIdentifier || null,
              base_url: baseUrl || sourceUrl,
              endpoints_tried: results.length,
              response_success: responseData?.success,
              response_has_user_id: !!responseData?.user_id,
              reason: !responseData ? 'empty_response' :
                      responseData.success !== true ? 'success_not_true' :
                      !responseData.user_id ? 'missing_user_id' : 'unknown'
            }, userIdentifier || null);
          }
        });
        
        // Broadcast auth success to frontend Extension Status Panel
        if (channel === 'vinted') {
          broadcastToFlufTabs('FLUF_EXTENSION_STATUS_UPDATE', {
            event: 'auth_success',
            channel: 'vinted',
            message: 'Vinted authentication successful'
          });
        }

        if (sendResponse) {
          sendResponse({
            success: true,
            data: successfulResults[0].data, // Return data from first successful response
            channel: channel,
            results: results // Include all results for debugging
          });
        }
      } else {
        // Send telemetry for API submission failure
        sendTelemetry('vinted_auth_api_failed', {
          channel: channel,
          user_identifier: userIdentifier || null,
          base_url: baseUrl || sourceUrl,
          endpoints_tried: results.length,
          errors: failedResults.map(r => r.error)
        }, userIdentifier || null);

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