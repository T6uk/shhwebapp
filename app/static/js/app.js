// Global variables
let gridApi = null;
let columnDefs = [];
let searchTerm = '';
let currentFontSize = 14;
let isDarkMode = false;
let isCompactMode = false;
let activeFilters = [];
let nextFilterId = 2; // Start at 2 since we have one filter row by default
let columnVisibility = {}; // To track which columns are visible

let userPermissions = {
    can_edit: false,
    is_admin: false,
    edit_mode_active: false
};

let editHistory = []; // Track edit history for undo
const MAX_UNDO_HISTORY = 50; // Maximum number of undo steps to keep

// Initialize when document is ready
$(document).ready(function () {
    // Set the initial table container height
    resizeTableContainer();
    setupAdminNavigation();

    // Initial permissions - will be updated once we get actual permissions
    userPermissions = {
        can_edit: false,
        is_admin: false,
        edit_mode_active: false
    };

    // Check for edit mode token in cookies - correct way
    userPermissions.edit_mode_active = hasValidEditToken();
    console.log("Initial edit mode status:", userPermissions.edit_mode_active);

    getUserPermissions();

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
});

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
        {toggle: "#links-dropdown-toggle", menu: "#links-dropdown-menu"}
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
function resizeTableContainer() {
    const windowHeight = $(window).height();
    const headerHeight = $(".app-bar").outerHeight(true);
    const toolbarHeight = $(".toolbar").parent().outerHeight(true);
    const filterPanelHeight = $("#filter-panel").hasClass("show") ? $("#filter-panel").outerHeight(true) : 0;
    const padding = 40; // Allow for some padding

    const tableHeight = windowHeight - headerHeight - toolbarHeight - filterPanelHeight - padding;
    $("#table-container").css("height", tableHeight + "px");
}


function getUserPermissions() {
    $.ajax({
        url: "/auth/permissions",
        method: "GET",
        dataType: "json",
        success: function (response) {
            userPermissions.can_edit = response.can_edit;
            userPermissions.is_admin = response.is_admin;

            // Preserve the token status we already detected
            const hasToken = hasValidEditToken();

            // Only set edit_mode_active if token exists
            userPermissions.edit_mode_active = hasToken;

            console.log("User permissions loaded:", userPermissions);
            console.log("Edit token present:", hasToken);

            // Update UI based on permissions
            $(document).trigger('permissionsLoaded');

            // Refresh grid if already initialized
            if (gridApi && userPermissions.edit_mode_active) {
                console.log("Refreshing grid after loading permissions");
                gridApi.refreshCells({force: true});
            }
        },
        error: function (xhr) {
            console.log("Failed to get user permissions");
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
                        tooltipField: col.field,
                        // Make editable if column supports it and user has permission
                        editable: function (params) {
                            // Debug logging to see why editing isn't enabled
                            console.log("Checking editable for field:", col.field,
                                "can_edit:", userPermissions.can_edit,
                                "is_admin:", userPermissions.is_admin,
                                "edit_mode_active:", userPermissions.edit_mode_active,
                                "col.editable:", col.editable);

                            return userPermissions.edit_mode_active &&
                                (userPermissions.can_edit || userPermissions.is_admin) &&
                                col.editable === true;
                        },
                        // Add cell editing for editable fields
                        cellStyle: function (params) {
                            if (userPermissions.edit_mode_active &&
                                (userPermissions.can_edit || userPermissions.is_admin) &&
                                col.editable === true) {
                                return {backgroundColor: '#f0f9ff'};  // Light blue background for editable cells
                            }
                            return null;
                        },
                        // Add cell class to show which cells are editable when edit mode is active
                        cellClass: function (params) {
                            if (userPermissions.edit_mode_active &&
                                (userPermissions.can_edit || userPermissions.is_admin) &&
                                col.editable === true) {
                                return 'editable-active';
                            }
                            return '';
                        }
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
            // Configure default editor settings
            editable: false, // By default, columns are not editable
            cellEditor: 'agTextCellEditor', // Default editor
            cellEditorParams: {
                // Enable any needed configurations for the editor
                useFormatter: true
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
        // Editing settings
        stopEditingWhenCellsLoseFocus: true,
        enterMovesDown: false, // Don't move down on Enter
        // Event handlers
        onFirstDataRendered: onFirstDataRendered,
        onGridReady: onGridReady,
        onFilterChanged: onFilterChanged,
        onSortChanged: onSortChanged,
        // Add cell editing event handlers
        onCellValueChanged: onCellValueChanged,
        // Add editing option for cell double-click
        onCellDoubleClicked: onCellDoubleClicked,
        // Add event to handle edit errors
        onCellEditingStarted: function (event) {
            console.log('Cell editing started:', event);
        },
        onCellEditingStopped: function (event) {
            console.log('Cell editing stopped:', event);
        }
    };

    // Create the grid
    new agGrid.Grid(document.getElementById('data-table'), gridOptions);
}

// Add a function to handle cell value changes
function onCellValueChanged(params) {
    // Only process if we have permission to edit
    if ((!userPermissions.can_edit && !userPermissions.is_admin) || !userPermissions.edit_mode_active) {
        console.log("Cell edit rejected - no permissions");
        return;
    }

    // Check if edit token exists
    if (!hasValidEditToken()) {
        console.log("Cell edit rejected - no edit token");
        showNotification("Muutmise režiim pole aktiivne. Palun sisestage oma parool muutmiseks.", "error");

        // Reset permissions
        userPermissions.edit_mode_active = false;
        updateEditModeIndicator();

        // Refresh cell to original value
        params.api.refreshCells({
            rowNodes: [params.node],
            columns: [params.colDef.field],
            force: true
        });

        // Show edit mode dialog
        setTimeout(showEditModeModal, 500);
        return;
    }

    const field = params.colDef.field;
    const rowId = params.data.id;
    const newValue = params.newValue;
    const oldValue = params.oldValue;

    // Skip if no change
    if (newValue === oldValue) {
        return;
    }

    // Add to undo history
    editHistory.push({
        field: field,
        rowId: rowId,
        oldValue: oldValue,
        newValue: newValue,
        timestamp: new Date()
    });

    // Cap the history size
    if (editHistory.length > MAX_UNDO_HISTORY) {
        editHistory.shift(); // Remove oldest edit
    }

    // Show loading indicator for the cell
    params.api.showLoadingOverlay();

    // Send update to server
    $.ajax({
        url: "/api/v1/table/cell",
        method: "PUT",
        data: {
            field: field,
            row_id: rowId,
            value: newValue
        },
        dataType: "json",
        success: function (response) {
            // Success - update the cell
            params.api.hideOverlay();

            // Show a brief success indicator
            const flashCellParams = {
                rowNodes: [params.node],
                columns: [field],
                flashDelay: 2000,
                fadeDelay: 500
            };
            params.api.flashCells(flashCellParams);

            // Show notification with undo option
            const notificationId = showNotification(
                `<div>Value changed. <button id="undo-btn-${rowId}-${field}" class="text-blue-500 hover:text-blue-700 font-medium">Undo</button></div>`,
                "success",
                8000
            );

            // Add click handler for undo button
            setTimeout(() => {
                $(`#undo-btn-${rowId}-${field}`).on("click", function() {
                    undoLastEdit();
                    $(`#${notificationId}`).remove();
                });
            }, 100);
        },
        error: function (xhr, status, error) {
            // Error - revert the change
            params.api.hideOverlay();

            let errorMsg = "Viga salvestamisel";

            try {
                // Try to parse error response
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;

                    // Check for edit mode errors
                    if (errorMsg.includes("Edit mode") || errorMsg.includes("edit")) {
                        // Reset edit mode status
                        userPermissions.edit_mode_active = false;
                        updateEditModeIndicator();

                        // Show edit mode dialog after a brief delay
                        setTimeout(showEditModeModal, 500);
                    }
                }
            } catch (e) {
                console.error("Error parsing error response:", e);
            }

            // Show error message
            showNotification(errorMsg, "error");

            // Remove the failed edit from history
            editHistory = editHistory.filter(edit =>
                !(edit.field === field && edit.rowId === rowId && edit.newValue === newValue)
            );

            // Refresh the cell to revert the change
            params.api.refreshCells({
                rowNodes: [params.node],
                columns: [field],
                force: true
            });
        }
    });
}


function showEditModeModal() {
    $("#edit-mode-modal").removeClass("hidden");
    $("#edit-password").val("").focus();
    $("#edit-mode-error").addClass("hidden");

    // Add visual cue that we're entering edit mode
    $("#loading-overlay").addClass("bg-yellow-100");
    setTimeout(() => {
        $("#loading-overlay").removeClass("bg-yellow-100");
    }, 300);
}

function showNotification(message, type = "info", duration = 5000) {
    const notificationId = "notification-" + Date.now();
    const notification = $(`
        <div id="${notificationId}" class="fixed top-4 right-4 max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50 notification">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <i class="fas ${type === 'success' ? 'fa-check-circle text-green-500' :
        type === 'error' ? 'fa-exclamation-circle text-red-500' :
            'fa-info-circle text-blue-500'}"></i>
                </div>
                <div class="ml-3 w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${message}</p>
                </div>
                <div class="ml-4 flex-shrink-0 flex">
                    <button class="notification-close">
                        <i class="fas fa-times text-gray-400 hover:text-gray-500"></i>
                    </button>
                </div>
            </div>
        </div>
    `);

    $("body").append(notification);

    // Add click handler for close button
    notification.find(".notification-close").on("click", function () {
        notification.remove();
    });

    // Auto-remove after specified duration
    setTimeout(function () {
        notification.fadeOut(300, function () {
            notification.remove();
        });
    }, duration);

    return notificationId;
}

function undoLastEdit() {
    if (editHistory.length === 0) {
        showNotification("Nothing to undo", "info");
        return;
    }

    const lastEdit = editHistory.pop();

    // Show loading overlay
    if (gridApi) {
        gridApi.showLoadingOverlay();
    }

    // Send request to update cell with original value
    $.ajax({
        url: "/api/v1/table/cell",
        method: "PUT",
        data: {
            field: lastEdit.field,
            row_id: lastEdit.rowId,
            value: lastEdit.oldValue
        },
        success: function (response) {
            if (gridApi) {
                gridApi.hideOverlay();

                // Find the row node
                const rowNode = gridApi.getRowNode(lastEdit.rowId);

                if (rowNode) {
                    // Update the cell value in the grid
                    rowNode.setDataValue(lastEdit.field, lastEdit.oldValue);

                    // Flash the cell to indicate change
                    gridApi.flashCells({
                        rowNodes: [rowNode],
                        columns: [lastEdit.field],
                        flashDelay: 2000,
                        fadeDelay: 500
                    });
                } else {
                    // If we can't find the row, refresh the whole grid
                    gridApi.refreshInfiniteCache();
                }
            }

            showNotification("Edit undone successfully", "success");
        },
        error: function (xhr) {
            if (gridApi) {
                gridApi.hideOverlay();
            }

            let errorMsg = "Error undoing edit";
            if (xhr.responseJSON && xhr.responseJSON.detail) {
                errorMsg = xhr.responseJSON.detail;
            }

            showNotification(errorMsg, "error");
        }
    });
}

// Add a function to handle edit mode activation
function activateEditMode() {
    const password = $("#edit-password").val();

    if (!password) {
        $("#edit-mode-error").text("Palun sisestage parool").removeClass("hidden");
        return;
    }

    // Show loading indicator
    const loadingButton = $("#activate-edit-mode");
    const originalText = loadingButton.html();
    loadingButton.html('<i class="fas fa-spinner fa-spin"></i> Aktiveerimine...');
    loadingButton.prop('disabled', true);

    $.ajax({
        url: "/auth/toggle-edit-mode",
        method: "POST",
        data: {
            password: password,
            csrf_token: getCsrfToken()
        },
        success: function (response) {
            console.log("Edit mode activation successful:", response);

            // Close the modal
            $("#edit-mode-modal").addClass("hidden");

            // Verify the token was actually set in cookies
            setTimeout(() => {
                const hasToken = hasValidEditToken();
                console.log("Token verification after activation:", hasToken);

                if (hasToken) {
                    // Update user permissions
                    userPermissions.edit_mode_active = true;

                    // Clear undo history when starting a new edit session
                    editHistory = [];

                    // Change the edit indicator to show active edit mode
                    updateEditModeIndicator();

                    // Refresh the grid to apply new editing capabilities
                    console.log("Edit mode activated, refreshing grid");
                    if (gridApi) {
                        // Force a complete refresh
                        gridApi.refreshCells({force: true});
                    }

                    // Add undo button to toolbar if not present
                    addUndoButton();

                    // Show a notification
                    showNotification("Muutmise režiim on aktiveeritud 30 minutiks", "success");
                } else {
                    showNotification("Muutmise režiimi aktiveerimine ebaõnnestus. Palun proovige uuesti.", "error");
                }
            }, 100);
        },
        error: function (xhr) {
            let errorMsg = "Aktiveerimine ebaõnnestus";
            if (xhr.responseJSON && xhr.responseJSON.detail) {
                errorMsg = xhr.responseJSON.detail;
            }
            $("#edit-mode-error").text(errorMsg).removeClass("hidden");

            // Reset button
            loadingButton.html(originalText);
            loadingButton.prop('disabled', false);
        }
    });
}

function setupEditModeTimer() {
    if (userPermissions.edit_mode_active) {
        const THIRTY_MINUTES = 30 * 60 * 1000;

        // Get the edit token expiration time
        const editTokenCookie = document.cookie.match(/edit_token=([^;]*)/);
        if (editTokenCookie) {
            // Set a timeout to warn user before expiration
            setTimeout(() => {
                if (userPermissions.edit_mode_active) {
                    showNotification(
                        "Muutmise režiim aegub peagi. Soovitame salvestada oma muudatused.",
                        "info",
                        10000
                    );
                }
            }, THIRTY_MINUTES - (2 * 60 * 1000)); // 2 minutes before expiration

            // Set a timeout to disable edit mode
            setTimeout(() => {
                if (userPermissions.edit_mode_active) {
                    userPermissions.edit_mode_active = false;
                    updateEditModeIndicator();

                    // Remove undo button
                    $("#undo-edit-button").remove();

                    // Refresh the grid
                    if (gridApi) {
                        gridApi.refreshCells({force: true});
                    }

                    showNotification("Muutmise režiim on aegunud. Sisestage uuesti parool, et jätkata muutmist.", "info");
                }
            }, THIRTY_MINUTES);
        }
    }
}


// Helper function to get CSRF token
function getCsrfToken() {
    return document.cookie.replace(/(?:(?:^|.*;\s*)csrf_token\s*\=\s*([^;]*).*$)|^.*$/, "$1");
}

// Add a notification function
function showNotification(message, type = "info") {
    const notification = $(`
        <div class="fixed top-4 right-4 max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50 notification">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <i class="fas ${type === 'success' ? 'fa-check-circle text-green-500' : 'fa-info-circle text-blue-500'}"></i>
                </div>
                <div class="ml-3 w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${message}</p>
                </div>
                <div class="ml-4 flex-shrink-0 flex">
                    <button class="notification-close">
                        <i class="fas fa-times text-gray-400 hover:text-gray-500"></i>
                    </button>
                </div>
            </div>
        </div>
    `);

    $("body").append(notification);

    // Add click handler for close button
    notification.find(".notification-close").on("click", function () {
        notification.remove();
    });

    // Auto-remove after 5 seconds
    setTimeout(function () {
        notification.fadeOut(300, function () {
            notification.remove();
        });
    }, 5000);
}


// Add a function to handle cell double-click for editing
function onCellDoubleClicked(params) {
    console.log("Cell double-clicked:", params.colDef.field);
    console.log("Edit permissions:", userPermissions);

    // If user doesn't have edit permission, don't proceed
    if (!userPermissions.can_edit && !userPermissions.is_admin) {
        console.log("User doesn't have edit permissions");
        return;
    }

    // If edit mode is not active, show the password modal
    if (!userPermissions.edit_mode_active) {
        console.log("Edit mode not active, showing password modal");
        showEditModeModal();
        return;
    }

    // Check if the column is editable
    const colDef = params.colDef;
    const isEditable = colDef.editable ?
        (typeof colDef.editable === 'function' ? colDef.editable(params) : colDef.editable)
        : false;

    console.log("Is cell editable:", isEditable);

    if (isEditable) {
        // Start editing the cell
        console.log("Starting cell edit...");
        params.api.startEditingCell({
            rowIndex: params.rowIndex,
            colKey: params.column.getId()
        });
    } else {
        console.log("Cell is not editable");
    }
}

// Handle grid ready event
function onGridReady(params) {
    gridApi = params.api;

    // Set a datasource for infinite scrolling
    const dataSource = {
        getRows: function (params) {
            console.log('Asking for ' + params.startRow + ' to ' + params.endRow);

            // Show loading indicator for initial load
            if (params.startRow === 0) {
                $("#loading-overlay").show();
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
            }

            // Add search term if present
            if (searchTerm) {
                queryParams.search = searchTerm;
            }

            // Add filters if present
            if (params.filterModel && Object.keys(params.filterModel).length > 0) {
                queryParams.filter_model = JSON.stringify(params.filterModel);
            }

            $.ajax({
                url: "/api/v1/table/data",
                method: "GET",
                data: queryParams,
                dataType: "json",
                success: function (response) {
                    // Update status
                    $("#status").text(response.rowCount + " kirjet");

                    // Check if we have more rows
                    const lastRow = response.rowCount <= response.endRow ? response.rowCount : -1;

                    // Provide the data to the grid
                    params.successCallback(response.rowData, lastRow);

                    // Hide loading overlay
                    $("#loading-overlay").hide();
                },
                error: function (xhr, status, error) {
                    console.error("Error loading data:", error);
                    $("#status").text("Viga: " + error);
                    params.failCallback();
                    $("#loading-overlay").hide();
                }
            });
        }
    };

    // Set the datasource
    gridApi.setDatasource(dataSource);

    // Fit columns to available width
    setTimeout(function () {
        gridApi.sizeColumnsToFit();
    }, 100);

    // Update theme if dark mode is active
    if (isDarkMode) {
        updateTheme();
    }

    // Update font size
    updateFontSize();
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
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        $("body").addClass("bg-gray-900").removeClass("bg-gray-50");
        $(".card, .dropdown-menu, .loading-card, .filter-panel").addClass("bg-gray-800 border-gray-700").removeClass("bg-white border-gray-100");
        $(".input-control, .filter-select, .filter-input").addClass("bg-gray-700 border-gray-600 text-white").removeClass("bg-white border-gray-200");
        $(".btn-secondary").addClass("bg-gray-700 text-gray-200 border-gray-600").removeClass("bg-white text-gray-700 border-gray-200");
        $(".dropdown-item, .dropdown-title, .dropdown-section-title, .filter-group-title").addClass("text-gray-300").removeClass("text-gray-700");
        $(".dropdown-divider").addClass("bg-gray-700").removeClass("bg-gray-200");
        $(".status-chip").addClass("bg-gray-700 text-gray-300").removeClass("bg-gray-100 text-gray-600");
        $(".dropdown-button, .quick-link").addClass("bg-gray-700 text-gray-300").removeClass("bg-gray-100 text-gray-700");
    } else {
        document.body.classList.remove('dark-mode');
        $("body").addClass("bg-gray-50").removeClass("bg-gray-900");
        $(".card, .dropdown-menu, .loading-card, .filter-panel").addClass("bg-white border-gray-100").removeClass("bg-gray-800 border-gray-700");
        $(".input-control, .filter-select, .filter-input").addClass("bg-white border-gray-200 text-gray-900").removeClass("bg-gray-700 border-gray-600 text-white");
        $(".btn-secondary").addClass("bg-white text-gray-700 border-gray-200").removeClass("bg-gray-700 text-gray-200 border-gray-600");
        $(".dropdown-item, .dropdown-title, .dropdown-section-title, .filter-group-title").addClass("text-gray-700").removeClass("text-gray-300");
        $(".dropdown-divider").addClass("bg-gray-200").removeClass("bg-gray-700");
        $(".status-chip").addClass("bg-gray-100 text-gray-600").removeClass("bg-gray-700 text-gray-300");
        $(".dropdown-button, .quick-link").addClass("bg-gray-100 text-gray-700").removeClass("bg-gray-700 text-gray-300");
    }

    if (gridApi) {
        gridApi.refreshCells({force: true});
    }
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

    $(".filter-row").each(function () {
        const field = $(this).find(".filter-field").val();
        const operator = $(this).find(".filter-operator").val();
        const value = $(this).find(".filter-input").val();

        // Only add if a field is selected and has a value
        if (field && value) {
            activeFilters.push({
                field: field,
                operator: operator,
                value: value
            });
        }
    });

    // Apply filters to AG Grid
    if (gridApi && activeFilters.length > 0) {
        const model = {};

        activeFilters.forEach(function (filter) {
            let filterModel;

            switch (filter.operator) {
                case "contains":
                    filterModel = {
                        filterType: 'text',
                        type: 'contains',
                        filter: filter.value
                    };
                    break;
                case "equals":
                    filterModel = {
                        filterType: 'text',
                        type: 'equals',
                        filter: filter.value
                    };
                    break;
                case "starts":
                    filterModel = {
                        filterType: 'text',
                        type: 'startsWith',
                        filter: filter.value
                    };
                    break;
                case "ends":
                    filterModel = {
                        filterType: 'text',
                        type: 'endsWith',
                        filter: filter.value
                    };
                    break;
                case "greater":
                    filterModel = {
                        filterType: 'number',
                        type: 'greaterThan',
                        filter: parseFloat(filter.value)
                    };
                    break;
                case "less":
                    filterModel = {
                        filterType: 'number',
                        type: 'lessThan',
                        filter: parseFloat(filter.value)
                    };
                    break;
            }

            model[filter.field] = filterModel;
        });

        gridApi.setFilterModel(model);
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

function showEditHistory() {
    if (editHistory.length === 0) {
        showNotification("No edit history to display", "info");
        return;
    }

    // Populate the history list
    const historyList = $("#edit-history-list");
    historyList.empty();

    // Add items in reverse order (newest first)
    for (let i = editHistory.length - 1; i >= 0; i--) {
        const edit = editHistory[i];
        const timestamp = new Date(edit.timestamp).toLocaleTimeString();

        const historyItem = $(`
            <div class="edit-history-item">
                <div>
                    <div class="font-medium">${edit.field}</div>
                    <div class="text-xs text-gray-500">
                        <span class="line-through">${edit.oldValue}</span> → 
                        <span class="font-semibold">${edit.newValue}</span>
                    </div>
                    <div class="text-xs text-gray-500">${timestamp}</div>
                </div>
                <button class="undo-edit-btn btn-secondary btn-sm" data-index="${i}">
                    <i class="fas fa-undo"></i>
                </button>
            </div>
        `);

        historyList.append(historyItem);
    }

    // Show the modal
    $("#edit-history-modal").removeClass("hidden");
}

function deactivateEditMode() {
    // Delete the edit token cookie
    document.cookie = "edit_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    // Update permissions
    userPermissions.edit_mode_active = false;

    // Update UI
    updateEditModeIndicator();

    // Remove undo buttons if they exist
    $("#undo-edit-button").remove();
    $("#show-edit-history-button").remove();

    // Refresh the grid
    if (gridApi) {
        gridApi.refreshCells({force: true});
    }

    // Show notification
    showNotification("Muutmise režiim on välja lülitatud", "info");
}

function hasValidEditToken() {
    const editTokenCookie = document.cookie.match(/edit_token=([^;]*)/);
    return !!editTokenCookie;
}

function addUndoButton() {
    if ($("#undo-edit-button").length === 0) {
        const undoButton = $(`
            <button id="undo-edit-button" class="btn btn-secondary" title="Võta viimane muudatus tagasi">
                <i class="fas fa-undo"></i>
                <span class="hidden sm:inline">Võta tagasi</span>
            </button>
        `);

        // Add it to the toolbar's first section
        $(".toolbar-section").first().append(undoButton);

        // Add click handler
        undoButton.on("click", undoLastEdit);
    }
}

// Function to undo all edits
function undoAllEdits() {
    if (editHistory.length === 0) {
        showNotification("Nothing to undo", "info");
        return;
    }

    // Confirm with the user
    if (!confirm("Are you sure you want to undo all edits? This action cannot be reversed.")) {
        return;
    }

    // Show loading overlay
    if (gridApi) {
        gridApi.showLoadingOverlay();
    }

    // Process edits in reverse order (LIFO)
    const processNextEdit = (index) => {
        if (index < 0) {
            // All edits processed
            if (gridApi) {
                gridApi.hideOverlay();
                gridApi.refreshInfiniteCache();
            }
            editHistory = [];
            $("#edit-history-modal").addClass("hidden");
            showNotification("All edits have been undone", "success");
            return;
        }

        const edit = editHistory[index];

        // Send request to update cell with original value
        $.ajax({
            url: "/api/v1/table/cell",
            method: "PUT",
            data: {
                field: edit.field,
                row_id: edit.rowId,
                value: edit.oldValue
            },
            success: function () {
                // Process next edit
                processNextEdit(index - 1);
            },
            error: function (xhr) {
                if (gridApi) {
                    gridApi.hideOverlay();
                }

                let errorMsg = "Error undoing edits";
                if (xhr.responseJSON && xhr.responseJSON.detail) {
                    errorMsg = xhr.responseJSON.detail;
                }

                showNotification(errorMsg, "error");
                $("#edit-history-modal").addClass("hidden");
            }
        });
    };

    // Start processing from the last edit
    processNextEdit(editHistory.length - 1);
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

    // Export functionality
    $("#export-excel").click(function () {
        exportToExcel();
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#export-pdf").click(function () {
        exportToPDF();
        $("#tools-dropdown-menu").removeClass("show");
    });

    // Toggle filter panel
    $("#filter-toggle").click(function () {
        $("#filter-panel").toggleClass("show");

        // If showing, update filter field dropdowns with column options
        if ($("#filter-panel").hasClass("show")) {
            updateFilterFields();
        }

        // Adjust table container height after toggling filter panel
        setTimeout(resizeTableContainer, 100);
    });

    // Add filter row
    $("#add-filter-row").click(function () {
        addFilterRow();
    });

    // Handle remove filter button clicks (using event delegation)
    $("#filter-container").on("click", ".filter-remove-btn", function () {
        $(this).closest(".filter-row").remove();
    });

    // Apply filters
    $("#apply-filters").click(function () {
        applyFilters();
    });

    // Clear filters
    $("#clear-filters").click(function () {
        clearFilters();
    });

    // Save filter (placeholder)
    $("#save-filter").click(function () {
        alert("Filtri salvestamine on arendamisel.");
    });

    // Tööriistad (Tools) buttons
    $("#view-file").click(function () {
        alert("Funktsioon 'Vaata toimikut' on arendamisel.");
        $("#tools-dropdown-menu").removeClass("show");
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

    // Font size controls
    $("#font-increase").click(function () {
        if (currentFontSize < 20) {
            currentFontSize += 1;
            updateFontSize();
        }
        $("#settings-dropdown-menu").removeClass("show");
    });

    $("#font-decrease").click(function () {
        if (currentFontSize > 11) {
            currentFontSize -= 1;
            updateFontSize();
        }
        $("#settings-dropdown-menu").removeClass("show");
    });

    // Toggle dark mode
    $("#toggle-dark-mode").click(function () {
        isDarkMode = !isDarkMode;
        updateTheme();
        $("#settings-dropdown-menu").removeClass("show");
    });

    // Widget buttons
    $("#toggle-compact").click(function () {
        isCompactMode = !isCompactMode;

        // For AG Grid, implement compact mode by changing row height
        if (gridApi) {
            const rowHeight = isCompactMode ? 30 : 40;
            gridApi.resetRowHeights();
            gridApi.setGridOption('rowHeight', rowHeight);
        }

        $("#widgets-dropdown-menu").removeClass("show");
    });

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

    $("#close-edit-mode-modal, #edit-mode-backdrop, #cancel-edit-mode").click(function () {
        $("#edit-mode-modal").addClass("hidden");
    });

    $("#activate-edit-mode").click(activateEditMode);

    // Allow pressing Enter in password field
    $("#edit-password").keypress(function (e) {
        if (e.which === 13) { // Enter key
            activateEditMode();
        }
    });

    $("#close-edit-history-modal, #edit-history-backdrop, #close-history").click(function () {
        $("#edit-history-modal").addClass("hidden");
    });

    // Handle undo button click in history items
    $("#edit-history-list").on("click", ".undo-edit-btn", function () {
        const index = parseInt($(this).data("index"));
        if (index >= 0 && index < editHistory.length) {
            // Swap the edit to be undone to the end of the array
            const editToUndo = editHistory[index];
            editHistory.splice(index, 1);
            editHistory.push(editToUndo);

            // Undo it
            undoLastEdit();

            // Close the modal
            $("#edit-history-modal").addClass("hidden");
        }
    });

    // Handle undo all button
    $("#undo-all-edits").click(undoAllEdits);

    // Add a history button to the toolbar if not already there
    if ($("#show-edit-history-button").length === 0) {
        const historyButton = $(`
            <button id="show-edit-history-button" class="btn btn-secondary" title="Näita muudatuste ajalugu">
                <i class="fas fa-history"></i>
                <span class="hidden sm:inline">Ajalugu</span>
            </button>
        `);

        // Add it next to the undo button
        $("#undo-edit-button").after(historyButton);

        // Add click handler
        historyButton.click(showEditHistory);
    }

    $(document).keydown(function (e) {
        if (e.ctrlKey && e.keyCode === 90 && userPermissions.edit_mode_active) {
            e.preventDefault();
            undoLastEdit();
        }
    });

    // Add handler for the permissions loaded event
    $(document).on('permissionsLoaded', function () {
        updateEditModeIndicator();
        setupEditModeTimer();
    });

    // Add a click handler for the edit indicator to toggle edit mode
    $("#edit-permissions-indicator").click(function () {
        if (userPermissions.can_edit || userPermissions.is_admin) {
            if (!userPermissions.edit_mode_active) {
                showEditModeModal();
            } else {
                // Allow disabling edit mode by clicking the indicator
                userPermissions.edit_mode_active = false;

                // Reset the indicator
                updateEditModeIndicator();

                // Refresh the grid
                if (gridApi) {
                    gridApi.refreshCells({force: true});
                }

                // Delete the edit token cookie
                document.cookie = "edit_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

                // Show notification
                showNotification("Muutmise režiim on välja lülitatud", "info");
            }
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