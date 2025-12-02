// Content script for FLUF Chrome Extension
// Handles communication between web pages and the extension

console.log('FLUF Chrome Extension content script loaded');

// Set extension presence indicator on page load
if (typeof chrome !== 'undefined' && chrome.runtime) {
    document.documentElement.setAttribute('data-fluf-extension', 'installed');
    let extVersion = chrome.runtime.getManifest()?.version || 'unknown';
    document.documentElement.setAttribute('data-fluf-extension-version', extVersion);
    console.log('🔍 FLUF Extension: Set data-fluf-extension attribute, version:', extVersion);
}

// Dispatch event to notify that extension is ready
window.dispatchEvent(new CustomEvent('flufExtensionReady', { 
    detail: { version: chrome.runtime?.getManifest()?.version || 'unknown', installed: true } 
}));

// Listen for messages from the web page
window.addEventListener('message', async function(event) {
    // Only accept messages from trusted origins
    const trustedOrigins = [
        'http://localhost:10006',
        'http://localhost:*',
        'http://fluf.local',
        'https://fluf.io'
    ];
    
    if (!trustedOrigins.includes(event.origin) && event.origin !== window.location.origin) {
        console.log('🔒 Rejected message from untrusted origin:', event.origin);
        return;
    }

    const { type } = event.data;
    const payload = event.data.payload || event.data.data || {};

    // Vinted Listing Creation - RESTORED from old version
    if (type === 'FCU_VINTED_CREATE_LISTING') {
        console.log('📨 Content script received Vinted listing request from page');
        
        // Forward to background script
        chrome.runtime.sendMessage({
            action: 'FCU_VINTED_CREATE_LISTING',
            ...payload
        }, (response) => {
            console.log('📨 Content script received response from background:', response);
            
            // Send response back to the page
            window.postMessage({
                type: 'FCU_VINTED_CREATE_LISTING_RESPONSE',
                data: response
            }, event.origin);
        });
    }
    // Extension Status Check - supports both new descriptive names and legacy names
    else if (type === 'FLUF_EXTENSION_STATUS_CHECK' || type === 'FCU_CHECK_DEPOP_EXTENSION' || type === 'FCU_CHECK_EXTENSION') {
        console.log('🔍 Extension status check received:', type);
        
        // Check if chrome.runtime is available
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            console.log('🔍 Chrome runtime available, sending positive response');
            
            chrome.runtime.sendMessage({ action: 'checkExtension' }, function(response) {
                console.log('🔍 Background script response:', response);
                
                // Send response with both new and legacy message types for compatibility
                const successResponse = {
                    installed: true,
                    version: chrome.runtime.getManifest()?.version || 'unknown',
                    // Legacy compatibility fields
                    legacy_types: ['FCU_DEPOP_EXTENSION_STATUS', 'FCU_CHECK_EXTENSION_RESPONSE']
                };
                
                console.log('🔍 Sending FLUF_EXTENSION_STATUS_RESPONSE:', successResponse);
                window.postMessage({
                    type: 'FLUF_EXTENSION_STATUS_RESPONSE',
                    ...successResponse
                }, '*');
                
                // Also send legacy message types for backward compatibility
                console.log('🔍 Sending legacy FCU_DEPOP_EXTENSION_STATUS');
                window.postMessage({
                    type: 'FCU_DEPOP_EXTENSION_STATUS',
                    installed: true,
                    data: { installed: true }
                }, '*');
                
                console.log('🔍 Sending legacy FCU_CHECK_EXTENSION_RESPONSE');
                window.postMessage({
                    type: 'FCU_CHECK_EXTENSION_RESPONSE',
                    installed: true,
                    data: { installed: true }
                }, '*');
            });
        } else {
            console.error('🔍 Chrome extension runtime not available');
            
            // Send error response with both new and legacy message types
            const errorResponse = {
                installed: false,
                error: 'Chrome extension runtime not available'
            };
            
            console.log('🔍 Sending error responses:', errorResponse);
            window.postMessage({ type: 'FLUF_EXTENSION_STATUS_RESPONSE', ...errorResponse }, '*');
            window.postMessage({ type: 'FCU_DEPOP_EXTENSION_STATUS', ...errorResponse }, '*');
            window.postMessage({ type: 'FCU_CHECK_EXTENSION_RESPONSE', ...errorResponse }, '*');
        }
    }
    
    // Vinted coordination status check
    else if (type === 'FCU_GET_VINTED_COORDINATION_STATUS') {
        console.log('🔔 Vinted coordination status check requested');
        
        try {
            chrome.runtime.sendMessage({
                action: 'FCU_getVintedCoordinationStatus'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('🔔 Extension context error:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'FCU_VINTED_COORDINATION_STATUS_RESPONSE',
                        data: { error: 'Extension context invalidated' }
                    }, '*');
                } else {
                    console.log('🔔 Coordination status response:', response);
                    window.postMessage({
                        type: 'FCU_VINTED_COORDINATION_STATUS_RESPONSE',
                        data: response
                    }, '*');
                }
            });
        } catch (error) {
            console.error('🔔 Error requesting coordination status:', error);
            window.postMessage({
                type: 'FCU_VINTED_COORDINATION_STATUS_RESPONSE',
                data: { error: error.message }
            }, '*');
        }
    }
    
    // Close duplicate Vinted tabs
    else if (type === 'FCU_CLOSE_DUPLICATE_VINTED_TABS') {
        console.log('🧹 Duplicate Vinted tabs cleanup requested');
        
        try {
            chrome.runtime.sendMessage({
                action: 'FCU_CLOSE_DUPLICATE_VINTED_TABS'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('🧹 Extension context error:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'FCU_CLOSE_DUPLICATE_VINTED_TABS_RESPONSE',
                        data: { success: false, error: 'Extension context invalidated' }
                    }, '*');
                } else {
                    console.log('🧹 Cleanup response:', response);
                    window.postMessage({
                        type: 'FCU_CLOSE_DUPLICATE_VINTED_TABS_RESPONSE',
                        data: response
                    }, '*');
                }
            });
        } catch (error) {
            console.error('🧹 Error requesting cleanup:', error);
            window.postMessage({
                type: 'FCU_CLOSE_DUPLICATE_VINTED_TABS_RESPONSE',
                data: { success: false, error: error.message }
            }, '*');
        }
    }
    
    // Debug mode toggle from web app
    else if (type === 'FLUF_DEBUG_MODE_SET') {
        console.log('🔧 Debug mode toggle requested from web app:', payload.enabled);
        
        try {
            chrome.runtime.sendMessage({
                action: 'setDebugMode',
                enabled: payload.enabled
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('🔧 Extension context error:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'FLUF_DEBUG_MODE_SET_RESPONSE',
                        success: false,
                        error: 'Extension context invalidated',
                        debugEnabled: false
                    }, '*');
                } else {
                    console.log('🔧 Debug mode response from background:', response);
                    window.postMessage({
                        type: 'FLUF_DEBUG_MODE_SET_RESPONSE',
                        success: response?.success !== false,
                        debugEnabled: response?.debugEnabled !== undefined ? response.debugEnabled : payload.enabled,
                        error: response?.error || null
                    }, '*');
                }
            });
        } catch (error) {
            console.error('🔧 Error setting debug mode:', error);
            window.postMessage({
                type: 'FLUF_DEBUG_MODE_SET_RESPONSE',
                success: false,
                error: error.message,
                debugEnabled: false
            }, '*');
        }
    }


    // Marketplace Authentication - supports both new descriptive names and legacy names
    if (type === 'FLUF_MARKETPLACE_AUTH_REQUEST' || type === 'FCU_TRIGGER_DEPOP_AUTH' || type === 'FCU_GET_DEPOP_SESSION' || type === 'FCU_GET_VINTED_SESSION') {
        console.log('🔐 Marketplace auth request received:', type);
        console.log('🔐 Full event.data:', event.data);
        console.log('🔐 Payload:', payload);
        
        // Determine channel from message type or payload
        let channel = 'depop'; // Default to depop for backward compatibility
        
        // Check message type first for channel detection
        if (type === 'FCU_GET_VINTED_SESSION') {
            channel = 'vinted';
        } else if (type === 'FCU_GET_DEPOP_SESSION') {
            channel = 'depop';
        }
        
        // Override with payload channel if available
        if (payload && payload.channel) {
            channel = payload.channel;
        }
        
        console.log('🔐 Channel determined:', channel, 'from type:', type, 'payload channel:', payload?.channel);
        // Try to get user identifier from multiple sources
        function getCookie(name) {
            try {
                const value = `; ${document.cookie}`;
                const parts = value.split(`; ${name}=`);
                if (parts.length === 2) {
                    const cookieValue = parts.pop().split(';').shift();
                    console.log(`Cookie '${name}' found:`, cookieValue ? '[PRESENT]' : '[EMPTY]');
                    return cookieValue;
                }
                console.log(`Cookie '${name}' not found in:`, document.cookie.substring(0, 100) + '...');
                return null;
            } catch (error) {
                console.error('Error reading cookie:', error);
                return null;
            }
        }
        
        function getUserIdentifierFromDOM() {
            // Try to get from hidden DOM element
            const element = document.getElementById('fc-user-identifier');
            if (element) {
                return element.getAttribute('data-user-id') || element.textContent;
            }
            
            // Try to get from window variables
            if (window._currentUserID) {
                return window._currentUserID.toString();
            }
            if (window._userIdentifier) {
                return window._userIdentifier.toString();
            }
            
            return null;
        }
        
        const userIdentifierFromCookie = getCookie('fc_user_identifier');
        const userIdentifierFromDOM = getUserIdentifierFromDOM();
        const userIdentifier = userIdentifierFromCookie || userIdentifierFromDOM || payload.userIdentifier || payload?.data?.userIdentifier || '';
        
        console.log('🔍 USER IDENTIFIER DETECTION:');
        console.log(' - From cookie:', userIdentifierFromCookie ? `[FOUND: ${userIdentifierFromCookie}]` : '[NOT FOUND]');
        console.log(' - From DOM:', userIdentifierFromDOM ? `[FOUND: ${userIdentifierFromDOM}]` : '[NOT FOUND]'); 
        console.log(' - From payload.userIdentifier:', payload.userIdentifier ? `[FOUND: ${payload.userIdentifier}]` : '[NOT FOUND]');
        console.log(' - From payload.data.userIdentifier:', payload?.data?.userIdentifier ? `[FOUND: ${payload?.data?.userIdentifier}]` : '[NOT FOUND]');
        console.log(' - Final choice:', userIdentifier || '[NONE]');
        console.log(' - Final userIdentifier value being sent:', userIdentifier);
        
        // Validate we're on a FLUF domain for cookie reading
        const isFlufDomain = window.location.hostname === 'fluf.io' || 
                            window.location.hostname === 'fluf.local' || 
                            window.location.hostname === 'localhost';
        
        console.log('Current domain:', window.location.hostname);
        console.log('Is FLUF domain:', isFlufDomain);
        
        if (!isFlufDomain && !userIdentifierFromCookie) {
            console.warn('⚠️ Attempting to read fc_user_identifier cookie from non-FLUF domain. Cookie may not be available.');
        }
        
        console.log('User identifier from cookie:', userIdentifierFromCookie);
        console.log('User identifier from payload.userIdentifier:', payload.userIdentifier);
        console.log('User identifier from payload.data.userIdentifier:', payload?.data?.userIdentifier);
        console.log('Final user identifier:', userIdentifier);
        console.log('Channel:', channel);
        console.log('Source URL:', payload.sourceUrl || payload?.data?.sourceUrl || window.location.origin);
        
        // Check if chrome.runtime is available before sending message
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    action: 'FCU_getTokenViaContentScript',
                    sourceUrl: payload.sourceUrl || payload?.data?.sourceUrl || window.location.origin,
                    userIdentifier: userIdentifier,
                    channel: channel,
                    base_url: payload.base_url || payload?.data?.base_url,
                    country: payload.country || payload?.data?.country
                }, function(response) {
                    // Check for chrome.runtime.lastError (context invalidation)
                    if (chrome.runtime.lastError) {
                        console.error('🔐 Chrome runtime error:', chrome.runtime.lastError.message);
                        
                        const errorResponse = {
                            success: false,
                            error: 'Extension context invalidated. Please refresh the page and try again.',
                            channel: channel,
                            userIdentifier: userIdentifier
                        };
                        
                        // Send error responses
                        window.postMessage({
                            type: 'FLUF_MARKETPLACE_AUTH_RESPONSE',
                            ...errorResponse
                        }, '*');
                        
                        window.postMessage({
                            type: 'FCU_DEPOP_AUTH_RESULT',
                            ...errorResponse
                        }, '*');
                        
                        if (channel === 'depop') {
                            window.postMessage({
                                type: 'FCU_GET_DEPOP_SESSION_RESPONSE',
                                data: errorResponse
                            }, '*');
                        } else if (channel === 'vinted') {
                            window.postMessage({
                                type: 'FCU_GET_VINTED_SESSION_RESPONSE',
                                data: errorResponse
                            }, '*');
                        }
                        return;
                    }
                    
                    // Send new standardized response
                    const authResponse = {
                        success: response?.success,
                        error: response?.error,
                        message: response?.message,
                        channel: channel,
                        userIdentifier: userIdentifier
                    };
                    
                    console.log('🔐 Sending auth response to page:', authResponse);
                    
                    window.postMessage({
                        type: 'FLUF_MARKETPLACE_AUTH_RESPONSE',
                        ...authResponse
                    }, '*');
                    
                    // Send legacy response types for backward compatibility
                    window.postMessage({
                        type: 'FCU_DEPOP_AUTH_RESULT',
                        ...authResponse
                    }, '*');
                    
                    // Send specific legacy responses based on channel
                    if (channel === 'depop') {
                        window.postMessage({
                            type: 'FCU_GET_DEPOP_SESSION_RESPONSE',
                            data: authResponse
                        }, '*');
                    } else if (channel === 'vinted') {
                        window.postMessage({
                            type: 'FCU_GET_VINTED_SESSION_RESPONSE',
                            data: authResponse
                        }, '*');
                    }
                });
            } catch (error) {
                console.error('🔐 Error sending message to background script:', error);
                
                const errorResponse = {
                    success: false,
                    error: error.message.includes('Extension context invalidated') 
                        ? 'Extension context invalidated. Please refresh the page and try again.'
                        : 'Failed to communicate with extension',
                    channel: channel,
                    userIdentifier: userIdentifier
                };
                
                // Send error responses
                window.postMessage({
                    type: 'FLUF_MARKETPLACE_AUTH_RESPONSE',
                    ...errorResponse
                }, '*');
                
                window.postMessage({
                    type: 'FCU_DEPOP_AUTH_RESULT',
                    ...errorResponse
                }, '*');
                
                if (channel === 'depop') {
                    window.postMessage({
                        type: 'FCU_GET_DEPOP_SESSION_RESPONSE',
                        data: errorResponse
                    }, '*');
                } else if (channel === 'vinted') {
                    window.postMessage({
                        type: 'FCU_GET_VINTED_SESSION_RESPONSE',
                        data: errorResponse
                    }, '*');
                }
            }
        } else {
            console.error('Chrome extension runtime not available for marketplace auth');
            
            const errorResponse = {
                success: false,
                error: 'Chrome extension runtime not available',
                channel: channel,
                userIdentifier: userIdentifier
            };
            
            // Send new standardized error response
            window.postMessage({
                type: 'FLUF_MARKETPLACE_AUTH_RESPONSE',
                ...errorResponse
            }, '*');
            
            // Send legacy error responses for backward compatibility
            window.postMessage({
                type: 'FCU_DEPOP_AUTH_RESULT',
                ...errorResponse
            }, '*');
            
            // Send specific legacy error responses based on channel
            if (channel === 'depop') {
                window.postMessage({
                    type: 'FCU_GET_DEPOP_SESSION_RESPONSE',
                    data: errorResponse
                }, '*');
            } else if (channel === 'vinted') {
                window.postMessage({
                    type: 'FCU_GET_VINTED_SESSION_RESPONSE',
                    data: errorResponse
                }, '*');
            }
        }
    }


});

// Listen for messages from the background script
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log('Content script received message from background:', request);
        
        if (request.type === 'VINTED_AUTH_RESTORED') {
            console.log('✅ Vinted authentication restored - updating connection state');
            // Notify the frontend that Vinted auth is restored
            window.postMessage({
                type: 'VINTED_AUTH_RESTORED',
                userIdentifier: request.userIdentifier
            }, '*');
            sendResponse({success: true});
        }
        
        // Forward extension status updates to the page for the Extension Status Panel
        if (request.type === 'FLUF_EXTENSION_STATUS_UPDATE') {
            console.log('📊 Extension status update:', request);
            window.postMessage({
                type: 'FLUF_EXTENSION_STATUS_UPDATE',
                data: request.data
            }, '*');
            sendResponse({success: true});
        }
        
        // Forward listing progress updates
        if (request.type === 'VINTED_LISTING_PROGRESS') {
            console.log('📦 Vinted listing progress:', request);
            window.postMessage({
                type: 'VINTED_LISTING_PROGRESS',
                data: request.data
            }, '*');
            sendResponse({success: true});
        }
        
        // Forward queue status updates
        if (request.type === 'VINTED_QUEUE_UPDATE') {
            console.log('📋 Vinted queue update:', request);
            window.postMessage({
                type: 'VINTED_QUEUE_UPDATE',
                data: request.data
            }, '*');
            sendResponse({success: true});
        }
    });
}

// Listen for API calls from the page via custom events - RESTORED from old version
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
            response = { installed: true, version: chrome.runtime?.getManifest()?.version || 'unknown' };
            break;
            
        case 'getVintedSession':
            try {
                response = await chrome.runtime.sendMessage({
                    action: 'FCU_getTokenViaContentScript',
                    channel: 'vinted',
                    userIdentifier: data.userIdentifier,
                    base_url: data.base_url || 'https://www.vinted.co.uk/',
                    country: data.country || 'UK'
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
