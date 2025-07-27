window.addEventListener('message', function(event) {
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
        // Try to get user identifier from cookie first
        function getCookie(name) {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        }
        
        const userIdentifierFromCookie = getCookie('fc_user_identifier');
        const userIdentifier = userIdentifierFromCookie || payload.userIdentifier || '';
        const channel = payload.channel || 'depop'; // Default to depop for backward compatibility
        
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
