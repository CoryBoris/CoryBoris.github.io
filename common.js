// Common utilities shared between desktop and mobile
const CoryPortfolio = {
    // Helper for mobile check
    isMobileDeviceCheck: function () {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    },

    // Initialize the correct stylesheet based on device
    initStylesheet: function () {
        if (this.isMobileDeviceCheck()) {
            // Swap to mobile stylesheet
            const link = document.getElementById('main-stylesheet');
            if (link) {
                link.href = 'mobile.css';
            }
        }
        // Desktop CSS is already loaded in head
    },

    // Initialize the correct app script based on device
    initApp: function () {
        const script = document.createElement('script');
        script.src = this.isMobileDeviceCheck() ? 'mobile-app.js' : 'app.js';
        document.body.appendChild(script);
    }
};

// Auto-initialize on load
CoryPortfolio.initStylesheet();
