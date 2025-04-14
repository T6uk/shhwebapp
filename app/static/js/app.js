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

// Initialize when document is ready
$(document).ready(function () {
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

    // Set up periodic data refresh
    setupDataRefreshTimer();

    if ($("#user-profile").length) {
    const username = $("#user-profile").data("username");
    setTimeout(function() {
        showToast("Tere tulemast!", `Tere, ${username}! Andmed on valmis.`, "success");
    }, 1500); // Show after data loads
}
});

// Set up periodic data refresh
function setupDataRefreshTimer() {
    // Refresh data every 30 seconds in the background
    setInterval(function () {
        if (gridApi) {
            // Add a timestamp to force cache bypass
            const timestamp = new Date().getTime();
            gridApi.refreshInfiniteCache({timestamp: timestamp});
            console.log("Performed background data refresh");
        }
    }, 30000); // 30 seconds
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

    if ($("#edit-history-panel").is(":visible")) {
        const historyPanelHeight = $("#edit-history-panel").outerHeight(true);
        tableHeight -= historyPanelHeight;
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
            cellStyle: getCellStyle
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
        onCellValueChanged: onCellValueChanged
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