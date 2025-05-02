// app/static/js/app.js
// Main application file - loads all modules

// Create a global application namespace
window.App = {
    // Core properties
    gridApi: null,
    columnDefs: [],
    columnVisibility: {},
    searchTerm: '',
    isDarkMode: false,
    uiHidden: false,
    activeFilters: [],
    lastChangeCheck: null,

    // Initialize the application
    init: function() {
        console.log('Initializing application');

        // Check for service worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    })
                    .catch(err => {
                        console.log('ServiceWorker registration failed: ', err);
                    });
            });
        }

        // Check for dark mode
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';

        // Check for hidden UI
        this.uiHidden = localStorage.getItem('bigtable_ui_hidden') === 'true';

        // Set up global variables for compatibility
        window.gridApi = null;
        window.columnDefs = [];
        window.columnVisibility = {};
        window.isDarkMode = this.isDarkMode;

        // Load modules
        this.loadModules();
    },

    // Load all required modules
    loadModules: function() {
        // Define modules to load
        const modules = [
            'core',
            'theme',
            'grid',
            'search',
            'filters',
            'saved-filters',
            'ui',
            'export',
            'events'
        ];

        let loadedCount = 0;
        const totalModules = modules.length;

        // Load each module
        modules.forEach(module => {
            const script = document.createElement('script');
            script.src = `/static/js/modules/${module}.js?v=${new Date().getTime()}`;

            script.onload = () => {
                loadedCount++;

                // Initialize the application once all modules are loaded
                if (loadedCount === totalModules) {
                    // Directly set up key functions for main app functionality
                    if (typeof window.initializeApp === 'function') {
                        window.initializeApp();
                    }

                    // Initialize enhanced filters
                    if (typeof window.enhancedFilters !== 'undefined') {
                        console.log('Enhanced filters module loaded');
                    }

                    // Initialize document templates
                    if (typeof window.DocumentGenerator !== 'undefined') {
                        console.log('Document generator module loaded');
                    }
                }
            };

            script.onerror = () => {
                console.error(`Failed to load module: ${module}`);
                loadedCount++;

                // Continue initialization even if some modules fail
                if (loadedCount === totalModules) {
                    if (typeof window.initializeApp === 'function') {
                        window.initializeApp();
                    }
                }
            };

            document.head.appendChild(script);
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.App.init();
});