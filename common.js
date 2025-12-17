// Common utilities shared between desktop and mobile
const CoryPortfolio = {
    // Helper for mobile check - uses ontouchstart as the ONLY differentiator
    isMobileDeviceCheck: function () {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    },

    // Initialize the correct app script based on device
    initApp: function () {
        const script = document.createElement('script');
        script.src = this.isMobileDeviceCheck() ? 'mobile-app.js' : 'app.js';
        document.body.appendChild(script);
    }
};
// Stylesheet is now loaded directly in index.html via inline script to prevent race conditions
