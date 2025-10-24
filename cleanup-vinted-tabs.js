// Run this in the browser console on fluf.io to close duplicate Vinted tabs immediately
// This is a one-time cleanup script for the existing duplicate tabs

(function() {
    console.log('🧹 Initiating Vinted tab cleanup...');
    
    // Send message to extension to close duplicate tabs
    window.postMessage({
        type: 'FCU_CLOSE_DUPLICATE_VINTED_TABS'
    }, '*');
    
    // Listen for response
    window.addEventListener('message', function handler(event) {
        if (event.data.type === 'FCU_CLOSE_DUPLICATE_VINTED_TABS_RESPONSE') {
            console.log('🧹 Cleanup response:', event.data.data);
            
            if (event.data.data.success) {
                console.log('✅ Successfully cleaned up duplicate Vinted tabs!');
            } else {
                console.error('❌ Failed to cleanup tabs:', event.data.data.error);
            }
            
            // Remove listener after receiving response
            window.removeEventListener('message', handler);
        }
    });
    
    console.log('⏳ Waiting for cleanup to complete...');
})();

