// app/static/js/modules/grid.js
// AG Grid functionality

// Get columns from the API
function getColumns() {
    $("#loading-overlay").show();
    $("#status").text("Laadimine...");

    $.ajax({
        url: "/api/v1/table/columns",
        method: "GET",
        dataType: "json",
        success: function(response) {
            if (response && response.columns && response.columns.length > 0) {
                // Process column data for AG Grid
                AppState.columnDefs = response.columns.map(function(col) {
                    // Initialize as visible in our tracking
                    AppState.columnVisibility[col.field] = true;

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
        error: function(xhr, status, error) {
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
            editable: function(params) {
                // Only editable if in edit mode and the column is in editableColumns
                return isEditMode && editableColumns.includes(params.colDef.field);
            },
            cellStyle: getCellStyle,
            cellClass: function(params) {
                // Add a custom class to editable cells based on current mode
                if (isEditMode && editableColumns && editableColumns.includes(params.colDef.field)) {
                    return 'editable-cell';
                }
                return '';
            }
        },
        columnDefs: AppState.columnDefs,
        rowModelType: 'infinite',  // Use infinite row model for virtualization
        infiniteInitialRowCount: 1000, // Initial placeholder row count
        cacheBlockSize: 100, // Number of rows to load at a time
        maxBlocksInCache: 10, // Maximum number of blocks to keep loaded
        enableCellTextSelection: true,
        getRowId: function(params) {
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
    AppState.gridApi = params.api;

    // Set a datasource for infinite scrolling
    const dataSource = {
        getRows: function(params) {
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
            if (AppState.searchTerm) {
                queryParams.search = AppState.searchTerm;
                console.log('Adding search term:', AppState.searchTerm);
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
                success: function(response) {
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
                error: function(xhr, status, error) {
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
    AppState.gridApi.setDatasource(dataSource);

    AppState.gridApi.addEventListener('filterChanged', function() {
        setTimeout(updateActiveFiltersDisplay, 100);
    });

    // Fit columns to available width
    setTimeout(function() {
        AppState.gridApi.sizeColumnsToFit();
    }, 100);

    // Update theme if dark mode is active
    if (AppState.isDarkMode) {
        updateTheme();
    }
}

// Handle first data rendered
function onFirstDataRendered(params) {
    // Auto-size columns for better initial view
    AppState.gridApi.autoSizeColumns();

    // Size columns to fit the viewport after auto-sizing
    setTimeout(function() {
        AppState.gridApi.sizeColumnsToFit();
    }, 200);
}

// Handle filter changes
function onFilterChanged() {
    // Update row count in status bar
    const displayedRowCount = AppState.gridApi.getDisplayedRowCount();
    $("#status").text(displayedRowCount + " kirjet (filtreeritud)");
}

// Handle sort changes
function onSortChanged() {
    // Refresh data with new sort order
    AppState.gridApi.refreshInfiniteCache();
}

// Update font size for grid
function updateFontSize() {
    document.documentElement.style.setProperty('--ag-font-size', currentFontSize + 'px');
    if (AppState.gridApi) {
        AppState.gridApi.refreshCells({force: true});
    }
}

// Generate quick links for columns
function generateQuickLinks() {
    if (!AppState.columnDefs || AppState.columnDefs.length === 0) return;

    const quickLinksContainer = $("#column-quick-links");
    quickLinksContainer.empty();

    // Add all columns as quick links (or limit to a reasonable number)
    const maxLinks = Math.min(24, AppState.columnDefs.length); // Grid layout will organize these
    for (let i = 0; i < maxLinks; i++) {
        const column = AppState.columnDefs[i];
        const linkElement = $("<div>")
            .addClass("quick-link")
            .text(column.headerName)
            .attr("data-field", column.field)
            .click(function() {
                scrollToColumn(column.field);
                $("#links-dropdown-menu").removeClass("show");
            });

        quickLinksContainer.append(linkElement);
    }
}

// Scroll to a specific column
function scrollToColumn(fieldName) {
    if (!AppState.gridApi) return;

    // Get column instance
    const column = AppState.gridApi.getColumnDef(fieldName);
    if (column) {
        // Ensure column is visible
        AppState.gridApi.ensureColumnVisible(fieldName);

        // Optional: highlight the column briefly
        AppState.gridApi.flashCells({
            columns: [fieldName],
            rowNodes: AppState.gridApi.getDisplayedRowAtIndex(0) ? [AppState.gridApi.getDisplayedRowAtIndex(0)] : []
        });
    }
}

// Show column visibility modal
function showColumnVisibilityModal() {
    if (!AppState.columnDefs || AppState.columnDefs.length === 0) return;

    // Build checkboxes for all columns
    const container = $("#column-checkboxes");
    container.empty();

    AppState.columnDefs.forEach(function(col) {
        const isVisible = AppState.columnVisibility[col.field];

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
    if (!AppState.gridApi) return;

    // Get checked/unchecked state from checkboxes
    $(".column-toggle").each(function() {
        const field = $(this).data('field');
        const isVisible = $(this).prop('checked');

        // Update local tracking
        AppState.columnVisibility[field] = isVisible;

        // Update AG Grid
        AppState.gridApi.setColumnVisible(field, isVisible);
    });
}

// Function to manually refresh data
function refreshData() {
    if (AppState.gridApi) {
        // Show loading indicator
        $("#mini-loading-indicator").removeClass("hidden");

        // Add a timestamp to force cache bypass
        const timestamp = new Date().getTime();
        AppState.gridApi.refreshInfiniteCache({timestamp: timestamp});
        console.log("Manual data refresh performed");

        // Reset the refresh button
        resetRefreshButton();

        // Hide loading indicator after a short delay
        setTimeout(function() {
            $("#mini-loading-indicator").addClass("hidden");
        }, 500);
    }
}

// Update status text
function updateStatus() {
    if (!AppState.gridApi) return;

    const displayedRowCount = AppState.gridApi.getDisplayedRowCount();
    const totalRowCount = AppState.gridApi.getInfiniteRowCount();

    const filterModel = AppState.gridApi.getFilterModel();
    const isFiltered = filterModel && Object.keys(filterModel).length > 0;

    $("#status").text(isFiltered ?
        `Filtreeritud: ${displayedRowCount} kirjet ${totalRowCount ? 'kokku ' + totalRowCount : ''}` :
        `${displayedRowCount} kirjet`);
}

// Export functions for other modules
window.getColumns = getColumns;
window.initGrid = initGrid;
window.onGridReady = onGridReady;
window.onFirstDataRendered = onFirstDataRendered;
window.onFilterChanged = onFilterChanged;
window.onSortChanged = onSortChanged;
window.updateFontSize = updateFontSize;
window.generateQuickLinks = generateQuickLinks;
window.scrollToColumn = scrollToColumn;
window.showColumnVisibilityModal = showColumnVisibilityModal;
window.applyColumnVisibility = applyColumnVisibility;
window.refreshData = refreshData;
window.updateStatus = updateStatus;