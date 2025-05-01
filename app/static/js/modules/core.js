// app/static/js/modules/core.js
// Core initialization and global variables

// Global state
const AppState = {
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
    // Check system preferences for dark mode
    checkSystemDarkModePreference();

    // Load saved preferences
    loadSavedPreferences();

    // Set initial table container height
    resizeTableContainer();

    // Setup admin navigation
    setupAdminNavigation();

    // Setup window resize handler
    $(window).resize(function() {
        resizeTableContainer();
        if (AppState.gridApi) {
            AppState.gridApi.sizeColumnsToFit();
        }
    });

    // Get columns first
    getColumns();

    // Set up dropdown toggles
    setupDropdowns();

    // Set up event handlers
    setupEventHandlers();

    // Check for changes on initial load
    AppState.lastChangeCheck = new Date();
    AppState.lastChangeCheck.setMinutes(AppState.lastChangeCheck.getMinutes() - 30);
    setTimeout(function() {
        checkForDatabaseChanges();
    }, 3000); // Check shortly after page loads

    // Set up periodic change checking
    setupDataRefreshTimer();

    // User greeting
    showUserGreeting();
}

// Load saved preferences (dark mode, UI state)
function loadSavedPreferences() {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        AppState.isDarkMode = true;
        updateTheme();
    }

    const savedUIState = localStorage.getItem('bigtable_ui_hidden');
    if (savedUIState === 'true') {
        AppState.uiHidden = true;
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
        AppState.isDarkMode = prefersDarkMode;
        updateTheme();

        // Also listen for changes in system preference
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            // Only update if user hasn't set a preference
            if (localStorage.getItem('darkMode') === null) {
                AppState.isDarkMode = e.matches;
                updateTheme();
            }
        });
    }
}

function showUserGreeting() {
    if ($("#user-profile").length) {
        const username = $("#user-profile").data("username");
        setTimeout(function() {
            showToast("Tere tulemast!", `Tere, ${username}! Andmed on valmis.`, "success");
        }, 1500); // Show after data loads
    }
}

// Check if user is admin and add admin navigation
function setupAdminNavigation() {
    $.ajax({
        url: "/auth/check-admin",
        method: "GET",
        dataType: "json",
        success: function(response) {
            if (response.is_admin) {
                // Add admin link to navigation
                $("#admin-nav").html(`
                    <a href="/auth/admin" class="btn btn-primary btn-sm">
                        <i class="fas fa-user-shield"></i>
                        <span class="hidden sm:inline ml-1">Admin</span>
                    </a>
                `);

                // Also show the admin dashboard button in the toolbar
                $("#admin-dashboard-btn").show();
            }
        },
        error: function(xhr) {
            console.log("Not admin or not authenticated");
        }
    });
}

// Function to resize the table container
function resizeTableContainer() {
    const windowHeight = $(window).height();
    const headerHeight = $("#compact-header").outerHeight(true) || 0;
    const toolbarHeight = $("#toolbar-container").is(":visible") ? $("#toolbar-container").outerHeight(true) : 0;
    const filterPanelHeight = $("#filter-panel").hasClass("show") ? $("#filter-panel").outerHeight(true) : 0;

    // Add some breathing room on smaller screens
    const padding = window.innerWidth < 640 ? 16 : 24;

    // Make sure we have a minimum height on larger screens
    let tableHeight = windowHeight - headerHeight - toolbarHeight - filterPanelHeight - padding;

    // Ensure minimum height on mobile
    tableHeight = Math.max(tableHeight, 300);

    // Maximum height for very large screens to prevent excessive space
    if (window.innerHeight > 1200) {
        tableHeight = Math.min(tableHeight, window.innerHeight * 0.7);
    }

    $("#table-container").css("height", tableHeight + "px");

    if ($("#edit-history-panel").is(":visible")) {
        // Adjust based on screen size
        const historyPanelOffset = window.innerWidth < 640 ? 80 : 40;
        $("#table-container").css("height", (tableHeight - historyPanelOffset) + "px");
    }

    // If grid API exists, resize columns to fit
    if (AppState.gridApi) {
        setTimeout(() => {
            AppState.gridApi.sizeColumnsToFit();
        }, 50);
    }
}

// Utility function to debounce function calls
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Initialize on document ready
$(document).ready(function() {
    initializeApp();

    // Setup DOM observer for dynamic elements
    setupDarkModeObserver();
});

// Export for other modules
window.AppState = AppState;