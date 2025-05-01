// app/static/js/modules/search.js
// Search functionality

// Perform search
function performSearch() {
    AppState.searchTerm = $("#search-input").val();

    if (AppState.gridApi) {
        // Refresh data with search term
        AppState.gridApi.refreshInfiniteCache();
    }
}

// Reset search
function resetSearch() {
    $("#search-input").val('');
    AppState.searchTerm = '';

    if (AppState.gridApi) {
        // Refresh data without search term
        AppState.gridApi.refreshInfiniteCache();
    }
}

// Export functions for other modules
window.performSearch = performSearch;
window.resetSearch = resetSearch;