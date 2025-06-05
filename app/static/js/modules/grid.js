// app/static/js/modules/grid.js
// AG Grid specific functionality

(function () {
    // Local references to global state
    const state = window.appState;
    const funcs = window.appFunctions;

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

    // Generate quick links for columns
    function generateQuickLinks() {
        if (!state.columnDefs || state.columnDefs.length === 0) return;

        const quickLinksContainer = $("#column-quick-links");
        quickLinksContainer.empty();

        // Add all columns as quick links (or limit to a reasonable number)
        const maxLinks = Math.min(24, state.columnDefs.length); // Grid layout will organize these
        for (let i = 0; i < maxLinks; i++) {
            const column = state.columnDefs[i];
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
                // Add cell renderer to highlight blank values
                cellRenderer: function (params) {
                    if (params.value === null || params.value === '' ||
                        (typeof params.value === 'string' && params.value.trim() === '')) {
                        return '<span style="color:#999;font-style:italic;font-size:0.9em;">(tühi)</span>';
                    }
                    return params.value;
                },
                // Fix editing configuration
                editable: function (params) {
                    // Only editable if in edit mode and the column is in editableColumns
                    return window.appState.isEditMode &&
                        (window.appState.editableColumns || []).includes(params.colDef.field);
                },
                cellStyle: function (params) {
                    // Use the global getCellStyle function
                    if (typeof window.getCellStyle === 'function') {
                        return window.getCellStyle(params);
                    }
                    return null;
                },
                cellClass: function (params) {
                    // Add a custom class to editable cells based on current mode
                    if (window.appState.isEditMode &&
                        (window.appState.editableColumns || []).includes(params.colDef.field)) {
                        return 'editable-cell';
                    }
                    return '';
                }
            },
            columnDefs: state.columnDefs,
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
            onCellValueChanged: function (params) {
                // Call the global cell value changed handler
                if (typeof window.onCellValueChanged === 'function') {
                    window.onCellValueChanged(params);
                }
            },
            rowSelection: 'multiple',
            suppressRowHoverHighlight: false,
            rowHighlightClass: 'ag-row-highlight',
        };

        // Create the grid
        new agGrid.Grid(document.getElementById('data-table'), gridOptions);
    }

    // Cell value changed handler
    function onCellValueChanged(params) {
        // To be implemented with edit functionality
        console.log("Cell value changed:", params);
    }

    // Get cell styling
    function getCellStyle(params) {
        // Add custom styling if needed
        return null;
    }

    // Handle grid ready event
    function onGridReady(params) {
        state.gridApi = params.api;

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

                // Add search term if present - check both possible state locations
                const searchTerm = state.searchTerm || (window.appState ? window.appState.searchTerm : null);
                if (searchTerm) {
                    queryParams.search = searchTerm;
                    console.log('Adding search term:', searchTerm);
                }

                // Add filters if present
                if (params.filterModel && Object.keys(params.filterModel).length > 0) {
                    // Convert the filter model to a JSON string
                    try {
                        const filterModelStr = JSON.stringify(params.filterModel);
                        queryParams.filter_model = filterModelStr;
                        console.log('Adding filter model:', filterModelStr);
                    } catch (error) {
                        console.error('Error stringifying filter model:', error, params.filterModel);
                        // Continue without filters if there's an error
                    }
                }

                // Add timestamp to bust cache when refreshing
                if (params.parentNode && params.parentNode.data && params.parentNode.data.timestamp) {
                    queryParams.timestamp = params.parentNode.data.timestamp;
                } else {
                    // Always add a timestamp to prevent caching
                    queryParams.timestamp = new Date().getTime();
                }

                $.ajax({
                    url: "/api/v1/table/data",
                    method: "GET",
                    data: queryParams,
                    dataType: "json",
                    success: function (response) {
                        // Validate response data
                        if (!response || !response.rowData) {
                            console.error("Invalid response format:", response);
                            params.failCallback();
                            $("#loading-overlay").hide();
                            $("#mini-loading-indicator").addClass("hidden");
                            return;
                        }

                        // Update status
                        const isFiltered = queryParams.filter_model || queryParams.search;
                        $("#status").text(response.rowCount + " kirjet" +
                            (isFiltered ? " (filtreeritud)" : ""));

                        // Check if we have more rows
                        const lastRow = response.rowCount <= response.endRow ? response.rowCount : -1;

                        // Provide the data to the grid
                        params.successCallback(response.rowData, lastRow);

                        // Hide loading indicators
                        $("#loading-overlay").hide();
                        $("#mini-loading-indicator").addClass("hidden");

                        console.log(`Loaded ${response.rowData.length} rows out of ${response.rowCount} total`);
                    },
                    error: function (xhr, status, error) {
                        console.error("Error loading data:", error);
                        console.error("Status:", status);
                        try {
                            console.error("Response:", xhr.responseText);
                        } catch (e) {
                            console.error("Could not log response text:", e);
                        }

                        $("#status").text("Viga: " + error);
                        params.failCallback();
                        $("#loading-overlay").hide();
                        $("#mini-loading-indicator").addClass("hidden");

                        // Show error toast if function exists
                        if (typeof funcs.showToast === 'function') {
                            funcs.showToast("Andmete laadimine ebaõnnestus", error, "error");
                        } else if (typeof showToast === 'function') {
                            showToast("Andmete laadimine ebaõnnestus", error, "error");
                        }
                    }
                });
            }
        };

        // Set the datasource
        state.gridApi.setDatasource(dataSource);

        state.gridApi.addEventListener('filterChanged', function () {
            setTimeout(updateActiveFiltersDisplay, 100);
        });

        // Fit columns to available width
        setTimeout(function () {
            state.gridApi.sizeColumnsToFit();
        }, 100);

        // Update theme if dark mode is active
        if (state.isDarkMode) {
            funcs.updateTheme();
        }
    }

    // Update active filters display
    function updateActiveFiltersDisplay() {
        if (!state.gridApi) return;

        const filterModel = state.gridApi.getFilterModel();
        const filterCount = Object.keys(filterModel || {}).length;

        // Show/hide active filters container
        if (filterCount > 0) {
            // Get active filters and display them
            $("#active-filters").empty();

            for (const field in filterModel) {
                const filter = filterModel[field];
                const column = state.columnDefs.find(col => col.field === field);
                const columnName = column ? column.headerName : field;

                let filterText = "";
                if (filter.type === 'contains') {
                    filterText = `sisaldab "${filter.filter}"`;
                } else if (filter.type === 'equals') {
                    filterText = `= "${filter.filter}"`;
                } else if (filter.type === 'notEqual') {
                    filterText = `≠ "${filter.filter}"`;
                } else if (filter.type === 'startsWith') {
                    filterText = `algab "${filter.filter}"`;
                } else if (filter.type === 'endsWith') {
                    filterText = `lõpeb "${filter.filter}"`;
                } else if (filter.type === 'blank') {
                    filterText = 'on tühi';
                } else if (filter.type === 'notBlank') {
                    filterText = 'ei ole tühi';
                } else if (filter.type === 'greaterThan') {
                    filterText = `> ${filter.filter}`;
                } else if (filter.type === 'greaterThanOrEqual') {
                    filterText = `≥ ${filter.filter}`;
                } else if (filter.type === 'lessThan') {
                    filterText = `< ${filter.filter}`;
                } else if (filter.type === 'lessThanOrEqual') {
                    filterText = `≤ ${filter.filter}`;
                } else if (filter.type === 'inRange') {
                    const from = filter.filter.from !== null && filter.filter.from !== undefined ? filter.filter.from : "";
                    const to = filter.filter.to !== null && filter.filter.to !== undefined ? filter.filter.to : "";
                    filterText = `vahemikus ${from} - ${to}`;
                }

                const filterBadge = $(`
                    <div class="filter-badge py-0.5 px-2 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 flex items-center">
                        <span>${columnName}: ${filterText}</span>
                        <button class="remove-filter-btn ml-1.5" data-field="${field}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `);

                $("#active-filters").append(filterBadge);
            }

            $(".remove-filter-btn").click(function () {
                const field = $(this).data('field');
                state.gridApi.setFilterModel({...filterModel, [field]: null});
            });

            $("#active-filters-container").removeClass("hidden");
        } else {
            $("#active-filters-container").addClass("hidden");
        }
    }

    // Handle first data rendered
    function onFirstDataRendered(params) {
        // Auto-size columns for better initial view
        state.gridApi.autoSizeColumns();

        // Size columns to fit the viewport after auto-sizing
        setTimeout(function () {
            state.gridApi.sizeColumnsToFit();
        }, 200);
    }

    // Handle filter changes
    function onFilterChanged() {
        // Update row count in status bar
        const displayedRowCount = state.gridApi.getDisplayedRowCount();
        $("#status").text(displayedRowCount + " kirjet (filtreeritud)");

        // Update active filters display
        updateActiveFiltersDisplay();
    }

    // Handle sort changes
    function onSortChanged() {
        // Refresh data with new sort order
        state.gridApi.refreshInfiniteCache();
    }

    // Export to Excel functionality
    function exportToExcel() {
        if (!state.gridApi) return;

        const params = {
            fileName: 'Suur_Andmetabel_Export.xlsx',
            processCellCallback: function (params) {
                // Clean up cell values if needed
                return params.value;
            }
        };

        state.gridApi.exportDataAsExcel(params);
    }

    // Export to PDF functionality (uses browser print with styling)
    function exportToPDF() {
        if (!state.gridApi) return;

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
        const visibleColumns = state.gridApi.getAllDisplayedColumns();
        visibleColumns.forEach(column => {
            const headerName = column.getColDef().headerName || column.getColDef().field;
            doc.write(`<th>${headerName}</th>`);
        });
        doc.write('</tr></thead>');

        // Table body
        doc.write('<tbody>');
        state.gridApi.forEachNodeAfterFilterAndSort(rowNode => {
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

    // Apply column visibility changes
    function applyColumnVisibility() {
        if (!state.gridApi) return;

        // Get checked/unchecked state from checkboxes
        $(".column-toggle").each(function () {
            const field = $(this).data('field');
            const isVisible = $(this).prop('checked');

            // Update local tracking
            state.columnVisibility[field] = isVisible;

            // Update AG Grid
            state.gridApi.setColumnVisible(field, isVisible);
        });
    }

    // Update status text
    function updateStatus() {
        if (!state.gridApi) return;

        const displayedRowCount = state.gridApi.getDisplayedRowCount();
        const totalRowCount = state.gridApi.getInfiniteRowCount();

        const filterModel = state.gridApi.getFilterModel();
        const isFiltered = filterModel && Object.keys(filterModel).length > 0;

        $("#status").text(isFiltered ?
            `Filtreeritud: ${displayedRowCount} kirjet ${totalRowCount ? 'kokku ' + totalRowCount : ''}` :
            `${displayedRowCount} kirjet`);
    }

    // Scroll to a specific column
    function scrollToColumn(fieldName) {
        if (!state.gridApi) return;

        // Get column instance
        const column = state.gridApi.getColumnDef(fieldName);
        if (column) {
            // Ensure column is visible
            state.gridApi.ensureColumnVisible(fieldName);

            // Optional: highlight the column briefly
            state.gridApi.flashCells({
                columns: [fieldName],
                rowNodes: state.gridApi.getDisplayedRowAtIndex(0) ?
                    [state.gridApi.getDisplayedRowAtIndex(0)] : []
            });
        }
    }

    window.getSelectedRowsManually = function () {
        // This is a fallback method to get selected rows by directly checking DOM elements

        // Find all rows with the selected class
        const selectedDomRows = document.querySelectorAll('.ag-row-selected');
        console.log("DOM selected rows:", selectedDomRows);

        if (!selectedDomRows || selectedDomRows.length === 0) {
            console.log("No selected rows found in DOM");
            return [];
        }

        // Try to get the data from selected rows
        const selectedData = [];
        selectedDomRows.forEach(row => {
            // Get the row ID or index
            const rowIndex = row.getAttribute('row-index');
            const rowId = row.getAttribute('row-id');
            console.log(`Found selected row in DOM: index=${rowIndex}, id=${rowId}`);

            // Try to get data from grid API using index
            if (window.gridApi && typeof window.gridApi.getDisplayedRowAtIndex === 'function' && rowIndex) {
                const node = window.gridApi.getDisplayedRowAtIndex(parseInt(rowIndex));
                if (node && node.data) {
                    selectedData.push(node.data);
                    console.log("Retrieved row data from grid API:", node.data);
                }
            }
        });

        console.log("Manually extracted selected rows:", selectedData);
        return selectedData;
    };

    // Expose functions to the global bridge
    funcs.getFilterParams = getFilterParams;
    funcs.initGrid = initGrid;
    funcs.generateQuickLinks = generateQuickLinks;
    funcs.exportToExcel = exportToExcel;
    funcs.exportToPDF = exportToPDF;
    funcs.applyColumnVisibility = applyColumnVisibility;
    funcs.updateStatus = updateStatus;
    funcs.scrollToColumn = scrollToColumn;
    funcs.updateActiveFiltersDisplay = updateActiveFiltersDisplay;
})();