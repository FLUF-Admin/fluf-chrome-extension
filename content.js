window.addEventListener('message', function(event) {
    debugger;
    // 🔐 Only accept messages from the same origin
    if (event.origin !== window.location.origin) return;

    const { type, payload } = event.data;

    if (type === 'FCU_CHECK_DEPOP_EXTENSION') {
        chrome.runtime.sendMessage({ action: 'checkExtension' }, function(response) {
            window.postMessage({
                type: 'FCU_DEPOP_EXTENSION_STATUS',
                installed: true
            }, '*');
        });
    }

    if (type === 'FCU_TRIGGER_DEPOP_AUTH') {
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
        const userIdentifier = userIdentifierFromCookie || userIdentifierFromDOM || payload.userIdentifier || '';
        const channel = payload.channel || 'depop'; // Default to depop for backward compatibility
        
        console.log('🔍 USER IDENTIFIER DETECTION:');
        console.log(' - From cookie:', userIdentifierFromCookie ? '[FOUND]' : '[NOT FOUND]');
        console.log(' - From DOM:', userIdentifierFromDOM ? '[FOUND]' : '[NOT FOUND]'); 
        console.log(' - From payload:', payload.userIdentifier ? '[FOUND]' : '[NOT FOUND]');
        console.log(' - Final choice:', userIdentifier || '[NONE]');
        
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
        console.log('User identifier from payload:', payload.userIdentifier);
        console.log('Final user identifier:', userIdentifier);
        console.log('Channel:', channel);
        console.log('Source URL:', payload.sourceUrl);
        
        chrome.runtime.sendMessage({
            action: 'FCU_getTokenViaContentScript',
            sourceUrl: payload.sourceUrl,
            userIdentifier: userIdentifier,
            channel: channel
        }, function(response) {
            window.postMessage({
                type: 'FCU_DEPOP_AUTH_RESULT',
                success: response?.success,
                error: response?.error,
                channel: channel
            }, '*');
        });
    }

    if (type === 'FCU_EXTRACT_DEPOP_TOKENS') {
        console.log('🟡 DEPOP CONTENT SCRIPT: Starting token extraction from page context');
        
        // Extract tokens from current page cookies
        function getCookie(name) {
            debugger;
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        }
        
        const accessToken = getCookie('access_token');
        const userId = getCookie('user_id');
        
        console.log('🍪 DEPOP COOKIES FOUND:');
        console.log(' - access_token:', accessToken ? '[PRESENT]' : '[MISSING]');
        console.log(' - user_id:', userId ? '[PRESENT]' : '[MISSING]');
        
        // Send results back to background script
        chrome.runtime.sendMessage({
            action: 'FCU_depopTokensExtracted',
            success: !!(accessToken && userId),
            accessToken: accessToken,
            userId: userId,
            sourceUrl: window.location.href
        });
    }
});
