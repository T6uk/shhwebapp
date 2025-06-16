// app/static/js/app.js
// Main application initialization and global state management

(function() {
    // Initialize global application state
    window.appState = {
        isDarkMode: false,
        uiHidden: false,
        gridApi: null,
        columnDefs: [],
        columnVisibility: {},
        activeFilters: [],
        nextFilterId: 1,
        searchTerm: '',
        lastChangeCheck: null,
        isEditMode: false,
        editableColumns: []
    };

    // Initialize global functions bridge
    window.appFunctions = {};

    // Application initialization
    $(document).ready(function() {
        console.log("Application starting...");

        // Initialize core modules
        // Core module will handle the rest of initialization

        console.log("Application initialized successfully");
    });

    // Export global state for other modules
    window.getAppState = function() {
        return window.appState;
    };

    window.getAppFunctions = function() {
        return window.appFunctions;
    };

})();