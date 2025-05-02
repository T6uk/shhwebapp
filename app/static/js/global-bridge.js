// app/static/js/global-bridge.js
// Global variables and functions that need to be accessible across modules

// Shared state
window.appState = {
    gridApi: null,
    columnDefs: [],
    searchTerm: '',
    isDarkMode: false,
    activeFilters: [],
    nextFilterId: 2, // Start at 2 since we have one filter row by default
    columnVisibility: {}, // To track which columns are visible
    uiHidden: false,
    isEditMode: false,
    editableColumns: [],
    lastChangeCheck: new Date()
};

// Global function references
window.appFunctions = {
    // These will be populated by modules
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