// app/static/js/global-bridge.js
// Global variables and functions that need to be accessible across modules

// Shared state
window.appState = {
    gridApi: null,
    columnDefs: [],
    searchTerm: '',
    isDarkMode: false,
    activeFilters: [],
    nextFilterId: 2,
    columnVisibility: {},
    uiHidden: false,
    isEditMode: false,
    editableColumns: [],
    lastChangeCheck: new Date()
};

// Also ensure global edit variables exist for backward compatibility
window.isEditMode = false;
window.editSessionId = null;
window.unsavedChanges = {};
window.editableColumns = [];

// Global function references - ensure filter functions are properly set
window.appFunctions = {
    // These will be populated by modules
    initViewFile: null,
    initVirtualToimik: null,
    refreshData: null,
    toggleUIElements: null,
    performSearch: null,
    resetSearch: null,
    showToast: null,
    updateTheme: null,
    resizeTableContainer: null,
    updateDynamicElements: null,
    setupDropdowns: null,
    setupEventHandlers: null,
    getFilterParams: null,
    initGrid: null,
    generateQuickLinks: null,
    updateActiveFiltersDisplay: null,
    updateFilterOperators: null,
    updateFilterValueInput: null,
    addEnhancedFilterRow: null,
    applyEnhancedFilters: null,
    clearFilters: null,
    exportToExcel: null,
    exportToPDF: null,
    applyColumnVisibility: null,
    updateStatus: null,
    loadSavedFiltersList: null,
    scrollToColumn: null,
    highlightRefreshButton: null,
    debounce: null
};

// Direct access to critical functions for debugging
window.applyFilters = function() {
    console.log("Global window.applyFilters called");
    if (window.appFunctions.applyEnhancedFilters) {
        window.appFunctions.applyEnhancedFilters();
    } else {
        console.error("applyEnhancedFilters not found on window.appFunctions");
    }
};

// Initialize file operation handlers if they're available
if (typeof window.initViewFile === 'function') {
    window.initViewFile();
}
if (typeof window.initVirtualToimik === 'function') {
    window.initVirtualToimik();
}

// Function to synchronize state between global and appState
window.syncEditState = function() {
    // Sync from global to appState
    window.appState.isEditMode = window.isEditMode;
    window.appState.editableColumns = window.editableColumns;

    // Sync from appState to global (in case appState was updated)
    window.isEditMode = window.appState.isEditMode;
    window.editableColumns = window.appState.editableColumns;
};

// Call sync function periodically to ensure consistency
setInterval(window.syncEditState, 1000);