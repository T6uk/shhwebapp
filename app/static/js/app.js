// Global variables
let gridApi = null;
let columnDefs = [];
let searchTerm = '';
let isDarkMode = false;
let activeFilters = [];
let nextFilterId = 2; // Start at 2 since we have one filter row by default
let columnVisibility = {}; // To track which columns are visible
let uiHidden = false;

// Initialize when document is ready
$(document).ready(function () {

    function checkSystemDarkModePreference() {
        const savedDarkMode = localStorage.getItem('darkMode');

        // If no preference is saved, use system preference
        if (savedDarkMode === null) {
            const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            isDarkMode = prefersDarkMode;
            updateTheme();

            // Also listen for changes in system preference
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                // Only update if user hasn't set a preference
                if (localStorage.getItem('darkMode') === null) {
                    isDarkMode = e.matches;
                    updateTheme();
                }
            });
        }
    }

// Call this function
    checkSystemDarkModePreference();

    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        isDarkMode = true;
        updateTheme();
    }

    const savedUIState = localStorage.getItem('bigtable_ui_hidden');
    if (savedUIState === 'true') {
        uiHidden = true;
        $("#app-bar").hide();
        $("#toolbar-container").hide();
        $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
        $("#toggle-ui-btn").attr("title", "Show UI elements");
    }
    // Set the initial table container height
    resizeTableContainer();
    setupAdminNavigation();

    // Handle window resize
    $(window).resize(function () {
        resizeTableContainer();
        if (gridApi) {
            gridApi.sizeColumnsToFit();
        }
    });

    // Get columns first
    getColumns();

    // Set up dropdown toggles
    setupDropdowns();

    // Set up event handlers
    setupEventHandlers();

    // Check for changes on initial load
    lastChangeCheck = new Date();
    lastChangeCheck.setMinutes(lastChangeCheck.getMinutes() - 30); // Check last 30 minutes
    setTimeout(function () {
        checkForDatabaseChanges();
    }, 3000); // Check shortly after page loads

    // Set up periodic change checking (no auto refresh)
    setupDataRefreshTimer();

    if ($("#user-profile").length) {
        const username = $("#user-profile").data("username");
        setTimeout(function () {
            showToast("Tere tulemast!", `Tere, ${username}! Andmed on valmis.`, "success");
        }, 1500); // Show after data loads
    }

    function setupDarkModeObserver() {
        // Create an observer instance
        const observer = new MutationObserver(function (mutations) {
            if (isDarkMode) {
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
                            updateDynamicElements();
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

    // Call this function to start observing
    const darkModeObserver = setupDarkModeObserver();
});

function toggleUIElements() {
    uiHidden = !uiHidden;

    // Save state to localStorage
    localStorage.setItem('bigtable_ui_hidden', uiHidden ? 'true' : 'false');

    // Update button icon
    if (uiHidden) {
        $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
        $("#toggle-ui-btn").attr("title", "Show UI elements");
    } else {
        $("#toggle-ui-btn i").removeClass("fa-expand-alt").addClass("fa-compress-alt");
        $("#toggle-ui-btn").attr("title", "Hide UI elements");
    }

    if (uiHidden) {
        // Hide toolbar but keep header
        $("#toolbar-container").slideUp(300, function() {
            resizeTableContainer();
        });
    } else {
        // Show toolbar
        $("#toolbar-container").slideDown(300, function() {
            resizeTableContainer();
        });
    }
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
            last_checked: lastChangeCheck || new Date().toISOString()
        },
        dataType: "json",
        success: function (response) {
            // Update the last check timestamp
            lastChangeCheck = response.timestamp;

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
    if (gridApi) {
        // Show loading indicator
        $("#mini-loading-indicator").removeClass("hidden");

        // Add a timestamp to force cache bypass
        const timestamp = new Date().getTime();
        gridApi.refreshInfiniteCache({timestamp: timestamp});
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

// Set up dropdown toggles
function setupDropdowns() {
    const dropdowns = [
        {toggle: "#tools-dropdown-toggle", menu: "#tools-dropdown-menu"},
        {toggle: "#widgets-dropdown-toggle", menu: "#widgets-dropdown-menu"},
        {toggle: "#settings-dropdown-toggle", menu: "#settings-dropdown-menu"},
        {toggle: "#links-dropdown-toggle", menu: "#links-dropdown-menu"},
        {toggle: "#filters-dropdown-toggle", menu: "#filters-dropdown-menu"} // Add this line
    ];

    // Set up each dropdown with toggle behavior
    dropdowns.forEach(dropdown => {
        $(dropdown.toggle).click(function (e) {
            e.stopPropagation();
            $(dropdown.menu).toggleClass("show");

            // Hide other dropdowns
            dropdowns.forEach(other => {
                if (other.menu !== dropdown.menu) {
                    $(other.menu).removeClass("show");
                }
            });
        });
    });

    // Close dropdowns when clicking outside
    $(document).click(function () {
        $(".dropdown-menu").removeClass("show");
    });

    // Prevent dropdown closing when clicking inside dropdown
    $(".dropdown-menu").click(function (e) {
        e.stopPropagation();
    });
}

// Function to resize the table container
// Update the resizeTableContainer function
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
    if (gridApi) {
        setTimeout(() => {
            gridApi.sizeColumnsToFit();
        }, 50);
    }
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
                columnDefs = response.columns.map(function (col) {
                    // Initialize as visible in our tracking
                    columnVisibility[col.field] = true;

                    return {
                        headerName: col.title || col.field,
                        field: col.field,
                        sortable: true,
                        filter: true,
                        resizable: true,
                        // Set minimum width to improve rendering performance
                        minWidth: 100,
                        // Choose appropriate filters based on data type
                        filterParams: getFilterParams(col.type),
                        // Add tooltips for cell values
                        tooltipField: col.field
                    };
                });

                // Generate quick links
                generateQuickLinks();

                // Initialize AG Grid
                initGrid();
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

// Get filter parameters based on column type
function getFilterParams(type) {
    if (type === 'integer' || type === 'numeric' || type === 'double precision' ||
        type === 'real' || type === 'decimal') {
        return {
            filterOptions: ['equals', 'lessThan', 'greaterThan', 'inRange'],
            maxNumConditions: 1
        };
    } else if (type === 'date' || type === 'timestamp' || type === 'timestamp with time zone') {
        return {
            filterOptions: ['equals', 'lessThan', 'greaterThan', 'inRange'],
            comparator: dateComparator,
            maxNumConditions: 1
        };
    } else {
        return {
            filterOptions: ['contains', 'equals', 'startsWith', 'endsWith'],
            maxNumConditions: 1,
            suppressAndOrCondition: true
        };
    }
}

// Date comparator for filtering
function dateComparator(filterDate, cellValue) {
    if (!cellValue) return -1;
    const cellDate = new Date(cellValue);
    if (cellDate < filterDate) return -1;
    if (cellDate > filterDate) return 1;
    return 0;
}

// Initialize AG Grid
function initGrid() {
    // Create grid options
    const gridOptions = {
        defaultColDef: {
            flex: 1,
            minWidth: 100,
            resizable: true,
            sortable: true,
            filter: true,
            // Add these properties for editing
            editable: function (params) {
                // Only editable if in edit mode and the column is in editableColumns
                return isEditMode && editableColumns.includes(params.colDef.field);
            },
            cellStyle: getCellStyle,
            cellClass: function (params) {
                // Add a custom class to editable cells based on current mode
                if (isEditMode && editableColumns && editableColumns.includes(params.colDef.field)) {
                    return 'editable-cell';
                }
                return '';
            }
        },
        columnDefs: columnDefs,
        rowModelType: 'infinite',  // Use infinite row model for virtualization
        infiniteInitialRowCount: 1000, // Initial placeholder row count
        cacheBlockSize: 100, // Number of rows to load at a time
        maxBlocksInCache: 10, // Maximum number of blocks to keep loaded
        enableCellTextSelection: true,
        getRowId: function (params) {
            // Use row index as ID - adjust if you have a better unique identifier
            return params.data.id || params.node.rowIndex;
        },
        // Add tooltip component for better UX
        tooltipShowDelay: 300,
        tooltipInteraction: true,
        // Improve performance with these settings
        suppressAnimationFrame: true,
        enableRangeSelection: false,
        suppressMovableColumns: false,
        suppressFieldDotNotation: true,
        // Event handlers
        onFirstDataRendered: onFirstDataRendered,
        onGridReady: onGridReady,
        onFilterChanged: onFilterChanged,
        onSortChanged: onSortChanged,
        onCellValueChanged: onCellValueChanged,
        rowSelection: 'multiple',
        suppressRowHoverHighlight: false,
        rowHighlightClass: 'ag-row-highlight',
    };

    // Create the grid
    new agGrid.Grid(document.getElementById('data-table'), gridOptions);
}

// Handle grid ready event
function onGridReady(params) {
    gridApi = params.api;

    // Set a datasource for infinite scrolling
    const dataSource = {
        getRows: function (params) {
            console.log('AG Grid requesting rows:', params.startRow, 'to', params.endRow);

            // Show loading indicator for initial load
            if (params.startRow === 0) {
                $("#loading-overlay").show();
            } else {
                // Show mini loading indicator for subsequent loads
                $("#mini-loading-indicator").removeClass("hidden");
            }

            // Build query parameters
            const queryParams = {
                start_row: params.startRow,
                end_row: params.endRow
            };

            // Add sorting if present
            if (params.sortModel && params.sortModel.length > 0) {
                queryParams.sort_field = params.sortModel[0].colId;
                queryParams.sort_dir = params.sortModel[0].sort;
                console.log('Adding sort:', queryParams.sort_field, queryParams.sort_dir);
            }

            // Add search term if present
            if (searchTerm) {
                queryParams.search = searchTerm;
                console.log('Adding search term:', searchTerm);
            }

            // Add filters if present
            if (params.filterModel && Object.keys(params.filterModel).length > 0) {
                // Convert the filter model to a JSON string
                queryParams.filter_model = JSON.stringify(params.filterModel);
                console.log('Adding filter model:', queryParams.filter_model);
            }

            // Add timestamp to bust cache when refreshing
            if (params.parentNode && params.parentNode.data && params.parentNode.data.timestamp) {
                queryParams.timestamp = params.parentNode.data.timestamp;
            }

            $.ajax({
                url: "/api/v1/table/data",
                method: "GET",
                data: queryParams,
                dataType: "json",
                success: function (response) {
                    // Update status
                    $("#status").text(response.rowCount + " kirjet" +
                        (queryParams.filter_model ? " (filtreeritud)" : ""));

                    // Check if we have more rows
                    const lastRow = response.rowCount <= response.endRow ? response.rowCount : -1;

                    // Provide the data to the grid
                    params.successCallback(response.rowData, lastRow);

                    // Hide loading indicators
                    $("#loading-overlay").hide();
                    $("#mini-loading-indicator").addClass("hidden");
                },
                error: function (xhr, status, error) {
                    console.error("Error loading data:", error);
                    console.error("Response:", xhr.responseText);
                    $("#status").text("Viga: " + error);
                    params.failCallback();
                    $("#loading-overlay").hide();
                    $("#mini-loading-indicator").addClass("hidden");

                    // Show error toast
                    showToast("Andmete laadimine ebaõnnestus", error, "error");
                }
            });
        }
    };

    // Set the datasource
    gridApi.setDatasource(dataSource);

    gridApi.addEventListener('filterChanged', function () {
        setTimeout(updateActiveFiltersDisplay, 100);
    });

    // Fit columns to available width
    setTimeout(function () {
        gridApi.sizeColumnsToFit();
    }, 100);

    // Update theme if dark mode is active
    if (isDarkMode) {
        updateTheme();
    }
}

// Handle first data rendered
function onFirstDataRendered(params) {
    // Auto-size columns for better initial view
    gridApi.autoSizeColumns();

    // Size columns to fit the viewport after auto-sizing
    setTimeout(function () {
        gridApi.sizeColumnsToFit();
    }, 200);
}

// Handle filter changes
function onFilterChanged() {
    // Update row count in status bar
    const displayedRowCount = gridApi.getDisplayedRowCount();
    $("#status").text(displayedRowCount + " kirjet (filtreeritud)");
}

// Handle sort changes
function onSortChanged() {
    // Refresh data with new sort order
    gridApi.refreshInfiniteCache();
}

// Update font size
function updateFontSize() {
    document.documentElement.style.setProperty('--ag-font-size', currentFontSize + 'px');
    if (gridApi) {
        gridApi.refreshCells({force: true});
    }
}

// Update theme (light/dark mode)
function updateTheme() {
    // Apply dark mode to HTML element for CSS selector support
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');

        // Apply theme to AG Grid container
        $(".ag-theme-alpine").addClass("ag-theme-alpine-dark");

        // Core element styling
        $("body").addClass("bg-gray-900").removeClass("bg-gray-50");
        $(".app-title").addClass("text-white").removeClass("text-gray-900");
        $(".app-title-container .text-xs").addClass("text-gray-400").removeClass("text-gray-500");

        // Cards and containers
        $(".card, .dropdown-menu, .loading-card, .filter-panel")
            .addClass("bg-gray-800 border-gray-700")
            .removeClass("bg-white border-gray-200");

        // Buttons
        $(".btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)")
            .addClass("bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600")
            .removeClass("bg-white text-gray-700 border-gray-200 hover:bg-gray-50");

        // Inputs and form controls
        $("input, select, .input-control, .filter-select, .filter-input")
            .addClass("bg-gray-700 text-gray-200 border-gray-600")
            .removeClass("bg-white text-gray-700 border-gray-200");

        // Dropdown toggles
        $("[id$='-dropdown-toggle']").each(function () {
            $(this).addClass("bg-gray-700 text-gray-200 border-gray-600")
                .removeClass("bg-white text-gray-700 border-gray-200");
        });

        // Dropdown items
        $(".dropdown-item")
            .addClass("text-gray-200 hover:bg-gray-700")
            .removeClass("text-gray-700 hover:bg-gray-100");

        // Modal content
        $("#column-modal .modal-content")
            .addClass("bg-gray-800 border-gray-700")
            .removeClass("bg-white border-gray-200");

        // Column checkboxes
        $(".column-checkbox-item")
            .addClass("hover:bg-gray-700")
            .removeClass("hover:bg-gray-100");

        // Quick links
        $(".quick-link")
            .addClass("bg-gray-700 text-gray-200 border-gray-600")
            .removeClass("bg-gray-100 text-gray-700 border-gray-200");

        // History panel
        $("#edit-history-panel")
            .addClass("bg-gray-800 text-gray-200 border-gray-700")
            .removeClass("bg-white text-gray-700 border-gray-200");

        // Status elements
        $(".status-chip:not([class*='bg-red-']):not([class*='bg-green-']):not([class*='bg-blue-']):not([class*='bg-yellow-'])")
            .addClass("bg-gray-700 text-gray-200")
            .removeClass("bg-gray-100 text-gray-700");

        // Loading overlay
        $(".loading-overlay")
            .addClass("bg-gray-900 bg-opacity-80")
            .removeClass("bg-white bg-opacity-90");

        // General text colors
        $(".text-gray-700, .text-gray-800, .text-gray-900").not(".dark\\:text-gray-200, .dark\\:text-gray-300")
            .addClass("text-gray-200")
            .removeClass("text-gray-700 text-gray-800 text-gray-900");
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'false');

        // Restore AG Grid theme
        $(".ag-theme-alpine").removeClass("ag-theme-alpine-dark");

        // Core element styling
        $("body").removeClass("bg-gray-900").addClass("bg-gray-50");
        $(".app-title").removeClass("text-white").addClass("text-gray-900");
        $(".app-title-container .text-xs").removeClass("text-gray-400").addClass("text-gray-500");

        // Cards and containers
        $(".card, .dropdown-menu, .loading-card, .filter-panel")
            .removeClass("bg-gray-800 border-gray-700")
            .addClass("bg-white border-gray-200");

        // Buttons
        $(".btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)")
            .removeClass("bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600")
            .addClass("bg-white text-gray-700 border-gray-200 hover:bg-gray-50");

        // Inputs and form controls
        $("input, select, .input-control, .filter-select, .filter-input")
            .removeClass("bg-gray-700 text-gray-200 border-gray-600")
            .addClass("bg-white text-gray-700 border-gray-200");

        // Dropdown toggles
        $("[id$='-dropdown-toggle']").each(function () {
            $(this).removeClass("bg-gray-700 text-gray-200 border-gray-600")
                .addClass("bg-white text-gray-700 border-gray-200");
        });

        // Dropdown items
        $(".dropdown-item")
            .removeClass("text-gray-200 hover:bg-gray-700")
            .addClass("text-gray-700 hover:bg-gray-100");

        // Modal content
        $("#column-modal .modal-content")
            .removeClass("bg-gray-800 border-gray-700")
            .addClass("bg-white border-gray-200");

        // Column checkboxes
        $(".column-checkbox-item")
            .removeClass("hover:bg-gray-700")
            .addClass("hover:bg-gray-100");

        // Quick links
        $(".quick-link")
            .removeClass("bg-gray-700 text-gray-200 border-gray-600")
            .addClass("bg-gray-100 text-gray-700 border-gray-200");

        // History panel
        $("#edit-history-panel")
            .removeClass("bg-gray-800 text-gray-200 border-gray-700")
            .addClass("bg-white text-gray-700 border-gray-200");

        // Status elements
        $(".status-chip:not([class*='bg-red-']):not([class*='bg-green-']):not([class*='bg-blue-']):not([class*='bg-yellow-'])")
            .removeClass("bg-gray-700 text-gray-200")
            .addClass("bg-gray-100 text-gray-700");

        // Loading overlay
        $(".loading-overlay")
            .removeClass("bg-gray-900 bg-opacity-80")
            .addClass("bg-white bg-opacity-90");

        // General text colors
        $(".text-gray-200").not(".dark\\:text-gray-200")
            .removeClass("text-gray-200")
            .addClass("text-gray-700");
    }

    // Handle modals and dynamically added content
    updateDynamicElements();

    // Refresh AG Grid to apply theme changes
    if (gridApi) {
        gridApi.refreshCells({force: true});
    }
}

// Add a new function to handle dynamic elements that might be added after initial theme application
function updateDynamicElements() {
    // Get the current mode
    const isDark = document.body.classList.contains('dark-mode');

    // Find dynamically created notifications/toasts
    if (isDark) {
        $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
            .addClass("bg-gray-800 text-gray-200 border-gray-700")
            .removeClass("bg-white text-gray-700 border-gray-200");
    } else {
        $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
            .removeClass("bg-gray-800 text-gray-200 border-gray-700")
            .addClass("bg-white text-gray-700 border-gray-200");
    }

    // Handle other dynamic UI components as needed
}

// Add this new function for updating toast notifications style
function updateToastStyles() {
    // Updates any existing toast notifications to use the current theme
    const isDark = document.documentElement.classList.contains('dark');

    // Get all toast notifications
    $(".toast-notification").each(function () {
        const $toast = $(this);

        // Get the notification type (info, success, error, warning)
        let type = "info";
        if ($toast.hasClass("bg-green-100") || $toast.hasClass("bg-green-900")) type = "success";
        if ($toast.hasClass("bg-red-100") || $toast.hasClass("bg-red-900")) type = "error";
        if ($toast.hasClass("bg-yellow-100") || $toast.hasClass("bg-yellow-900")) type = "warning";

        // Remove all possible color classes
        $toast.removeClass(
            "bg-blue-100 bg-green-100 bg-red-100 bg-yellow-100 " +
            "bg-blue-900 bg-green-900 bg-red-900 bg-yellow-900 " +
            "text-blue-100 text-green-100 text-red-100 text-yellow-100 " +
            "text-blue-800 text-green-800 text-red-800 text-yellow-800"
        );

        // Apply appropriate classes for current theme
        let colors = {
            "success": isDark ? "bg-green-900 text-green-100" : "bg-green-100 text-green-800",
            "error": isDark ? "bg-red-900 text-red-100" : "bg-red-100 text-red-800",
            "info": isDark ? "bg-blue-900 text-blue-100" : "bg-blue-100 text-blue-800",
            "warning": isDark ? "bg-yellow-900 text-yellow-100" : "bg-yellow-100 text-yellow-800"
        };

        // Add the colors
        $toast.addClass(colors[type]);
    });
}

// Generate quick links for columns
function generateQuickLinks() {
    if (!columnDefs || columnDefs.length === 0) return;

    const quickLinksContainer = $("#column-quick-links");
    quickLinksContainer.empty();

    // Add all columns as quick links (or limit to a reasonable number)
    const maxLinks = Math.min(24, columnDefs.length); // Grid layout will organize these
    for (let i = 0; i < maxLinks; i++) {
        const column = columnDefs[i];
        const linkElement = $("<div>")
            .addClass("quick-link")
            .text(column.headerName)
            .attr("data-field", column.field)
            .click(function () {
                scrollToColumn(column.field);
                $("#links-dropdown-menu").removeClass("show");
            });

        quickLinksContainer.append(linkElement);
    }
}

// Scroll to a specific column
function scrollToColumn(fieldName) {
    if (!gridApi) return;

    // Get column instance
    const column = gridApi.getColumnDef(fieldName);
    if (column) {
        // Ensure column is visible
        gridApi.ensureColumnVisible(fieldName);

        // Optional: highlight the column briefly
        gridApi.flashCells({
            columns: [fieldName],
            rowNodes: gridApi.getDisplayedRowAtIndex(0) ? [gridApi.getDisplayedRowAtIndex(0)] : []
        });
    }
}

// Show column visibility modal
function showColumnVisibilityModal() {
    if (!columnDefs || columnDefs.length === 0) return;

    // Build checkboxes for all columns
    const container = $("#column-checkboxes");
    container.empty();

    columnDefs.forEach(function (col) {
        const isVisible = columnVisibility[col.field];

        const checkbox = $(`
            <div class="flex items-center">
                <input type="checkbox" id="col-${col.field}"
                    data-field="${col.field}"
                    class="column-toggle mr-2"
                    ${isVisible ? 'checked' : ''}>
                <label for="col-${col.field}" class="text-sm">${col.headerName}</label>
            </div>
        `);

        container.append(checkbox);
    });

    // Show the modal
    $("#column-modal").removeClass("hidden");
}

// Apply column visibility changes
function applyColumnVisibility() {
    if (!gridApi) return;

    // Get checked/unchecked state from checkboxes
    $(".column-toggle").each(function () {
        const field = $(this).data('field');
        const isVisible = $(this).prop('checked');

        // Update local tracking
        columnVisibility[field] = isVisible;

        // Update AG Grid
        gridApi.setColumnVisible(field, isVisible);
    });
}

// Search functionality
function performSearch() {
    searchTerm = $("#search-input").val();

    if (gridApi) {
        // Refresh data with search term
        gridApi.refreshInfiniteCache();
    }
}

// Reset search
function resetSearch() {
    $("#search-input").val('');
    searchTerm = '';

    if (gridApi) {
        // Refresh data without search term
        gridApi.refreshInfiniteCache();
    }
}

// Add a filter row
function addFilterRow() {
    const newRow = $(`
        <div class="filter-row" data-id="${nextFilterId}">
            <select class="filter-select filter-field">
                <option value="">Vali veerg...</option>
            </select>

            <select class="filter-select filter-operator">
                <option value="contains">Sisaldab</option>
                <option value="equals">Võrdub</option>
                <option value="starts">Algab</option>
                <option value="ends">Lõpeb</option>
                <option value="greater">Suurem kui</option>
                <option value="less">Väiksem kui</option>
            </select>

            <input type="text" class="filter-input" placeholder="Filtri väärtus">

            <button class="filter-remove-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `);

    $("#filter-container").append(newRow);

    // Add column options to the new filter field
    updateFilterFields();

    nextFilterId++;
}

// Update filter fields with column options
function updateFilterFields() {
    if (!columnDefs || columnDefs.length === 0) return;

    // Clear existing options except the first placeholder
    $(".filter-field").each(function () {
        const placeholder = $(this).children().first();
        $(this).empty().append(placeholder);
    });

    // Add column options to each filter field dropdown
    columnDefs.forEach(function (col) {
        const option = $("<option>")
            .val(col.field)
            .text(col.headerName);

        $(".filter-field").each(function () {
            $(this).append(option.clone());
        });
    });
}

// Apply filters
function applyFilters() {
    // Collect filter conditions
    activeFilters = [];
    let filterModel = {};

    $(".filter-row").each(function () {
        const field = $(this).find(".filter-field").val();
        const operator = $(this).find(".filter-operator").val();

        // Skip if no field selected
        if (!field) return;

        let value;

        // Handle different operators
        if (operator === 'blank' || operator === 'notBlank') {
            // No value needed
            value = null;
        } else if (operator === 'inRange') {
            // Get from/to values
            const fromValue = $(this).find(".filter-from").val();
            const toValue = $(this).find(".filter-to").val();

            if (!fromValue && !toValue) return; // Skip if no range values

            value = {
                from: fromValue || null,
                to: toValue || null
            };
        } else {
            // Get single value from input
            value = $(this).find(".filter-input").val();

            if (!value && operator !== 'blank' && operator !== 'notBlank') return; // Skip if no value
        }

        // Save the filter to the model
        activeFilters.push({
            field: field,
            operator: operator,
            value: value
        });

        // Add to AG Grid filter model
        filterModel[field] = {
            filterType: getFilterType(operator),
            type: operator,
            filter: value
        };
    });

    // Apply filters to AG Grid
    if (gridApi && Object.keys(filterModel).length > 0) {
        gridApi.setFilterModel(filterModel);
    } else if (gridApi) {
        // Clear filters
        gridApi.setFilterModel(null);
    }

    // Update status
    const displayedRowCount = gridApi ? gridApi.getDisplayedRowCount() : 0;
    $("#status").text(activeFilters.length > 0 ?
        `Filtreeritud: ${displayedRowCount} kirjet` :
        `${displayedRowCount} kirjet`);

    // Resize table container
    resizeTableContainer();
}

// Clear all filters
function clearFilters() {
    // Reset filter UI
    $("#filter-container").empty();

    // Add a single empty filter row
    nextFilterId = 2; // Reset ID counter
    addFilterRow();

    // Clear active filters
    activeFilters = [];

    // Clear AG Grid filters
    if (gridApi) {
        gridApi.setFilterModel(null);
    }

    // Update status
    if (gridApi) {
        $("#status").text(`${gridApi.getDisplayedRowCount()} kirjet`);
    }
}

// Export to Excel functionality
function exportToExcel() {
    if (!gridApi) return;

    const params = {
        fileName: 'Suur_Andmetabel_Export.xlsx',
        processCellCallback: function (params) {
            // Clean up cell values if needed
            return params.value;
        }
    };

    gridApi.exportDataAsExcel(params);
}

// Export to PDF functionality (uses browser print with styling)
function exportToPDF() {
    if (!gridApi) return;

    // Create a hidden iframe to handle printing without affecting the current page
    const printFrame = document.createElement('iframe');
    printFrame.style.display = 'none';
    document.body.appendChild(printFrame);

    // Build a new document with just the table data
    const doc = printFrame.contentWindow.document;
    doc.open();

    // Add necessary styles
    doc.write(`
        <!DOCTYPE html>
        <html lang="ee">
        <head>
            <title>Suur Andmetabel - Eksport</title>
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    color: #1e293b;
                    margin: 20px;
                }
                h1 {
                    font-size: 18px;
                    margin-bottom: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background-color: #f1f5f9;
                    padding: 8px;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 2px solid #e2e8f0;
                }
                td {
                    padding: 8px;
                    border-bottom: 1px solid #e2e8f0;
                }
                tr:nth-child(even) {
                    background-color: #f8fafc;
                }
                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>
        <body>
            <h1>Suur Andmetabel - Eksporditud ${new Date().toLocaleString('et-EE')}</h1>
    `);

    // Create table with visible columns and rows
    doc.write('<table>');

    // Table header
    doc.write('<thead><tr>');
    const visibleColumns = gridApi.getAllDisplayedColumns();
    visibleColumns.forEach(column => {
        const headerName = column.getColDef().headerName || column.getColDef().field;
        doc.write(`<th>${headerName}</th>`);
    });
    doc.write('</tr></thead>');

    // Table body
    doc.write('<tbody>');
    gridApi.forEachNodeAfterFilterAndSort(rowNode => {
        doc.write('<tr>');
        visibleColumns.forEach(column => {
            const field = column.getColDef().field;
            const value = rowNode.data[field] || '';
            doc.write(`<td>${value}</td>`);
        });
        doc.write('</tr>');
    });
    doc.write('</tbody></table>');

    doc.write('</body></html>');
    doc.close();

    // Print the document
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();

    // Remove the iframe after printing
    setTimeout(() => {
        document.body.removeChild(printFrame);
    }, 1000);
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

function fetchFilterValues(columnName, searchTerm = '') {
    return $.ajax({
        url: `/api/v1/table/filter-values/${columnName}`,
        method: "GET",
        data: {
            search: searchTerm
        },
        dataType: "json"
    });
}

// Function to save a filter
function saveFilter(name, description, filterModel, isPublic) {
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', description);
    formData.append('filter_model', JSON.stringify(filterModel));
    formData.append('is_public', isPublic);

    return $.ajax({
        url: "/api/v1/table/save-filter",
        method: "POST",
        data: formData,
        processData: false,
        contentType: false
    });
}

// Function to load saved filters
function loadSavedFilters() {
    return $.ajax({
        url: "/api/v1/table/saved-filters",
        method: "GET",
        dataType: "json"
    });
}

// Function to get a specific saved filter
function getSavedFilter(filterId) {
    return $.ajax({
        url: `/api/v1/table/saved-filter/${filterId}`,
        method: "GET",
        dataType: "json"
    });
}

// Function to delete a saved filter
function deleteSavedFilter(filterId) {
    return $.ajax({
        url: `/api/v1/table/saved-filter/${filterId}`,
        method: "DELETE"
    });
}

// Enhanced filter row function
function addEnhancedFilterRow() {
    const nextId = nextFilterId++;
    const newRow = $(`
        <div class="filter-row" data-id="${nextId}">
            <select class="filter-select filter-field" onchange="updateFilterOperators(this)">
                <option value="">Vali veerg...</option>
            </select>

            <select class="filter-select filter-operator" onchange="updateFilterValueInput($(this).closest('.filter-row'))">
                <option value="contains">Sisaldab</option>
                <option value="equals">Võrdub</option>
                <option value="notEqual">Ei võrdu</option>
                <option value="startsWith">Algab</option>
                <option value="endsWith">Lõpeb</option>
                <option value="blank">Tühi</option>
                <option value="notBlank">Mitte tühi</option>
            </select>

            <div class="filter-value-container">
                <input type="text" class="filter-input" placeholder="Filtri väärtus">
            </div>

            <button class="filter-remove-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `);

    $("#filter-container").append(newRow);

    // Add column options to the new filter field
    updateFilterFields();
}

// Function to update filter operators based on selected column type
function updateFilterOperators(fieldSelect) {
    const $row = $(fieldSelect).closest('.filter-row');
    const $operatorSelect = $row.find('.filter-operator');
    const selectedField = $(fieldSelect).val();

    if (!selectedField) return;

    // Find the column definition
    const column = columnDefs.find(col => col.field === selectedField);

    if (!column) return;

    // Clear existing options
    $operatorSelect.empty();

    // Get column type from the column definition
    const colType = column.type || 'string';

    // Define operator options based on column type
    let operators = [];

    if (colType.includes('char') || colType.includes('text')) {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'contains', label: 'Sisaldab'},
            {value: 'notContains', label: 'Ei sisalda'},
            {value: 'startsWith', label: 'Algab'},
            {value: 'endsWith', label: 'Lõpeb'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') || colType.includes('double')) {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'greaterThan', label: 'Suurem kui'},
            {value: 'greaterThanOrEqual', label: 'Suurem või võrdne'},
            {value: 'lessThan', label: 'Väiksem kui'},
            {value: 'lessThanOrEqual', label: 'Väiksem või võrdne'},
            {value: 'inRange', label: 'Vahemikus'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    } else if (colType.includes('date') || colType.includes('timestamp')) {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'greaterThan', label: 'Hiljem kui'},
            {value: 'lessThan', label: 'Varem kui'},
            {value: 'inRange', label: 'Ajavahemikus'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    } else {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    }

    // Add options to select
    operators.forEach(op => {
        $operatorSelect.append(`<option value="${op.value}">${op.label}</option>`);
    });

    // Update value input based on selected column and operator
    updateFilterValueInput($row);
}

// Function to update the value input based on selected column and operator
function updateFilterValueInput($row) {
    const selectedField = $row.find('.filter-field').val();
    const selectedOperator = $row.find('.filter-operator').val();

    if (!selectedField) return;

    // Find the column definition
    const column = columnDefs.find(col => col.field === selectedField);
    if (!column) return;

    const colType = column.type || 'string';
    const $valueContainer = $row.find('.filter-value-container');

    // Clear existing inputs
    $valueContainer.empty();

    // For blank/notBlank operators, no input is needed
    if (selectedOperator === 'blank' || selectedOperator === 'notBlank') {
        $valueContainer.html('<div class="text-gray-400 italic">Väärtust pole vaja</div>');
        return;
    }

    // For inRange operator, we need two inputs
    if (selectedOperator === 'inRange') {
        if (colType.includes('date') || colType.includes('timestamp')) {
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="date" class="filter-input filter-from flex-1" placeholder="Alates">
                    <input type="date" class="filter-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        } else {
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="number" class="filter-input filter-from flex-1" placeholder="Alates">
                    <input type="number" class="filter-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        }
        return;
    }

    // For different column types, create appropriate inputs
    if (colType.includes('date') || colType.includes('timestamp')) {
        $valueContainer.html(`<input type="date" class="filter-input" placeholder="Vali kuupäev">`);
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') || colType.includes('double')) {
        $valueContainer.html(`<input type="number" class="filter-input" placeholder="Sisesta number">`);
    } else {
        // For text fields, use a regular text input
        $valueContainer.html(`<input type="text" class="filter-input" placeholder="Filtri väärtus">`);

        // Optionally fetch values for dropdown if column has few unique values
        fetchFilterValues(selectedField)
            .then(response => {
                if (response.values && response.values.length > 0 && response.values.length <= 100) {
                    // If column has relatively few values, show a datalist for suggestions
                    const datalistId = `datalist-${selectedField.replace(/[^a-zA-Z0-9]/g, '-')}`;

                    let html = `<input type="text" class="filter-input" placeholder="Filtri väärtus" list="${datalistId}">`;
                    html += `<datalist id="${datalistId}">`;

                    response.values.forEach(value => {
                        if (value !== null && value !== '') {
                            html += `<option value="${value}">`;
                        }
                    });

                    html += '</datalist>';
                    $valueContainer.html(html);
                }
            })
            .catch(error => {
                console.error("Error loading filter values:", error);
            });
    }
}

// Enhanced apply filters function
function applyEnhancedFilters() {
    console.log("Applying filters");

    // Create a simple object to hold our filters
    let filterModel = {};

    // Process each filter row
    $(".filter-row").each(function () {
        const field = $(this).find(".filter-field").val();
        if (!field) return; // Skip incomplete filters

        const operator = $(this).find(".filter-operator").val();
        let value;

        // Handle different filter types
        if (operator === 'blank') {
            // For blank fields
            filterModel[field] = {
                filterType: 'text',
                type: 'blank'
            };
            return;
        } else if (operator === 'notBlank') {
            // For not blank fields
            filterModel[field] = {
                filterType: 'text',
                type: 'notBlank'
            };
            return;
        } else if (operator === 'inRange') {
            // For range filters
            const fromValue = $(this).find(".filter-from").val();
            const toValue = $(this).find(".filter-to").val();

            if (!fromValue && !toValue) return; // Skip empty ranges

            filterModel[field] = {
                filterType: 'number',
                type: 'inRange',
                filter: {
                    from: fromValue || null,
                    to: toValue || null
                }
            };
            return;
        }

        // For standard filters
        value = $(this).find(".filter-input").val();
        if (!value && operator !== 'blank' && operator !== 'notBlank') return; // Skip empty values

        // Map operators to AG Grid format
        let agGridType;
        switch (operator) {
            case 'contains':
                agGridType = 'contains';
                break;
            case 'equals':
                agGridType = 'equals';
                break;
            case 'notEqual':
                agGridType = 'notEqual';
                break;
            case 'startsWith':
                agGridType = 'startsWith';
                break;
            case 'endsWith':
                agGridType = 'endsWith';
                break;
            case 'greaterThan':
                agGridType = 'greaterThan';
                break;
            case 'greaterThanOrEqual':
                agGridType = 'greaterThanOrEqual';
                break;
            case 'lessThan':
                agGridType = 'lessThan';
                break;
            case 'lessThanOrEqual':
                agGridType = 'lessThanOrEqual';
                break;
            default:
                agGridType = 'equals';
        }

        // Create the filter object
        filterModel[field] = {
            filterType: operator.includes('greater') || operator.includes('less') ? 'number' : 'text',
            type: agGridType,
            filter: value
        };
    });

    console.log("Filter model:", JSON.stringify(filterModel));

    // Apply the filter model directly
    if (gridApi) {
        try {
            gridApi.setFilterModel(filterModel);

            // Force a refresh with timestamp for cache invalidation
            gridApi.refreshInfiniteCache();

            // Update status text
            setTimeout(() => {
                const count = gridApi.getDisplayedRowCount();
                $("#status").text(`Filtreeritud: ${count} kirjet`);
            }, 500);

        } catch (err) {
            console.error("Error applying filters:", err);
            showToast("Viga", "Filtrite rakendamisel tekkis viga", "error");
        }
    }

    // Close the filter panel if checkbox is checked
    if ($("#auto-close-filters").prop("checked")) {
        $("#filter-panel").removeClass("show");
    }
}

// Helper function to get filter type for AG Grid
function getFilterType(operator) {
    // Check for text-based operators
    if (operator === 'contains' || operator === 'notContains' ||
        operator === 'startsWith' || operator === 'endsWith' ||
        operator === 'equals' || operator === 'notEqual' ||
        operator === 'blank' || operator === 'notBlank') {
        return 'text';
    }

    // Check for number-based operators
    else if (operator === 'greaterThan' || operator === 'greaterThanOrEqual' ||
        operator === 'lessThan' || operator === 'lessThanOrEqual' ||
        operator === 'inRange') {
        return 'number';
    }

    // Default to text for unknown operators
    else {
        console.warn(`Unknown operator: ${operator}, defaulting to text`);
        return 'text';
    }
}


function clearFilters() {
    // Reset filter UI
    $("#filter-container").empty();

    // Add a single empty filter row
    nextFilterId = 2; // Reset ID counter
    addEnhancedFilterRow();

    // Clear active filters
    activeFilters = [];

    // Clear AG Grid filters
    if (gridApi) {
        gridApi.setFilterModel(null);
        gridApi.refreshInfiniteCache();
    }

    // Update status
    if (gridApi) {
        const displayedRowCount = gridApi.getDisplayedRowCount();
        $("#status").text(`${displayedRowCount} kirjet`);
    }

    // Show confirmation
    showToast("Filtrid lähtestatud", "Kõik filtrid on eemaldatud", "info");
}

// Make sure the clearFilters function is properly connected to the button
document.addEventListener("DOMContentLoaded", function () {
    // Ensure the clear filters button is connected
    $("#clear-filters").off('click').on('click', function () {
        clearFilters();
    });
});


// Show save filter modal
function showSaveFilterModal() {
    // Get current filter settings
    if (activeFilters.length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Clear form
    $("#filter-name").val("");
    $("#filter-description").val("");
    $("#filter-public").prop("checked", false);

    // Show modal
    $("#save-filter-modal").removeClass("hidden");
}

// Process saving a filter
function processSaveFilter() {
    const name = $("#filter-name").val().trim();
    const description = $("#filter-description").val().trim();
    const isPublic = $("#filter-public").prop("checked");

    // Validate inputs
    if (!name) {
        showToast("Nõutud väli puudub", "Palun sisestage filtri nimi", "error");
        return;
    }

    if (activeFilters.length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Get current filter model
    const filterModel = gridApi.getFilterModel();

    // Show loading indicator
    $("#save-filter-button").html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvestamine...');
    $("#save-filter-button").prop("disabled", true);

    // Call API to save filter
    saveFilter(name, description, filterModel, isPublic)
        .then(response => {
            // Hide modal
            $("#save-filter-modal").addClass("hidden");

            // Show success message
            showToast("Filter salvestatud", `Filter "${name}" edukalt salvestatud`, "success");

            // Refresh filters list
            loadSavedFiltersList();
        })
        .catch(error => {
            console.error("Error saving filter:", error);
            showToast("Viga filtri salvestamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
        })
        .finally(() => {
            // Reset button
            $("#save-filter-button").html('<i class="fas fa-save mr-2"></i> Salvesta filter');
            $("#save-filter-button").prop("disabled", false);
        });
}

// Load saved filters into dropdown
function loadSavedFiltersList() {
    // Clear existing items
    $("#saved-filters-list").empty();
    $("#saved-filters-menu").empty();

    // Show loading indicator
    $("#saved-filters-list").html('<div class="p-4 text-center"><i class="fas fa-spinner fa-spin mr-2"></i> Laadimine...</div>');

    // Load filters from server
    loadSavedFilters()
        .then(response => {
            const filters = response.filters || [];

            // Check if we have any filters
            if (filters.length === 0) {
                $("#saved-filters-list").html('<div class="p-4 text-center text-gray-500">Salvestatud filtreid pole</div>');
                return;
            }

            // Clear loading indicator
            $("#saved-filters-list").empty();

            // Add filters to the list
            filters.forEach(filter => {
                // Add to filter panel list
                const listItem = $(`
                    <div class="saved-filter-item flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <div>
                            <div class="font-medium">${filter.name}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">${filter.description || ''}</div>
                        </div>
                        <div class="flex gap-2">
                            <button class="apply-filter-btn text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" data-id="${filter.id}" title="Rakenda filter">
                                <i class="fas fa-check"></i>
                            </button>
                            ${filter.is_owner ? `
                                <button class="delete-filter-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" data-id="${filter.id}" title="Kustuta filter">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `);

                $("#saved-filters-list").append(listItem);

                // Also add to toolbar dropdown menu
                $("#saved-filters-menu").append(`
                    <div class="dropdown-item apply-saved-filter" data-id="${filter.id}">
                        <i class="fas fa-filter"></i>
                        <span>${filter.name}</span>
                    </div>
                `);
            });

            // Handle apply filter button clicks
            $(".apply-filter-btn, .apply-saved-filter").click(function () {
                const filterId = $(this).data("id");
                applySavedFilter(filterId);
            });

            // Handle delete filter button clicks
            $(".delete-filter-btn").click(function () {
                const filterId = $(this).data("id");
                const filterName = $(this).closest(".saved-filter-item").find(".font-medium").text();
                confirmDeleteFilter(filterId, filterName);
            });
        })
        .catch(error => {
            console.error("Error loading saved filters:", error);
            $("#saved-filters-list").html('<div class="p-4 text-center text-red-500">Viga filtrite laadimisel</div>');
        });
}

// Apply a saved filter
function applySavedFilter(filterId) {
    // Show loading indicator
    $("#status").html('<i class="fas fa-spinner fa-spin mr-2"></i> Filtri rakendamine...');

    // Get filter details
    getSavedFilter(filterId)
        .then(response => {
            try {
                // Parse filter model
                const filterModel = JSON.parse(response.filter_model);

                // Apply to AG Grid
                if (gridApi) {
                    gridApi.setFilterModel(filterModel);
                }

                // Update status and show success message
                showToast("Filter rakendatud", `Filter "${response.name}" edukalt rakendatud`, "success");

                // Close filter panel if open
                if ($("#filter-panel").hasClass("show")) {
                    $("#filter-panel").removeClass("show");
                }

                // Close dropdown
                $("#filters-dropdown-menu").removeClass("show");
            } catch (e) {
                console.error("Error parsing filter model:", e);
                showToast("Viga filtri rakendamisel", "Vigane filtri formaat", "error");
            }
        })
        .catch(error => {
            console.error("Error applying filter:", error);
            showToast("Viga filtri rakendamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
        })
        .finally(() => {
            // Reset status
            updateStatus();
        });
}

// Confirm delete filter
function confirmDeleteFilter(filterId, filterName) {
    if (confirm(`Kas olete kindel, et soovite kustutada filtri "${filterName}"?`)) {
        deleteSavedFilter(filterId)
            .then(response => {
                showToast("Filter kustutatud", `Filter "${filterName}" edukalt kustutatud`, "success");
                loadSavedFiltersList();
            })
            .catch(error => {
                console.error("Error deleting filter:", error);
                showToast("Viga filtri kustutamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
            });
    }
}

// Update status text
function updateStatus() {
    if (!gridApi) return;

    const displayedRowCount = gridApi.getDisplayedRowCount();
    const totalRowCount = gridApi.getInfiniteRowCount();

    const filterModel = gridApi.getFilterModel();
    const isFiltered = filterModel && Object.keys(filterModel).length > 0;

    $("#status").text(isFiltered ?
        `Filtreeritud: ${displayedRowCount} kirjet ${totalRowCount ? 'kokku ' + totalRowCount : ''}` :
        `${displayedRowCount} kirjet`);
}

// Set up event handlers
function setupEventHandlers() {
    // Search with debounce
    const debouncedSearch = debounce(performSearch, 300);

    $("#search-button").click(performSearch);
    $("#search-input").on('input', debouncedSearch);

    // Reset search
    $("#reset-button").click(resetSearch);

    // Enter key in search input
    $("#search-input").keypress(function (e) {
        if (e.which == 13) { // Enter key
            performSearch();
        }
    });

    $("#keyboard-shortcuts").click(function () {
        alert(
            "Keyboard Shortcuts:\n\n" +
            "Alt + H: Toggle UI elements (hide/show app bar and toolbar)\n" +
            "Ctrl + F: Focus search box\n" +
            "Esc: Close any open dropdown\n" +
            "F5 or Ctrl + R: Refresh data"
        );
        $("#settings-dropdown-menu").removeClass("show");
    });

    $(document).on('DOMNodeInserted', function (e) {
        if ($(e.target).hasClass('toast-notification') ||
            $(e.target).hasClass('dropdown-menu') ||
            $(e.target).hasClass('filter-row')) {
            updateDynamicElements();
        }
    });

    // Export functionality
    $("#export-excel").click(function () {
        exportToExcel();
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#export-pdf").click(function () {
        exportToPDF();
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#filter-toggle").click(function () {
        $("#filter-panel").toggleClass("show");

        // If showing, update filter field dropdowns with column options
        if ($("#filter-panel").hasClass("show")) {
            updateFilterFields();

            // Load saved filters
            loadSavedFiltersList();
        }

        // Adjust table container height after toggling filter panel
        setTimeout(resizeTableContainer, 100);
    });

// Replace the old add filter row handler with the enhanced one
    $("#add-filter-row").click(function () {
        addEnhancedFilterRow();
    });

// Replace the old apply filters handler with the enhanced one
    $("#apply-filters").click(function () {
        applyEnhancedFilters();
    });

// Handle save filter button
    $("#save-filter").click(function () {
        showSaveFilterModal();
    });

// Add save filter modal buttons
    $("#save-filter-button").click(function () {
        processSaveFilter();
    });

    $("#cancel-save-filter").click(function () {
        $("#save-filter-modal").addClass("hidden");
    });

// Close save filter modal when clicking outside
    $("#save-filter-modal-backdrop").click(function () {
        $("#save-filter-modal").addClass("hidden");
    });

// Prevent closing when clicking on modal content
    $("#save-filter-modal .modal-content").click(function (e) {
        e.stopPropagation();
    });

    $("#virtual-file").click(function () {
        alert("Funktsioon 'Virtuaaltoimik' on arendamisel.");
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#receipts-report").click(function () {
        alert("Funktsioon 'Laekumiste aruanne' on arendamisel.");
        $("#tools-dropdown-menu").removeClass("show");
    });

    // Settings buttons
    $("#toggle-columns").click(function () {
        showColumnVisibilityModal();
        $("#settings-dropdown-menu").removeClass("show");
    });

    $("#save-column-layout").click(function () {
        alert("Veergude paigutuse salvestamine on arendamisel.");
        $("#settings-dropdown-menu").removeClass("show");
    });

    // Toggle dark mode
    $("#toggle-dark-mode").click(function () {
        // Toggle state
        isDarkMode = !isDarkMode;

        // Apply theme change
        updateTheme();

        // Close dropdown
        $("#settings-dropdown-menu").removeClass("show");

        // Show confirmation with appropriate icon/colors
        const modeText = isDarkMode ? "Tume režiim" : "Hele režiim";
        const modeIcon = isDarkMode ? "fa-moon" : "fa-sun";

        showToast(
            `${modeText} aktiveeritud`,
            `Rakendus on nüüd ${isDarkMode ? "tume" : "hele"} režiimis`,
            isDarkMode ? "info" : "success"
        );
    });

    // Widget buttons
    $("#save-view").click(function () {
        alert("Funktsioon 'Salvesta vaade' on arendamisel.");
        $("#widgets-dropdown-menu").removeClass("show");
    });

    $("#load-view").click(function () {
        alert("Funktsioon 'Lae vaade' on arendamisel.");
        $("#widgets-dropdown-menu").removeClass("show");
    });

    // Column visibility modal
    $("#close-column-modal, #column-modal-backdrop, #cancel-column-changes").click(function () {
        $("#column-modal").addClass("hidden");
    });

    $("#apply-column-changes").click(function () {
        applyColumnVisibility();
        $("#column-modal").addClass("hidden");
    });

    $("#toggle-ui-btn").click(function () {
        toggleUIElements();
    });

    $("#open-filter-panel").click(function () {
        $("#filter-panel").addClass("show");
        $("#filters-dropdown-menu").removeClass("show");

        // If showing, update filter field dropdowns with column options
        updateFilterFields();

        // Load saved filters
        loadSavedFiltersList();

        // Adjust table container height after toggling filter panel
        setTimeout(resizeTableContainer, 100);
    });

    // Keyboard shortcut (Alt+H) to toggle UI
    $(document).keydown(function (e) {
        // Alt + H to toggle UI
        if (e.altKey && e.keyCode === 72) {
            toggleUIElements();
            e.preventDefault();
        }

        // Ctrl + F to focus search
        if (e.ctrlKey && e.keyCode === 70) {
            $("#search-input").focus();
            e.preventDefault();
        }

        // Esc to close dropdowns
        if (e.keyCode === 27) {
            $(".dropdown-menu").removeClass("show");
        }

        // F5 or Ctrl + R to refresh data
        if (e.keyCode === 116 || (e.ctrlKey && e.keyCode === 82)) {
            refreshData();
            e.preventDefault();
        }
    });
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