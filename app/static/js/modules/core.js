// app/static/js/modules/core.js
// Core initialization and global variables

// Global state - make sure it's accessible
window.AppState = {
    gridApi: null,
    columnDefs: [],
    searchTerm: '',
    isDarkMode: false,
    activeFilters: [],
    nextFilterId: 2,
    columnVisibility: {},
    uiHidden: false,
    lastChangeCheck: null
};

// Initialize core functionality
function initializeApp() {
    console.log("Initializing application core");

    // Check system preferences for dark mode
    checkSystemDarkModePreference();

    // Load saved preferences
    loadSavedPreferences();

    // Set initial table container height
    if (typeof resizeTableContainer === 'function') {
        resizeTableContainer();
    }

    // Get columns first
    if (typeof getColumns === 'function') {
        getColumns();
    }

    // Set up dropdown toggles
    if (typeof setupDropdowns === 'function') {
        setupDropdowns();
    }

    // Set up event handlers
    if (typeof setupEventHandlers === 'function') {
        setupEventHandlers();
    }

    // Check for changes on initial load
    window.AppState.lastChangeCheck = new Date();
    window.AppState.lastChangeCheck.setMinutes(window.AppState.lastChangeCheck.getMinutes() - 30);

    setTimeout(function() {
        if (typeof checkForDatabaseChanges === 'function') {
            checkForDatabaseChanges();
        }
    }, 3000); // Check shortly after page loads

    // Set up periodic change checking
    if (typeof setupDataRefreshTimer === 'function') {
        setupDataRefreshTimer();
    }
}

// Load saved preferences (dark mode, UI state)
function loadSavedPreferences() {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        window.AppState.isDarkMode = true;
        window.isDarkMode = true;

        if (typeof updateTheme === 'function') {
            updateTheme();
        }
    }

    const savedUIState = localStorage.getItem('bigtable_ui_hidden');
    if (savedUIState === 'true') {
        window.AppState.uiHidden = true;
        $("#app-bar").hide();
        $("#toolbar-container").hide();
        $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
        $("#toggle-ui-btn").attr("title", "Show UI elements");
    }
}

// Check system dark mode preference
function checkSystemDarkModePreference() {
    const savedDarkMode = localStorage.getItem('darkMode');

    // If no preference is saved, use system preference
    if (savedDarkMode === null) {
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        window.AppState.isDarkMode = prefersDarkMode;
        window.isDarkMode = prefersDarkMode;

        if (typeof updateTheme === 'function') {
            updateTheme();
        }

        // Also listen for changes in system preference
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            // Only update if user hasn't set a preference
            if (localStorage.getItem('darkMode') === null) {
                window.AppState.isDarkMode = e.matches;
                window.isDarkMode = e.matches;

                if (typeof updateTheme === 'function') {
                    updateTheme();
                }
            }
        });
    }
}

// Initialize on document ready
$(document).ready(function() {
    console.log("Core.js ready, calling initializeApp");
    // Make sure gridApi is globally accessible
    window.gridApi = window.AppState.gridApi;

    // Call initialize with a slight delay to ensure other scripts are loaded
    setTimeout(initializeApp, 500);
});

// Expose for other modules
window.initializeApp = initializeApp;
window.loadSavedPreferences = loadSavedPreferences;
window.checkSystemDarkModePreference = checkSystemDarkModePreference;