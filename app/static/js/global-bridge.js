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
    isEditMode: false,           // Add this
    editableColumns: [],         // Add this
    lastChangeCheck: new Date()
};

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