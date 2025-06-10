// Koondaja module for handling consolidated data import and management
(function () {
    'use strict';

    // Module state
    let koondajaGridApi = null;
    let koondajaColumnApi = null;
    let koondajaData = [];
    let availableDbColumns = [];
    let currentColumns = [];
    let isLoading = false;

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
        // Button click handlers
        $('#koondaja-btn').click(showKoondajaModal);
        $('#close-koondaja-modal, #koondaja-backdrop').click(hideKoondajaModal);
        $('#load-koondaja-data-btn').click(loadAllKoondajaData);
        $('#add-db-columns-btn').click(showDbColumnSelector);
        $('#clear-koondaja-data-btn').click(clearKoondajaData);
        $('#export-koondaja-btn').click(exportKoondajaData);

        // DB column selector handlers
        $('#close-db-column-selector, #db-column-selector-backdrop').click(hideDbColumnSelector);
        $('#cancel-db-columns-btn').click(hideDbColumnSelector);
        $('#add-selected-columns-btn').click(addSelectedDbColumns);
        $('#db-column-search').on('input', filterDbColumns);

        // Initialize the grid when modal is first shown
        $('#koondaja-modal').on('shown.bs.modal', function () {
            if (!koondajaGridApi) {
                initializeKoondajaGrid();
            }
        });
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
                flex: 1
            },
            animateRows: true,
            rowSelection: 'multiple',
            enableCellTextSelection: true,
            ensureDomOrder: true,
            suppressRowClickSelection: true,
            onGridReady: function (params) {
                koondajaGridApi = params.api;
                koondajaColumnApi = params.columnApi;
                updateRowCount();

                // Show empty state if no data
                if (koondajaData.length === 0) {
                    $('#koondaja-empty-state').removeClass('hidden');
                }
            },
            onRowDataUpdated: function () {
                updateRowCount();
            }
        };

        const gridDiv = document.querySelector('#koondaja-ag-grid');
        new agGrid.Grid(gridDiv, gridOptions);

        currentColumns = [...defaultColumns];
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
    }

    function displayDbColumns() {
        const container = $('#db-columns-list');
        container.empty();

        // Filter out columns that are already in the grid
        const existingFields = currentColumns.map(col => col.field);
        const availableColumns = availableDbColumns.filter(col =>
            !existingFields.includes(col.field)
        );

        if (availableColumns.length === 0) {
            container.html('<p class="text-gray-500 text-center py-4">Kõik veerud on juba lisatud</p>');
            return;
        }

        availableColumns.forEach(function (col) {
            const item = $(`
                <div class="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                    <input type="checkbox" id="db-col-${col.field}" 
                           data-field="${col.field}" 
                           data-title="${col.title}"
                           class="mr-2">
                    <label for="db-col-${col.field}" class="flex-grow cursor-pointer">
                        <span class="font-medium">${col.title}</span>
                        <span class="text-xs text-gray-500 ml-2">(${col.field})</span>
                    </label>
                </div>
            `);
            container.append(item);
        });
    }

    function filterDbColumns() {
        const searchTerm = $('#db-column-search').val().toLowerCase();

        $('#db-columns-list > div').each(function () {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.includes(searchTerm));
        });
    }

    function addSelectedDbColumns() {
        const selectedColumns = [];

        $('#db-columns-list input:checked').each(function () {
            const field = $(this).data('field');
            const title = $(this).data('title');

            selectedColumns.push({
                field: field,
                headerName: title,
                editable: false,
                sortable: true,
                filter: true
            });
        });

        if (selectedColumns.length === 0) {
            showNotification('Palun valige vähemalt üks veerg', 'warning');
            return;
        }

        // Add selected columns to the grid
        currentColumns = [...currentColumns, ...selectedColumns];

        if (koondajaGridApi) {
            koondajaGridApi.setColumnDefs(currentColumns);

            // Fetch data for the new columns if we have rows
            if (koondajaData.length > 0) {
                fetchDbColumnData(selectedColumns.map(col => col.field));
            }
        }

        hideDbColumnSelector();
        showNotification(`Lisatud ${selectedColumns.length} veergu`, 'success');
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