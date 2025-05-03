// app/static/js/modules/core.js
// Core functionality and initialization

(function () {
    // Local references to global state
    const state = window.appState;
    const funcs = window.appFunctions;

    // Initialize when document is ready
    $(document).ready(function () {
        checkSystemDarkModePreference();

        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode === 'true') {
            state.isDarkMode = true;
            funcs.updateTheme();
        }

        const savedUIState = localStorage.getItem('bigtable_ui_hidden');
        if (savedUIState === 'true') {
            state.uiHidden = true;
            $("#app-bar").hide();
            $("#toolbar-container").hide();
            $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
            $("#toggle-ui-btn").attr("title", "Show UI elements");
        }

        // Set the initial table container height
        funcs.resizeTableContainer();
        setupAdminNavigation();

        // Handle window resize
        $(window).resize(function () {
            funcs.resizeTableContainer();
            if (state.gridApi) {
                state.gridApi.sizeColumnsToFit();
            }
        });

        // Get columns first
        getColumns();

        // Set up dropdown toggles
        funcs.setupDropdowns();

        // Set up event handlers
        funcs.setupEventHandlers();

        // Check for changes on initial load
        state.lastChangeCheck = new Date();
        state.lastChangeCheck.setMinutes(state.lastChangeCheck.getMinutes() - 30); // Check last 30 minutes
        setTimeout(function () {
            checkForDatabaseChanges();
        }, 3000); // Check shortly after page loads

        // Set up periodic change checking (no auto refresh)
        setupDataRefreshTimer();

        if ($("#user-profile").length) {
            const username = $("#user-profile").data("username");
            setTimeout(function () {
                funcs.showToast("Tere tulemast!", `Tere, ${username}! Andmed on valmis.`, "success");
            }, 1500); // Show after data loads
        }

        // Set up dark mode observer
        setupDarkModeObserver();
    });

    function checkSystemDarkModePreference() {
        const savedDarkMode = localStorage.getItem('darkMode');

        // If no preference is saved, use system preference
        if (savedDarkMode === null) {
            const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            state.isDarkMode = prefersDarkMode;
            funcs.updateTheme();

            // Also listen for changes in system preference
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                // Only update if user hasn't set a preference
                if (localStorage.getItem('darkMode') === null) {
                    state.isDarkMode = e.matches;
                    funcs.updateTheme();
                }
            });
        }
    }

    function setupDarkModeObserver() {
        // Create an observer instance
        const observer = new MutationObserver(function (mutations) {
            if (state.isDarkMode) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes.length) {
                        // Apply dark mode to newly added elements
                        $(mutation.addedNodes).find('.btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)').addClass('bg-gray-700 text-gray-200 border-gray-600').removeClass('bg-white text-gray-700 border-gray-200');
                        $(mutation.addedNodes).find('input, select').addClass('bg-gray-700 text-gray-200 border-gray-600').removeClass('bg-white text-gray-700 border-gray-200');
                        $(mutation.addedNodes).find('.card, .dropdown-menu').addClass('bg-gray-800 border-gray-700').removeClass('bg-white border-gray-200');

                        // Handle status chips
                        $(mutation.addedNodes).find('.status-chip:not([class*="bg-red-"]):not([class*="bg-green-"]):not([class*="bg-blue-"]):not([class*="bg-yellow-"])').addClass('bg-gray-700 text-gray-200').removeClass('bg-gray-100 text-gray-700');

                        // Handle dark mode for toast notifications
                        if ($(mutation.addedNodes).hasClass('toast-notification')) {
                            funcs.updateDynamicElements();
                        }
                    }
                });
            }
        });

        // Observe changes to the DOM
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    // Set up periodic data refresh
    function setupDataRefreshTimer() {
        // Initialize refresh state - no automatic refresh
        console.log("Data refresh will only happen on user action");

        // Check for changes every 30 seconds, but only notify, don't refresh
        setInterval(function () {
            checkForDatabaseChanges();
        }, 30000); // 30 seconds
    }

    function checkForDatabaseChanges() {
        $.ajax({
            url: "/api/v1/table/check-for-changes",
            method: "GET",
            data: {
                last_checked: state.lastChangeCheck || new Date().toISOString()
            },
            dataType: "json",
            success: function (response) {
                // Update the last check timestamp
                state.lastChangeCheck = response.timestamp;

                // If there are changes, highlight the refresh button
                if (response.has_changes) {
                    highlightRefreshButton(response.changes);
                }
            },
            error: function (xhr, status, error) {
                console.error("Error checking for changes:", error);
            }
        });
    }

    // Function to highlight the refresh button when changes are detected
    function highlightRefreshButton(changes) {
        // Add pulsing animation and change color
        $("#refresh-button")
            .addClass("animate-pulse bg-yellow-500 hover:bg-yellow-600")
            .removeClass("btn-secondary");

        // Add counter badge if there are multiple changes
        if (changes && changes.length > 0) {
            const badge = $(`<span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${changes.length}</span>`);
            $("#refresh-button .badge-container").html(badge);
        }
    }

    // Function to reset refresh button to normal state
    function resetRefreshButton() {
        $("#refresh-button")
            .removeClass("animate-pulse bg-yellow-500 hover:bg-yellow-600")
            .addClass("btn-secondary");

        $("#refresh-button .badge-container").empty();
    }

    // Function to manually refresh data
    function refreshData() {
        if (state.gridApi) {
            // Show loading indicator
            $("#mini-loading-indicator").removeClass("hidden");

            // Add a timestamp to force cache bypass
            const timestamp = new Date().getTime();
            state.gridApi.refreshInfiniteCache({timestamp: timestamp});
            console.log("Manual data refresh performed");

            // Reset the refresh button
            resetRefreshButton();

            // Hide loading indicator after a short delay
            setTimeout(function () {
                $("#mini-loading-indicator").addClass("hidden");
            }, 500);
        }
    }

    // Check if user is admin and add admin navigation
    function setupAdminNavigation() {
        $.ajax({
            url: "/auth/check-admin",  // Updated path
            method: "GET",
            dataType: "json",
            success: function (response) {
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
            error: function (xhr) {
                console.log("Not admin or not authenticated");
            }
        });
    }

    // Get columns from the API
    function getColumns() {
        $("#loading-overlay").show();
        $("#status").text("Laadimine...");

        $.ajax({
            url: "/api/v1/table/columns",
            method: "GET",
            dataType: "json",
            success: function (response) {
                if (response && response.columns && response.columns.length > 0) {
                    // Process column data for AG Grid
                    state.columnDefs = response.columns.map(function (col) {
                        // Initialize as visible in our tracking
                        state.columnVisibility[col.field] = true;

                        return {
                            headerName: col.title || col.field,
                            field: col.field,
                            sortable: true,
                            filter: true,
                            resizable: true,
                            // Set minimum width to improve rendering performance
                            minWidth: 100,
                            // Choose appropriate filters based on data type
                            filterParams: funcs.getFilterParams(col.type),
                            // Add tooltips for cell values
                            tooltipField: col.field,
                            type: col.type // Store column type for filter operations
                        };
                    });

                    // Generate quick links
                    funcs.generateQuickLinks();

                    // Initialize AG Grid
                    funcs.initGrid();
                } else {
                    $("#status").text("Viga: Veergude andmeid ei saadud");
                    $("#loading-overlay").hide();
                }
            },
            error: function (xhr, status, error) {
                $("#status").text("Viga: " + error);
                $("#loading-overlay").hide();
            }
        });
    }

    // Add a debounce function to improve search performance
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Register Service Worker
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

    // Function to toggle UI elements
    function toggleUIElements() {
        state.uiHidden = !state.uiHidden;

        // Save state to localStorage
        localStorage.setItem('bigtable_ui_hidden', state.uiHidden ? 'true' : 'false');

        // Update button icon
        if (state.uiHidden) {
            $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
            $("#toggle-ui-btn").attr("title", "Show UI elements");
        } else {
            $("#toggle-ui-btn i").removeClass("fa-expand-alt").addClass("fa-compress-alt");
            $("#toggle-ui-btn").attr("title", "Hide UI elements");
        }

        if (state.uiHidden) {
            // Hide toolbar but keep header
            $("#toolbar-container").slideUp(300, function () {
                funcs.resizeTableContainer();
            });
        } else {
            // Show toolbar
            $("#toolbar-container").slideDown(300, function () {
                funcs.resizeTableContainer();
            });
        }
    }

    // Search functionality
    function performSearch() {
        const searchTerm = $("#search-input").val();
        console.log('Performing search with term:', searchTerm);

        // Set the search term directly on the global state
        window.appState.searchTerm = searchTerm;

        if (window.appState.gridApi) {
            // Refresh data with search term
            console.log('Refreshing grid cache with search term:', window.appState.searchTerm);
            window.appState.gridApi.refreshInfiniteCache();
        } else {
            console.error('Grid API not available for search');
        }
    }

    // Reset search
    function resetSearch() {
        $("#search-input").val('');

        // Clear the search term directly on the global state
        window.appState.searchTerm = '';
        console.log('Reset search, searchTerm is now:', window.appState.searchTerm);

        if (window.appState.gridApi) {
            // Refresh data without search term
            console.log('Refreshing grid cache after reset');
            window.appState.gridApi.refreshInfiniteCache();
        } else {
            console.error('Grid API not available for reset');
        }
    }

    // Assign functions to the global bridge
    funcs.refreshData = refreshData;
    funcs.toggleUIElements = toggleUIElements;
    funcs.debounce = debounce;
    funcs.performSearch = performSearch;
    funcs.resetSearch = resetSearch;
})();