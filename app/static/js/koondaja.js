// Koondaja module for handling consolidated data import and management
(function () {
    'use strict';

    // Module state
    let koondajaGridApi = null;
    let koondajaColumnApi = null;
    let koondajaData = [];
    let availableDbColumns = [];
    let currentColumns = [];
    let selectedDbColumns = []; // Track selected DB columns
    let isLoading = false;
    let isColumnsFittedToHeader = false; // Track column width state

    // Folders to process
    const KOONDAJA_FOLDERS = ['CSV', 'Konto vv', 'MTA', 'Pension', 'Töötukassa'];

    // Default columns for Koondaja
    const defaultColumns = [
        {field: 'Esimene', headerName: 'Esimene', editable: false, sortable: true, filter: true},
        {field: 'Viitenumber', headerName: 'Viitenumber', editable: false, sortable: true, filter: true},
        {field: 'Selgitus', headerName: 'Selgitus', editable: false, sortable: true, filter: true},
        {field: 'Toimiku_nr', headerName: 'Toimiku nr', editable: false, sortable: true, filter: true},
        {field: 'Toimik_vn_jargi', headerName: 'Toimik vn järgi', editable: false, sortable: true, filter: true},
        {field: 'Toimik_mk_jargi', headerName: 'Toimik mk järgi', editable: false, sortable: true, filter: true},
        {field: 'Toimik_ik_jargi', headerName: 'Toimik ik järgi', editable: false, sortable: true, filter: true},
        {field: 'Makse_summa', headerName: 'Makse summa', editable: false, sortable: true, filter: true},
        {field: 'Jaak_peale_makset', headerName: 'Jääk peale makset', editable: false, sortable: true, filter: true}
    ];

    function showNotification(message, type) {
        // Use the existing notification system if available
        if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // Fallback to console and alert
            console.log(`${type}: ${message}`);
            if (type === 'error') {
                alert(`Error: ${message}`);
            }
        }
    }

    // Initialize Koondaja when document is ready
    $(document).ready(function () {
        initializeKoondaja();
    });

    function initializeKoondaja() {
        // Existing button click handlers
        $('#koondaja-btn').click(showKoondajaModal);
        $('#close-koondaja-modal, #koondaja-backdrop').click(hideKoondajaModal);
        $('#load-koondaja-data-btn').click(loadAllKoondajaData);
        $('#add-db-columns-btn').click(showDbColumnSelector);
        $('#clear-koondaja-data-btn').click(clearKoondajaData);
        $('#export-koondaja-btn').click(exportKoondajaData);

        // Use the improved toggle function
        $('#toggle-column-width-btn').click(toggleColumnWidthImproved);

        // Rest of the handlers...
        $('#close-db-column-selector, #db-column-selector-backdrop').click(hideDbColumnSelector);
        $('#cancel-db-columns-btn').click(hideDbColumnSelector);
        $('#add-selected-columns-btn').click(addSelectedDbColumns);
        $('#remove-selected-columns-btn').click(removeSelectedDbColumns);
        $('#db-column-search').on('input', filterDbColumns);

        // Initialize the grid when modal is first shown
        $('#koondaja-modal').on('shown.bs.modal', function () {
            if (!koondajaGridApi) {
                initializeKoondajaGrid();
            }
        });
    }

    function toggleColumnWidth() {
        if (!koondajaGridApi) {
            showNotification('Grid not initialized', 'warning');
            return;
        }

        const button = $('#toggle-column-width-btn');
        const buttonText = $('#toggle-column-width-text');

        if (isColumnsFittedToHeader) {
            // Switch back to small/flex columns - use sizeColumnsToFit
            koondajaGridApi.sizeColumnsToFit();
            buttonText.text('Fit Headers');
            isColumnsFittedToHeader = false;

            // Update button styling to indicate inactive state
            button.removeClass('bg-indigo-50 border-indigo-300 text-indigo-700')
                .addClass('bg-white border-gray-300 text-gray-700');

            showNotification('Columns resized to fit container', 'info');
        } else {
            // Auto-size columns to fit headers using the correct AG Grid method
            try {
                // Method 1: Try autoSizeAllColumns (newer versions)
                if (typeof koondajaGridApi.autoSizeAllColumns === 'function') {
                    koondajaGridApi.autoSizeAllColumns(false);
                }
                // Method 2: Try the columnApi approach (older versions)
                else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeAllColumns === 'function') {
                    koondajaColumnApi.autoSizeAllColumns(false);
                }
                // Method 3: Manual approach using getAllGridColumns and autoSizeColumns
                else if (typeof koondajaGridApi.autoSizeColumns === 'function') {
                    const allColumns = koondajaGridApi.getAllGridColumns();
                    const columnIds = allColumns.map(col => col.getColId());
                    koondajaGridApi.autoSizeColumns(columnIds, false);
                }
                // Method 4: Use columnApi autoSizeColumns if available
                else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeColumns === 'function') {
                    const allColumns = koondajaColumnApi.getAllColumns();
                    const columnIds = allColumns.map(col => col.getColId());
                    koondajaColumnApi.autoSizeColumns(columnIds, false);
                }
                // Method 5: Fallback to manual width setting
                else {
                    autoSizeColumnsManually();
                }

                buttonText.text('Small Columns');
                isColumnsFittedToHeader = true;

                // Update button styling to indicate active state
                button.removeClass('bg-white border-gray-300 text-gray-700')
                    .addClass('bg-indigo-50 border-indigo-300 text-indigo-700');

                showNotification('Columns auto-sized to headers', 'info');

            } catch (error) {
                console.error('Error auto-sizing columns:', error);
                showNotification('Viga veergude suuruse muutmisel', 'error');
            }
        }
    }

    function autoSizeColumnsManually() {
        if (!koondajaGridApi) return;

        try {
            // Get all visible columns
            const allColumns = koondajaGridApi.getAllGridColumns ?
                koondajaGridApi.getAllGridColumns() :
                (koondajaColumnApi ? koondajaColumnApi.getAllColumns() : []);

            if (allColumns.length === 0) {
                console.warn('No columns found for manual auto-sizing');
                return;
            }

            // Calculate optimal width for each column
            allColumns.forEach(column => {
                if (column && column.getColDef) {
                    const colDef = column.getColDef();
                    const headerName = colDef.headerName || colDef.field || '';

                    // Calculate width based on header text length
                    // Rough estimate: 8px per character + padding
                    const headerWidth = Math.max(headerName.length * 8 + 40, 100);

                    // Set minimum and maximum widths
                    const optimalWidth = Math.min(Math.max(headerWidth, 100), 300);

                    // Apply the width
                    if (koondajaColumnApi && typeof koondajaColumnApi.setColumnWidth === 'function') {
                        koondajaColumnApi.setColumnWidth(column.getColId(), optimalWidth);
                    } else if (typeof koondajaGridApi.setColumnWidth === 'function') {
                        koondajaGridApi.setColumnWidth(column.getColId(), optimalWidth);
                    }
                }
            });

            console.log('Manual column auto-sizing completed');
        } catch (error) {
            console.error('Error in manual auto-sizing:', error);
            // Final fallback - just use sizeColumnsToFit
            koondajaGridApi.sizeColumnsToFit();
        }
    }

    function showKoondajaModal() {
        $('#koondaja-modal').removeClass('hidden');
        $('body').addClass('overflow-hidden');

        // Initialize grid if not already done
        if (!koondajaGridApi) {
            setTimeout(initializeKoondajaGrid, 100);
        }
    }

    function hideKoondajaModal() {
        $('#koondaja-modal').addClass('hidden');
        $('body').removeClass('overflow-hidden');
    }

    function initializeKoondajaGrid() {
        const gridOptions = {
            columnDefs: [...defaultColumns],
            rowData: koondajaData,
            defaultColDef: {
                resizable: true,
                minWidth: 100,
                flex: 1,
                sortable: true,
                filter: true
            },
            animateRows: true,
            rowSelection: 'multiple',
            enableCellTextSelection: true,
            ensureDomOrder: true,
            suppressRowClickSelection: true,
            // Enhanced styling options
            suppressCellFocus: false,
            enableRangeSelection: true,
            // Custom row class for additional styling if needed
            getRowClass: function (params) {
                const rowData = params.data;
                if (rowData && rowData._needs_highlighting) {
                    return 'koondaja-invalid-row';
                }
                return '';
            },
            onGridReady: function (params) {
                koondajaGridApi = params.api;
                koondajaColumnApi = params.columnApi; // This might be undefined in newer versions

                // Log available methods for debugging
                console.log('Grid API methods available:');
                console.log('autoSizeAllColumns:', typeof koondajaGridApi.autoSizeAllColumns);
                console.log('autoSizeColumns:', typeof koondajaGridApi.autoSizeColumns);
                console.log('sizeColumnsToFit:', typeof koondajaGridApi.sizeColumnsToFit);

                if (koondajaColumnApi) {
                    console.log('Column API methods available:');
                    console.log('autoSizeAllColumns:', typeof koondajaColumnApi.autoSizeAllColumns);
                    console.log('autoSizeColumns:', typeof koondajaColumnApi.autoSizeColumns);
                } else {
                    console.log('Column API not available (newer AG Grid version)');
                }

                updateRowCount();

                // Show empty state if no data
                if (koondajaData.length === 0) {
                    $('#koondaja-empty-state').removeClass('hidden');
                }
            },
            onRowDataUpdated: function () {
                updateRowCount();
                // Force refresh to apply cell styling
                if (koondajaGridApi) {
                    koondajaGridApi.refreshCells();
                }
            },
            onFirstDataRendered: function (params) {
                // This event fires when data is first rendered
                // Good place to apply initial column sizing if needed
                console.log('First data rendered, grid ready for column operations');
            }
        };

        const gridDiv = document.querySelector('#koondaja-ag-grid');
        new agGrid.Grid(gridDiv, gridOptions);

        currentColumns = [...defaultColumns];
    }

    // Alternative column width management with better compatibility
    function getColumnSizingMethods() {
        const methods = {
            autoSizeAll: null,
            autoSizeSpecific: null,
            sizeToFit: null,
            setColumnWidth: null
        };

        if (!koondajaGridApi) return methods;

        // Check for auto-size all columns methods
        if (typeof koondajaGridApi.autoSizeAllColumns === 'function') {
            methods.autoSizeAll = () => koondajaGridApi.autoSizeAllColumns(false);
        } else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeAllColumns === 'function') {
            methods.autoSizeAll = () => koondajaColumnApi.autoSizeAllColumns(false);
        }

        // Check for auto-size specific columns methods
        if (typeof koondajaGridApi.autoSizeColumns === 'function') {
            methods.autoSizeSpecific = (columnIds) => koondajaGridApi.autoSizeColumns(columnIds, false);
        } else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeColumns === 'function') {
            methods.autoSizeSpecific = (columnIds) => koondajaColumnApi.autoSizeColumns(columnIds, false);
        }

        // Size to fit method
        if (typeof koondajaGridApi.sizeColumnsToFit === 'function') {
            methods.sizeToFit = () => koondajaGridApi.sizeColumnsToFit();
        }

        // Set column width method
        if (koondajaColumnApi && typeof koondajaColumnApi.setColumnWidth === 'function') {
            methods.setColumnWidth = (colId, width) => koondajaColumnApi.setColumnWidth(colId, width);
        } else if (typeof koondajaGridApi.setColumnWidth === 'function') {
            methods.setColumnWidth = (colId, width) => koondajaGridApi.setColumnWidth(colId, width);
        }

        return methods;
    }

// Improved toggle function using the compatibility layer
    function toggleColumnWidthImproved() {
        if (!koondajaGridApi) {
            showNotification('Grid not initialized', 'warning');
            return;
        }

        const button = $('#toggle-column-width-btn');
        const buttonText = $('#toggle-column-width-text');
        const methods = getColumnSizingMethods();

        if (isColumnsFittedToHeader) {
            // Switch back to small/flex columns
            if (methods.sizeToFit) {
                methods.sizeToFit();
                buttonText.text('Fit Headers');
                isColumnsFittedToHeader = false;

                button.removeClass('bg-indigo-50 border-indigo-300 text-indigo-700')
                    .addClass('bg-white border-gray-300 text-gray-700');

                showNotification('Columns resized to fit container', 'info');
            } else {
                showNotification('Size to fit not available', 'warning');
            }
        } else {
            // Auto-size columns to fit headers
            let success = false;

            if (methods.autoSizeAll) {
                try {
                    methods.autoSizeAll();
                    success = true;
                } catch (error) {
                    console.error('Auto-size all failed:', error);
                }
            }

            if (!success && methods.autoSizeSpecific) {
                try {
                    const allColumns = koondajaGridApi.getAllGridColumns ?
                        koondajaGridApi.getAllGridColumns() :
                        (koondajaColumnApi ? koondajaColumnApi.getAllColumns() : []);

                    if (allColumns.length > 0) {
                        const columnIds = allColumns.map(col => col.getColId());
                        methods.autoSizeSpecific(columnIds);
                        success = true;
                    }
                } catch (error) {
                    console.error('Auto-size specific failed:', error);
                }
            }

            if (!success) {
                // Manual fallback
                autoSizeColumnsManually();
                success = true;
            }

            if (success) {
                buttonText.text('Small Columns');
                isColumnsFittedToHeader = true;

                button.removeClass('bg-white border-gray-300 text-gray-700')
                    .addClass('bg-indigo-50 border-indigo-300 text-indigo-700');

                showNotification('Columns auto-sized to headers', 'info');
            } else {
                showNotification('Viga veergude suuruse muutmisel', 'error');
            }
        }
    }

    function loadAllKoondajaData() {
        if (isLoading) {
            showNotification('Andmete laadimine juba käib', 'warning');
            return;
        }

        // Clear existing data first
        koondajaData = [];
        updateGrid();

        // Show loading modal
        showLoadingModal();
        isLoading = true;

        // Start loading process
        loadKoondajaDataFromFolders();
    }

    function showLoadingModal() {
        $('#koondaja-loading-modal').removeClass('hidden');
        $('#koondaja-loading-progress').css('width', '0%');
        $('#koondaja-loading-status').text('Alustan andmete laadimist...');
        $('#koondaja-loading-details').text('Ootan...');
        $('#cancel-koondaja-loading').prop('disabled', true);
    }

    function hideLoadingModal() {
        $('#koondaja-loading-modal').addClass('hidden');
    }

    function updateLoadingProgress(current, total, currentFolder, currentFile) {
        const percentage = Math.round((current / total) * 100);
        $('#koondaja-loading-progress').css('width', percentage + '%');
        $('#koondaja-loading-status').text(`Töötlen kausta: ${currentFolder}`);
        $('#koondaja-loading-details').text(`Fail: ${currentFile || 'Otsin faile...'} (${current}/${total})`);
    }

    async function loadKoondajaDataFromFolders() {
        try {
            // First, get all CSV files from all folders
            const allFiles = [];
            let folderIndex = 0;

            for (const folder of KOONDAJA_FOLDERS) {
                updateLoadingProgress(folderIndex, KOONDAJA_FOLDERS.length, folder, null);

                try {
                    const response = await $.ajax({
                        url: '/api/v1/koondaja/koondaja-list-files',  // Updated URL
                        method: 'GET',
                        data: {folder: folder}
                    });

                    if (response.success && response.files) {
                        response.files.forEach(file => {
                            allFiles.push({
                                path: file.path,
                                name: file.name,
                                folder: folder
                            });
                        });
                    }
                } catch (error) {
                    console.error(`Error listing files in folder ${folder}:`, error);
                }

                folderIndex++;
            }

            if (allFiles.length === 0) {
                hideLoadingModal();
                isLoading = false;
                showNotification('Ei leitud ühtegi CSV faili', 'warning');
                return;
            }

            // Now process all files
            let processedFiles = 0;
            let totalRows = 0;
            const errors = [];

            for (const file of allFiles) {
                updateLoadingProgress(processedFiles, allFiles.length, file.folder, file.name);

                try {
                    const response = await $.ajax({
                        url: '/api/v1/koondaja/import-koondaja-csv',  // Updated URL
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify({
                            file_path: file.path,
                            folder_name: file.folder
                        })
                    });

                    if (response.success && response.data && response.data.length > 0) {
                        koondajaData = [...koondajaData, ...response.data];
                        totalRows += response.data.length;
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    errors.push(`${file.folder}/${file.name}: ${error.responseJSON?.detail || 'Viga'}`);
                }

                processedFiles++;
            }

            // Update grid with all loaded data
            updateGrid();
            hideLoadingModal();
            isLoading = false;

            // Show summary
            let message = `Laaditud ${totalRows} rida ${processedFiles} failist`;
            if (errors.length > 0) {
                message += `\n\nVead:\n${errors.slice(0, 5).join('\n')}`;
                if (errors.length > 5) {
                    message += `\n... ja ${errors.length - 5} muud viga`;
                }
                showNotification(message, 'warning');
            } else {
                showNotification(message, 'success');
            }

        } catch (error) {
            console.error('Error loading Koondaja data:', error);
            hideLoadingModal();
            isLoading = false;
            showNotification('Viga andmete laadimisel', 'error');
        }
    }

    function updateGrid() {
        if (koondajaGridApi) {
            $('#koondaja-empty-state').addClass('hidden');
            koondajaGridApi.setRowData(koondajaData);
            updateRowCount();

            // Force refresh cells to apply styling after data update
            setTimeout(() => {
                if (koondajaGridApi) {
                    koondajaGridApi.refreshCells({
                        force: true,
                        suppressFlash: true
                    });
                }
            }, 100);
        }
    }

    function updateRowCount() {
        $('#koondaja-row-count').text(`${koondajaData.length} rida`);
    }

    function clearKoondajaData() {
        if (koondajaData.length === 0) {
            showNotification('Pole andmeid kustutamiseks', 'info');
            return;
        }

        if (confirm('Kas olete kindel, et soovite kõik andmed kustutada?')) {
            koondajaData = [];
            updateGrid();
            $('#koondaja-empty-state').removeClass('hidden');
            showNotification('Andmed kustutatud', 'success');
        }
    }

    function exportKoondajaData() {
        if (koondajaData.length === 0) {
            showNotification('Pole andmeid eksportimiseks', 'warning');
            return;
        }

        // Create CSV content
        const headers = currentColumns.map(col => col.headerName);
        const csvContent = [
            headers.join(';'),
            ...koondajaData.map(row =>
                currentColumns.map(col => {
                    const value = row[col.field] || '';
                    // Escape semicolons and quotes in values
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(';')
            )
        ].join('\n');

        // Add BOM for proper UTF-8 encoding in Excel
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], {type: 'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `koondaja_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('Andmed eksporditud', 'success');
    }

    function showDbColumnSelector() {
        // Load available columns from database
        $.ajax({
            url: '/api/v1/table/columns',
            method: 'GET',
            success: function (response) {
                availableDbColumns = response.columns || [];
                displayDbColumns();
                $('#db-column-selector-modal').removeClass('hidden');
            },
            error: function (xhr) {
                showNotification('Viga veergude laadimisel', 'error');
            }
        });
    }

    function hideDbColumnSelector() {
        $('#db-column-selector-modal').addClass('hidden');
        $('#db-column-search').val('');

        // Clear any dynamically created buttons to prevent duplicates
        $('#add-selected-columns-btn, #remove-selected-columns-btn').off('click.columnSelector');
    }

    function displayDbColumns() {
        const container = $('#db-columns-list');
        container.empty();

        // Get currently selected DB column fields (excluding default columns)
        const defaultFields = defaultColumns.map(col => col.field);
        const currentDbFields = currentColumns
            .filter(col => !defaultFields.includes(col.field))
            .map(col => col.field);

        if (availableDbColumns.length === 0) {
            container.html('<p class="text-gray-500 text-center py-4">Andmebaasi veerge ei leitud</p>');
            return;
        }

        // Create sections for selected and available columns
        const selectedColumns = availableDbColumns.filter(col => currentDbFields.includes(col.field));
        const availableColumns = availableDbColumns.filter(col => !currentDbFields.includes(col.field));

        // Add selected columns section if any exist
        if (selectedColumns.length > 0) {
            const selectedSection = $(`
            <div class="mb-4">
                <h4 class="text-sm font-medium text-gray-900 mb-2">Valitud veerud (${selectedColumns.length})</h4>
                <div class="border rounded-md bg-green-50 border-green-200 p-2">
                    <div id="selected-columns-list"></div>
                </div>
            </div>
        `);
            container.append(selectedSection);

            const selectedContainer = $('#selected-columns-list');
            selectedColumns.forEach(function (col) {
                const item = $(`
                <div class="flex items-center p-2 hover:bg-green-100 rounded">
                    <input type="checkbox" id="selected-col-${col.field}" 
                           data-field="${col.field}" 
                           data-title="${col.title}"
                           class="mr-2 selected-column-checkbox" 
                           checked>
                    <label for="selected-col-${col.field}" class="flex-grow cursor-pointer">
                        <span class="font-medium text-green-800">${col.title}</span>
                        <span class="text-xs text-green-600 ml-2">(${col.field})</span>
                    </label>
                    <span class="text-xs text-green-600 font-medium">LISATUD</span>
                </div>
            `);
                selectedContainer.append(item);
            });
        }

        // Add available columns section
        if (availableColumns.length > 0) {
            const availableSection = $(`
            <div>
                <h4 class="text-sm font-medium text-gray-900 mb-2">Saadaolevad veerud (${availableColumns.length})</h4>
                <div class="border rounded-md p-2">
                    <div id="available-columns-list"></div>
                </div>
            </div>
        `);
            container.append(availableSection);

            const availableContainer = $('#available-columns-list');
            availableColumns.forEach(function (col) {
                const item = $(`
                <div class="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                    <input type="checkbox" id="available-col-${col.field}" 
                           data-field="${col.field}" 
                           data-title="${col.title}"
                           class="mr-2 available-column-checkbox">
                    <label for="available-col-${col.field}" class="flex-grow cursor-pointer">
                        <span class="font-medium">${col.title}</span>
                        <span class="text-xs text-gray-500 ml-2">(${col.field})</span>
                    </label>
                </div>
            `);
                availableContainer.append(item);
            });
        } else if (selectedColumns.length === 0) {
            container.html('<p class="text-gray-500 text-center py-4">Kõik veerud on juba lisatud</p>');
        }

        // Update button states
        updateColumnSelectorButtons();
    }

    function updateColumnSelectorButtons() {
        const hasSelectedToAdd = $('.available-column-checkbox:checked').length > 0;
        const hasSelectedToRemove = $('.selected-column-checkbox:checked').length > 0;

        // Update or create the add button
        if ($('#add-selected-columns-btn').length === 0) {
            $('#cancel-db-columns-btn').after(`
            <button id="add-selected-columns-btn" 
                    class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                Lisa valitud
            </button>
        `);
            $('#add-selected-columns-btn').click(addSelectedDbColumns);
        }

        // Update or create the remove button
        if ($('#remove-selected-columns-btn').length === 0) {
            $('#add-selected-columns-btn').after(`
            <button id="remove-selected-columns-btn" 
                    class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ml-2">
                Eemalda valitud
            </button>
        `);
            $('#remove-selected-columns-btn').click(removeSelectedDbColumns);
        }

        // Enable/disable buttons based on selections
        $('#add-selected-columns-btn').prop('disabled', !hasSelectedToAdd);
        $('#remove-selected-columns-btn').prop('disabled', !hasSelectedToRemove);

        // Add change handlers to update button states
        $('.available-column-checkbox, .selected-column-checkbox').off('change.columnSelector').on('change.columnSelector', updateColumnSelectorButtons);
    }

    function filterDbColumns() {
        const searchTerm = $('#db-column-search').val().toLowerCase();

        $('#available-columns-list > div, #selected-columns-list > div').each(function () {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.includes(searchTerm));
        });
    }

    function addSelectedDbColumns() {
        const selectedColumns = [];

        $('.available-column-checkbox:checked').each(function () {
            const field = $(this).data('field');
            const title = $(this).data('title');

            selectedColumns.push({
                field: field,
                headerName: title,
                editable: false,
                sortable: true,
                filter: true,
                resizable: true,
                minWidth: 100,
                flex: 1
            });
        });

        if (selectedColumns.length === 0) {
            showNotification('Palun valige vähemalt üks veerg', 'warning');
            return;
        }

        // Add selected columns to the grid
        currentColumns = [...currentColumns, ...selectedColumns];
        selectedDbColumns = [...selectedDbColumns, ...selectedColumns.map(col => col.field)];

        if (koondajaGridApi) {
            koondajaGridApi.setColumnDefs(currentColumns);

            // Fetch data for the new columns if we have rows
            if (koondajaData.length > 0) {
                fetchDbColumnData(selectedColumns.map(col => col.field));
            }
        }

        // Refresh the column selector display
        displayDbColumns();
        showNotification(`Lisatud ${selectedColumns.length} veergu`, 'success');
    }

    function removeSelectedDbColumns() {
        const columnsToRemove = [];

        $('.selected-column-checkbox:checked').each(function () {
            columnsToRemove.push($(this).data('field'));
        });

        if (columnsToRemove.length === 0) {
            showNotification('Palun valige vähemalt üks veerg eemaldamiseks', 'warning');
            return;
        }

        // Remove columns from current columns array
        currentColumns = currentColumns.filter(col => !columnsToRemove.includes(col.field));
        selectedDbColumns = selectedDbColumns.filter(field => !columnsToRemove.includes(field));

        if (koondajaGridApi) {
            koondajaGridApi.setColumnDefs(currentColumns);
        }

        // Refresh the column selector display
        displayDbColumns();
        showNotification(`Eemaldatud ${columnsToRemove.length} veergu`, 'success');
    }

    function fetchDbColumnData(newFields) {
        // Get unique identifiers from existing data
        const toimikuNumbers = [...new Set(koondajaData.map(row => row.Toimiku_nr).filter(nr => nr))];

        if (toimikuNumbers.length === 0) {
            showNotification('Pole toimiku numbreid andmebaasist info pärimiseks', 'warning');
            return;
        }

        // Show loading indicator
        showNotification('Laadin andmebaasi andmeid...', 'info');

        // Fetch data from the main table for these toimiku numbers
        $.ajax({
            url: '/api/v1/koondaja/koondaja-fetch-columns',  // Updated URL
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                toimiku_numbers: toimikuNumbers,
                fields: newFields
            }),
            success: function (response) {
                if (response.success && response.data) {
                    // Merge the fetched data with existing data
                    mergeDbData(response.data);
                    showNotification('Andmebaasi andmed lisatud', 'success');
                }
            },
            error: function (xhr) {
                showNotification('Viga andmebaasi andmete laadimisel', 'error');
            }
        });
    }

    function mergeDbData(dbData) {
        // Create a map for quick lookup
        const dbDataMap = {};
        dbData.forEach(row => {
            if (row.toimiku_nr) {
                dbDataMap[row.toimiku_nr] = row;
            }
        });

        // Merge with existing data
        koondajaData = koondajaData.map(row => {
            const dbRow = dbDataMap[row.Toimiku_nr];
            if (dbRow) {
                return {...row, ...dbRow};
            }
            return row;
        });

        // Update the grid
        updateGrid();
    }

    // Export functions for use in other modules
    window.KoondajaModule = {
        show: showKoondajaModal,
        hide: hideKoondajaModal,
        getData: function () {
            return koondajaData;
        },
        clearData: clearKoondajaData,
        exportData: exportKoondajaData
    };

})();