// Koondaja module with new column structure and row highlighting
(function () {
    'use strict';

    // Module state
    let koondajaGridApi = null;
    let koondajaColumnApi = null;
    let koondajaData = [];
    let availableDbColumns = [];
    let currentColumns = [];
    let selectedDbColumns = [];
    let isLoading = false;
    let isColumnsFittedToHeader = false;
    let toimikuleidjaData = [];
    let selectedKoondajaRow = null;

    // Folders to process
    const KOONDAJA_FOLDERS = ['CSV', 'Konto vv', 'MTA', 'Pension', 'Töötukassa'];

    // New column definitions matching the backend structure
    // Updated column definitions with no special formatting and simplified styling
    const defaultColumns = [
        // Core identification columns with enhanced highlighting for name-based matches
        {
            field: 'toimiku_nr_loplik',
            headerName: 'Toimiku nr lõplik',
            editable: true,
            sortable: true,
            filter: true,
            width: 120,
            cellClass: params => {
                if (!params.data) return '';

                const matchSource = params.data.match_source;
                const hasValid = params.data.has_valid_toimiku;

                // Highlight name-based matches in yellow
                if (hasValid && matchSource === 'name') {
                    return 'koondaja-name-based-toimiku';
                }

                return '';
            },
            cellRenderer: params => {
                if (!params.data) return '';

                const value = params.value || '';
                const hasValid = params.data.has_valid_toimiku;
                const matchSource = params.data.match_source;

                // Show match source info for name-based matches
                if (hasValid && matchSource === 'name' && value) {
                    return `<span class="name-based-toimiku" title="Found via name lookup">${value} <small>(name)</small></span>`;
                }

                return value;
            }
        },
        {
            field: 'toimiku_nr_selgituses',
            headerName: 'Toimiku nr selgituses',
            editable: false,
            sortable: true,
            filter: true,
            width: 150
        },
        {
            field: 'toimiku_nr_viitenumbris',
            headerName: 'Toimiku nr viitenumbris',
            editable: false,
            sortable: true,
            filter: true,
            width: 150
        },

        // Document and transaction info
        {field: 'dokumendi_nr', headerName: 'Dokumendi nr', editable: false, sortable: true, filter: true, width: 120},
        {field: 'kande_kpv', headerName: 'Kande kpv', editable: false, sortable: true, filter: true, width: 100},
        {
            field: 'arvelduskonto_nr',
            headerName: 'Arvelduskonto nr',
            editable: true,
            sortable: true,
            filter: true,
            width: 140
        },
        {
            field: 'panga_tunnus_nimi',
            headerName: 'Panga tunnus nimi',
            editable: false,
            sortable: true,
            filter: true,
            width: 150
        },
        {field: 'panga_tunnus', headerName: 'Panga tunnus', editable: false, sortable: true, filter: true, width: 120},

        // Database info
        {field: 'nimi_baasis', headerName: 'Nimi baasis', editable: false, sortable: true, filter: true, width: 200},
        {field: 'noude_sisu', headerName: 'Nõude sisu', editable: false, sortable: true, filter: true, width: 200},
        {
            field: 'toimiku_jaak', headerName: 'Toimiku jääk', editable: false, sortable: true, filter: true,
            width: 120, valueFormatter: params => formatEstonianNumber(params.value)
        },
        {
            field: 'staatus_baasis',
            headerName: 'Staatus baasis',
            editable: false,
            sortable: true,
            filter: true,
            width: 120
        },

        // Statistics
        {
            field: 'toimikute_arv',
            headerName: 'Toimikute arv tööbaasis',
            editable: false,
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'toimikute_jaakide_summa',
            headerName: 'Toimikute jääkide summa tööbaasis',
            editable: false,
            sortable: true,
            filter: true,
            width: 200,
            valueFormatter: params => formatEstonianNumber(params.value)
        },
        {
            field: 'vahe', headerName: 'Vahe', editable: false, sortable: true, filter: true,
            width: 100, valueFormatter: params => formatEstonianNumber(params.value),
            cellClass: params => params.value < 0 ? 'text-red-600' : ''
        },
        {
            field: 'elatus_miinimumid',
            headerName: 'Elatus-miinimumid',
            editable: false,
            sortable: true,
            filter: true,
            width: 140
        },

        // Payment info - no formatting to keep exact CSV data
        {
            field: 'laekumiste_arv',
            headerName: 'Laekumiste arv',
            editable: false,
            sortable: true,
            filter: true,
            width: 120
        },
        {
            field: 'laekumised_kokku',
            headerName: 'Laekumised kokku',
            editable: false,
            sortable: true,
            filter: true,
            width: 140
        },
        {field: 'tagastamised', headerName: 'Tagastamised', editable: false, sortable: true, filter: true, width: 120},

        // Transaction details - no formatting for Summa to keep exact CSV data
        {field: 's_v', headerName: 'S/V', editable: false, sortable: true, filter: true, width: 60},
        {field: 'summa', headerName: 'Summa', editable: false, sortable: true, filter: true, width: 100},
        {field: 'viitenumber', headerName: 'Viitenumber', editable: false, sortable: true, filter: true, width: 140},
        {
            field: 'arhiveerimistunnus',
            headerName: 'Arhiveerimistunnus',
            editable: false,
            sortable: true,
            filter: true,
            width: 150
        },
        {
            field: 'makse_selgitus',
            headerName: 'Makse selgitus',
            editable: false,
            sortable: true,
            filter: true,
            width: 250
        },
        {field: 'valuuta', headerName: 'Valuuta', editable: false, sortable: true, filter: true, width: 80},

        // Additional info
        {
            field: 'isiku_registrikood',
            headerName: 'Isiku- või registrikood',
            editable: false,
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'laekumise_tunnus',
            headerName: 'Laekumise tunnus',
            editable: false,
            sortable: true,
            filter: true,
            width: 140
        },
        {
            field: 'laekumise_kood',
            headerName: 'Laekumise kood deposiidis',
            editable: false,
            sortable: true,
            filter: true,
            width: 180
        },
        {
            field: 'kliendi_konto',
            headerName: 'Kliendi konto',
            editable: false,
            sortable: true,
            filter: true,
            width: 140
        },

        // Notes
        {field: 'em_markus', headerName: 'EM märkus', editable: false, sortable: true, filter: true, width: 200},
        {
            field: 'toimiku_markused',
            headerName: 'Toimiku märkused',
            editable: false,
            sortable: true,
            filter: true,
            width: 200
        }
    ];

    function formatEstonianNumber(value, decimalPlaces = 2) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        try {
            const num = parseFloat(value);
            if (isNaN(num)) return value;
            return num.toFixed(decimalPlaces).replace('.', ',');
        } catch (error) {
            return value;
        }
    }

    function showNotification(message, type) {
        if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`${type}: ${message}`);
            if (type === 'error') {
                alert(`Error: ${message}`);
            }
        }
    }

    function generateUniqueId() {
        return 'new_row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function copyRowData(sourceRow) {
        if (!sourceRow) return null;

        // Create a deep copy of the row data
        const newRow = JSON.parse(JSON.stringify(sourceRow));

        // Clear fields that shouldn't be copied or should be unique
        newRow.dokumendi_nr = '';
        newRow.kande_kpv = '';
        newRow.viitenumber = '';
        newRow.arhiveerimistunnus = '';

        // Add a unique identifier for tracking
        newRow._isNewRow = true;
        newRow._newRowId = generateUniqueId();

        // Mark as invalid until properly filled
        newRow.has_valid_toimiku = false;
        newRow.match_source = null;

        return newRow;
    }

    function insertRowAfter(targetRowIndex) {
        if (!koondajaGridApi || koondajaData.length === 0) {
            showNotification('Cannot add row - no data loaded', 'warning');
            return;
        }

        if (targetRowIndex < 0 || targetRowIndex >= koondajaData.length) {
            showNotification('Invalid row index', 'error');
            return;
        }

        // Get the source row data
        const sourceRow = koondajaData[targetRowIndex];
        const newRow = copyRowData(sourceRow);

        if (!newRow) {
            showNotification('Error copying row data', 'error');
            return;
        }

        // Insert the new row after the target index
        const insertIndex = targetRowIndex + 1;
        koondajaData.splice(insertIndex, 0, newRow);

        // Update the grid
        updateGrid();

        // Scroll to and highlight the new row
        setTimeout(() => {
            if (koondajaGridApi) {
                koondajaGridApi.ensureIndexVisible(insertIndex);

                // Flash the new row to highlight it
                const rowNode = koondajaGridApi.getRowNode(insertIndex);
                if (rowNode) {
                    koondajaGridApi.flashCells({
                        rowNodes: [rowNode],
                        fadeDelay: 2000
                    });
                }
            }
        }, 100);

        showNotification(`New row added after row ${targetRowIndex + 1}`, 'success');
    }

    function deleteRow(targetRowIndex) {
        if (!koondajaGridApi || koondajaData.length === 0) {
            showNotification('Cannot delete row - no data loaded', 'warning');
            return;
        }

        if (targetRowIndex < 0 || targetRowIndex >= koondajaData.length) {
            showNotification('Invalid row index', 'error');
            return;
        }

        // Confirm deletion
        const rowData = koondajaData[targetRowIndex];
        const identifier = rowData.toimiku_nr_loplik || rowData.dokumendi_nr || `Row ${targetRowIndex + 1}`;

        if (!confirm(`Are you sure you want to delete this row?\n\n${identifier}`)) {
            return;
        }

        // Remove the row
        koondajaData.splice(targetRowIndex, 1);

        // Update the grid
        updateGrid();

        showNotification(`Row deleted`, 'success');
    }

    function getContextMenuItems(params) {
        const result = [];

        if (params.node && params.node.rowIndex !== undefined) {
            const rowIndex = params.node.rowIndex;

            result.push({
                name: `Add Row After (Row ${rowIndex + 1})`,
                icon: '<i class="fas fa-plus" style="color: #10b981;"></i>',
                action: () => insertRowAfter(rowIndex)
            });

            result.push('separator');

            result.push({
                name: `Copy Row Data`,
                icon: '<i class="fas fa-copy" style="color: #3b82f6;"></i>',
                action: () => copyRowToClipboard(rowIndex)
            });

            // Only show delete for new rows or if explicitly enabled
            if (params.node.data && params.node.data._isNewRow) {
                result.push('separator');
                result.push({
                    name: `Delete Row`,
                    icon: '<i class="fas fa-trash" style="color: #ef4444;"></i>',
                    action: () => deleteRow(rowIndex)
                });
            }
        }

        return result;
    }

    function copyRowToClipboard(rowIndex) {
        if (rowIndex < 0 || rowIndex >= koondajaData.length) {
            showNotification('Invalid row index', 'error');
            return;
        }

        const rowData = koondajaData[rowIndex];

        // Create a formatted string of the row data
        const formattedData = currentColumns.map(col => {
            const value = rowData[col.field] || '';
            return `${col.headerName}: ${value}`;
        }).join('\n');

        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(formattedData).then(() => {
                showNotification('Row data copied to clipboard', 'success');
            }).catch(() => {
                showNotification('Failed to copy to clipboard', 'error');
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = formattedData;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showNotification('Row data copied to clipboard', 'success');
            } catch (err) {
                showNotification('Failed to copy to clipboard', 'error');
            }
            document.body.removeChild(textArea);
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
        $('#toggle-column-width-btn').click(toggleColumnWidthImproved);

        // ENHANCED: Row management button handlers
        $('#add-row-btn').click(addRowFromSelection);
        $('#validate-new-rows-btn').click(validateNewRowsAgainstDatabase);
        $('#remove-new-rows-btn').click(removeAllNewRows);

        // ADD THIS NEW HANDLER
        $('#toimikuleidja-btn').click(openToimikuleidjaModal);
        $('#close-toimikuleidja-modal, #toimikuleidja-backdrop, #close-toimikuleidja-btn').click(closeToimikuleidjaModal);
        $('#toimikuleidja-search-btn').click(searchToimikud);

        // Other existing handlers...
        $('#close-db-column-selector, #db-column-selector-backdrop').click(hideDbColumnSelector);
        $('#cancel-db-columns-btn').click(hideDbColumnSelector);
        $('#add-selected-columns-btn').click(addSelectedDbColumns);
        $('#remove-selected-columns-btn').click(removeSelectedDbColumns);
        $('#db-column-search').on('input', filterDbColumns);

        // Initialize the grid when modal is first shown
        $('#koondaja-modal').on('shown.bs.modal', function () {
            if (!koondajaGridApi) {
                initializeKoondajaGrid();
                updateToolbarButtonStates();
            }
        });

        // Update button states when data changes
        $(document).on('koondajaDataChanged', updateToolbarButtonStates);

        // Handle selection changes for toolbar button states
        $(document).on('koondajaSelectionChanged', updateToolbarButtonStates);

        // ADD THESE NEW HANDLERS
        // Enter key support for search fields
        $('#toimikuleidja-otsing, #toimikuleidja-selgitus').keypress(function (e) {
            if (e.which === 13) { // Enter key
                searchToimikud();
            }
        });

        // Update button state based on Koondaja selection
        $(document).on('koondajaSelectionChanged', updateToimikuleidjaButtonState);
    }

    function updateToimikuleidjaButtonState() {
        if (!koondajaGridApi) {
            $('#toimikuleidja-btn').prop('disabled', true);
            return;
        }

        const selectedRows = koondajaGridApi.getSelectedRows();
        const hasSelection = selectedRows.length > 0;
        const hasData = koondajaData && koondajaData.length > 0;

        $('#toimikuleidja-btn').prop('disabled', !hasData);

        if (hasSelection) {
            $('#toimikuleidja-btn').find('span').text('Toimikuleidja (valitud)');
            $('#toimikuleidja-btn').attr('title', 'Otsi toimikuid valitud rea põhjal');
        } else {
            $('#toimikuleidja-btn').find('span').text('Toimikuleidja');
            $('#toimikuleidja-btn').attr('title', hasData ? 'Otsi toimikuid' : 'Lae esmalt andmed');
        }
    }


    function addRowFromSelection() {
        if (!koondajaGridApi || koondajaData.length === 0) {
            showNotification('Andmeid pole laetud - lae esmalt andmed', 'warning');
            return;
        }

        let selectedRows = koondajaGridApi.getSelectedRows();
        let sourceRowIndex = -1;
        let sourceRow = null;

        if (selectedRows.length > 0) {
            // Use the first selected row as source
            sourceRow = selectedRows[0];
            // Find the index of this row in koondajaData
            sourceRowIndex = koondajaData.findIndex(row =>
                row === sourceRow ||
                (row.dokumendi_nr === sourceRow.dokumendi_nr &&
                    row.kande_kpv === sourceRow.kande_kpv)
            );
        } else {
            // No selection - use the last row
            sourceRowIndex = koondajaData.length - 1;
            sourceRow = koondajaData[sourceRowIndex];
        }

        if (sourceRowIndex === -1 || !sourceRow) {
            showNotification('Ei suuda leida allikat rea kopeerimiseks', 'error');
            return;
        }

        // Create the new row
        const newRow = copyRowDataEnhanced(sourceRow);
        if (!newRow) {
            showNotification('Viga rea andmete kopeerimisel', 'error');
            return;
        }

        // Insert after the source row
        const insertIndex = sourceRowIndex + 1;
        koondajaData.splice(insertIndex, 0, newRow);

        // Update the grid
        updateGrid();

        // Scroll to and highlight the new row with enhanced animation
        setTimeout(() => {
            if (koondajaGridApi) {
                koondajaGridApi.ensureIndexVisible(insertIndex);

                // Get the row node and add flash animation
                const rowNode = koondajaGridApi.getRowNode(insertIndex);
                if (rowNode) {
                    // Flash the new row
                    const rowElement = document.querySelector(`[row-index="${insertIndex}"]`);
                    if (rowElement) {
                        rowElement.classList.add('koondaja-new-row-flash');
                        setTimeout(() => {
                            if (rowElement) {
                                rowElement.classList.remove('koondaja-new-row-flash');
                            }
                        }, 1500);
                    }

                    // Select the new row
                    koondajaGridApi.deselectAll();
                    rowNode.setSelected(true);

                    // Focus on the first editable cell
                    const editableColumns = koondajaGridApi.getAllGridColumns()
                        .filter(col => col.getColDef().editable);
                    if (editableColumns.length > 0) {
                        koondajaGridApi.setFocusedCell(insertIndex, editableColumns[0]);
                    }
                }
            }
        }, 100);

        const sourceInfo = sourceRow.toimiku_nr_loplik || sourceRow.dokumendi_nr || `Rida ${sourceRowIndex + 1}`;
        showNotification(`Uus rida lisatud (kopeeritud: ${sourceInfo})`, 'success');

        // Trigger custom event for button state updates
        $(document).trigger('koondajaDataChanged');
    }

    function removeAllNewRows() {
        const newRows = koondajaData.filter(row => row._isNewRow);

        if (newRows.length === 0) {
            showNotification('Uusi ridu pole eemaldamiseks', 'info');
            return;
        }

        const modifiedCount = newRows.filter(row => row._isModified).length;
        let confirmMessage = `Kas oled kindel, et soovid eemaldada ${newRows.length} uut rida?`;

        if (modifiedCount > 0) {
            confirmMessage += `\n\n${modifiedCount} rida on muudetud ja lähevad kaotsi.`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        // Remove all new rows
        koondajaData = koondajaData.filter(row => !row._isNewRow);

        // Update the grid
        updateGrid();

        showNotification(`Eemaldatud ${newRows.length} uut rida`, 'success');
    }

    function copyRowDataEnhanced(sourceRow) {
        if (!sourceRow) return null;

        try {
            // Create a deep copy of the row data
            const newRow = JSON.parse(JSON.stringify(sourceRow));

            // Clear fields that should be unique for new rows
            const fieldsToReset = [
                'dokumendi_nr',
                'kande_kpv',
                'viitenumber',
                'arhiveerimistunnus',
                'summa',
                's_v'
            ];

            fieldsToReset.forEach(field => {
                if (newRow.hasOwnProperty(field)) {
                    newRow[field] = '';
                }
            });

            // Keep fields that make sense to copy
            // toimiku_nr_loplik, arvelduskonto_nr, panga info, nimi_baasis, etc. stay the same

            // Add tracking fields for new rows
            newRow._isNewRow = true;
            newRow._newRowId = generateUniqueId();
            newRow._sourceRowData = {
                toimiku_nr_loplik: sourceRow.toimiku_nr_loplik,
                nimi_baasis: sourceRow.nimi_baasis,
                copied_at: new Date().toISOString()
            };

            // Set initial validation state
            newRow.has_valid_toimiku = !!newRow.toimiku_nr_loplik;
            newRow.match_source = newRow.has_valid_toimiku ? 'copied' : null;
            newRow._isModified = false; // Will be set to true when user edits

            return newRow;

        } catch (error) {
            console.error('Error copying row data:', error);
            return null;
        }
    }

    function updateToolbarButtonStates() {
        const hasData = koondajaData.length > 0;
        const hasNewRows = koondajaData.some(row => row._isNewRow);
        const hasModifiedNewRows = koondajaData.some(row => row._isNewRow && row._isModified);
        const hasSelection = koondajaGridApi ? koondajaGridApi.getSelectedRows().length > 0 : false;

        // Existing button states...
        const addBtn = $('#add-row-btn');
        addBtn.prop('disabled', !hasData);

        if (hasData) {
            if (hasSelection) {
                addBtn.find('span').text('Lisa rida (kopeeritud)');
                addBtn.attr('title', 'Lisa uus rida valitud rea põhjal');
            } else {
                addBtn.find('span').text('Lisa rida');
                addBtn.attr('title', 'Lisa uus rida viimase rea põhjal');
            }
        } else {
            addBtn.find('span').text('Lisa rida');
            addBtn.attr('title', 'Lae esmalt andmed');
        }

        $('#validate-new-rows-btn').prop('disabled', !hasModifiedNewRows);
        $('#remove-new-rows-btn').prop('disabled', !hasNewRows);

        // ADD TOIMIKULEIDJA BUTTON STATE
        updateToimikuleidjaButtonState();

        // Update button text to show counts
        if (hasNewRows) {
            const newRowCount = koondajaData.filter(row => row._isNewRow).length;
            $('#remove-new-rows-btn').find('span').text(`Eemalda uued (${newRowCount})`);

            const modifiedCount = koondajaData.filter(row => row._isNewRow && row._isModified).length;
            if (modifiedCount > 0) {
                $('#validate-new-rows-btn').find('span').text(`Valideeri uued (${modifiedCount})`);
            } else {
                $('#validate-new-rows-btn').find('span').text('Valideeri uued');
            }
        } else {
            $('#remove-new-rows-btn').find('span').text('Eemalda uued');
            $('#validate-new-rows-btn').find('span').text('Valideeri uued');
        }

        updateButtonVisualStates(hasData, hasNewRows, hasModifiedNewRows);
    }

    function updateButtonVisualStates(hasData, hasNewRows, hasModifiedNewRows) {
        // Add button state
        const addBtn = $('#add-row-btn');
        if (hasData) {
            addBtn.removeClass('opacity-50').addClass('hover:bg-green-50');
        } else {
            addBtn.addClass('opacity-50').removeClass('hover:bg-green-50');
        }

        // Validate button state
        const validateBtn = $('#validate-new-rows-btn');
        if (hasModifiedNewRows) {
            validateBtn.removeClass('opacity-50').addClass('hover:bg-blue-50');
        } else {
            validateBtn.addClass('opacity-50').removeClass('hover:bg-blue-50');
        }

        // Remove button state
        const removeBtn = $('#remove-new-rows-btn');
        if (hasNewRows) {
            removeBtn.removeClass('opacity-50').addClass('hover:bg-red-50');
        } else {
            removeBtn.addClass('opacity-50').removeClass('hover:bg-red-50');
        }
    }

    function initializeKoondajaGrid() {
        const gridOptions = {
            columnDefs: [...defaultColumns],
            rowData: koondajaData,
            defaultColDef: {
                resizable: true,
                minWidth: 80,
                maxWidth: 500,
                sortable: true,
                filter: true
            },
            animateRows: true,
            rowSelection: 'multiple', // Allow multiple selection
            enableCellTextSelection: true,
            ensureDomOrder: true,
            suppressRowClickSelection: false, // CHANGED: Allow row selection on click
            suppressCellFocus: false,
            enableRangeSelection: true,

            // Enable context menu
            getContextMenuItems: getContextMenuItems,

            // Enhanced row styling
            getRowClass: function (params) {
                const rowData = params.data;
                if (!rowData) return '';

                let classes = [];

                // Light blue background for rows without "Toimiku nr lõplik"
                if (!rowData.toimiku_nr_loplik || rowData.toimiku_nr_loplik === '') {
                    classes.push('koondaja-no-toimiku-row');
                }

                // Special styling for new rows
                if (rowData._isNewRow) {
                    classes.push('koondaja-new-row');
                }

                return classes.join(' ');
            },

            // ENHANCED: Handle selection changes
            onSelectionChanged: function (event) {
                const selectedRows = koondajaGridApi.getSelectedRows();
                console.log(`Selected ${selectedRows.length} rows`);

                // Trigger custom event for button state updates
                $(document).trigger('koondajaSelectionChanged', {
                    selectedCount: selectedRows.length,
                    selectedRows: selectedRows
                });
            },

            onGridReady: function (params) {
                koondajaGridApi = params.api;
                koondajaColumnApi = params.columnApi;

                updateRowCount();
                updateToolbarButtonStates(); // ADDED: Initial button state update

                if (koondajaData.length === 0) {
                    $('#koondaja-empty-state').removeClass('hidden');
                }

                // Auto-size columns
                setTimeout(() => {
                    if (koondajaGridApi) {
                        try {
                            if (typeof koondajaGridApi.autoSizeAllColumns === 'function') {
                                koondajaGridApi.autoSizeAllColumns(false);
                            } else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeAllColumns === 'function') {
                                koondajaColumnApi.autoSizeAllColumns(false);
                            }
                            isColumnsFittedToHeader = true;

                            const button = $('#toggle-column-width-btn');
                            const buttonText = $('#toggle-column-width-text');
                            buttonText.text('Fit Container');
                            button.removeClass('bg-white border-gray-300 text-gray-700')
                                .addClass('bg-indigo-50 border-indigo-300 text-indigo-700');
                        } catch (error) {
                            console.warn('Auto-sizing failed:', error);
                            koondajaGridApi.sizeColumnsToFit();
                            isColumnsFittedToHeader = false;
                        }
                    }
                }, 100);
            },

            onRowDataUpdated: function () {
                updateRowCount();
                updateInvalidRowCount();
                updateToolbarButtonStates(); // ADDED: Update button states when data changes
                if (koondajaGridApi) {
                    koondajaGridApi.refreshCells();
                }
            },

            // Handle cell value changes for new rows
            onCellValueChanged: function (params) {
                if (params.data && params.data._isNewRow) {
                    params.data._isModified = true;

                    if (['toimiku_nr_loplik', 'toimiku_nr_selgituses', 'viitenumber', 'isiku_registrikood'].includes(params.colDef.field)) {
                        validateNewRow(params.data, params.node.rowIndex);
                    }

                    // Update button states
                    updateToolbarButtonStates();
                }
            }
        };

        const gridDiv = document.querySelector('#koondaja-ag-grid');
        new agGrid.Grid(gridDiv, gridOptions);

        currentColumns = [...defaultColumns];
    }

    function openToimikuleidjaModal() {
        if (!koondajaGridApi || !koondajaData || koondajaData.length === 0) {
            showNotification('Koondaja andmeid pole laetud', 'warning');
            return;
        }

        const selectedRows = koondajaGridApi.getSelectedRows();
        selectedKoondajaRow = selectedRows.length > 0 ? selectedRows[0] : null;

        // Show modal
        $('#toimikuleidja-modal').removeClass('hidden');

        // Prefill fields
        prefillSearchFields();

        // Reset states
        resetToimikuleidjaModalStates();

        // Auto-search if we have selection
        if (selectedKoondajaRow) {
            setTimeout(searchToimikud, 300);
        }
    }

    function closeToimikuleidjaModal() {
        $('#toimikuleidja-modal').addClass('hidden');
        clearToimikuleidjaSearchResults();
        selectedKoondajaRow = null;
    }

    function prefillSearchFields() {
        let otsingValue = '';
        let selgitusValue = '';

        if (selectedKoondajaRow) {
            // Prefill "Otsing" with "Isiku- või registrikood" - this is what we search by
            otsingValue = selectedKoondajaRow.isiku_registrikood || '';

            // Prefill "Selgitus" with "Toimiku nr selgituses" - just for reference/display
            selgitusValue = selectedKoondajaRow.toimiku_nr_selgituses || '';
        }

        $('#toimikuleidja-otsing').val(otsingValue);
        $('#toimikuleidja-selgitus').val(selgitusValue);
    }

    function resetToimikuleidjaModalStates() {
        $('#toimikuleidja-loading').addClass('hidden');
        $('#toimikuleidja-empty').addClass('hidden');
        $('#toimikuleidja-initial').removeClass('hidden');
        $('#toimikuleidja-table-container').removeClass('hidden');
        $('#toimikuleidja-result-count').text('0 tulemust');
    }

    function validateNewRow(rowData, rowIndex) {
        // Basic validation for new rows
        if (!rowData._isNewRow) return;

        // Check if toimiku_nr_loplik is provided
        if (rowData.toimiku_nr_loplik && rowData.toimiku_nr_loplik.trim() !== '') {
            rowData.has_valid_toimiku = true;
            rowData.match_source = 'manual';
        } else {
            rowData.has_valid_toimiku = false;
            rowData.match_source = null;
        }

        // Update the grid to reflect changes
        if (koondajaGridApi) {
            koondajaGridApi.refreshCells({
                rowNodes: [koondajaGridApi.getRowNode(rowIndex)],
                force: true
            });
        }
    }

    function searchToimikud() {
        const searchValue = $('#toimikuleidja-otsing').val().trim(); // võlgniku_kood
        // Note: selgitus field is just for display/reference, not used in search

        if (!searchValue) {
            showNotification('Sisestage isiku- või registrikood', 'warning');
            return;
        }

        // Show loading state
        showToimikuleidjaLoadingState();

        // Make API call - only send search_value (võlgniku_kood)
        $.ajax({
            url: '/api/v1/koondaja/search-toimikud',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                search_value: searchValue
                // selgitus_value is not sent - it's just for reference
            }),
            success: function (response) {
                hideToimikuleidjaLoadingState();

                if (response.success && response.data) {
                    toimikuleidjaData = response.data;
                    displayToimikuleidjaSearchResults();

                    const count = response.data.length;
                    $('#toimikuleidja-result-count').text(`${count} tulemust`);

                    if (count === 0) {
                        showToimikuleidjaEmptyState();
                    } else {
                        // Update message to show what we searched for
                        const searchInfo = `Leitud ${count} toimikut isiku/ettevõtte koodile: ${searchValue}`;
                        console.log(searchInfo);
                    }
                } else {
                    showToimikuleidjaEmptyState();
                    showNotification('Toimikuid ei leitud', 'info');
                }
            },
            error: function (xhr) {
                hideToimikuleidjaLoadingState();
                showToimikuleidjaEmptyState();

                const errorMsg = xhr.responseJSON?.detail || 'Otsingu viga';
                showNotification(errorMsg, 'error');
                console.error('Toimikuleidja search error:', xhr);
            }
        });
    }

    function showToimikuleidjaLoadingState() {
        $('#toimikuleidja-initial').addClass('hidden');
        $('#toimikuleidja-empty').addClass('hidden');
        $('#toimikuleidja-loading').removeClass('hidden');
        $('#toimikuleidja-table-container').addClass('hidden');
    }

    function hideToimikuleidjaLoadingState() {
        $('#toimikuleidja-loading').addClass('hidden');
        $('#toimikuleidja-table-container').removeClass('hidden');
    }

    function showToimikuleidjaEmptyState() {
        $('#toimikuleidja-initial').addClass('hidden');
        $('#toimikuleidja-empty').removeClass('hidden');
        $('#toimikuleidja-table-container').addClass('hidden');
    }

    function displayToimikuleidjaSearchResults() {
        const tbody = $('#toimikuleidja-table-body');
        tbody.empty();

        if (!toimikuleidjaData || toimikuleidjaData.length === 0) {
            showToimikuleidjaEmptyState();
            return;
        }

        toimikuleidjaData.forEach(function (row, index) {
            const tr = createToimikuleidjaTableRow(row, index);
            tbody.append(tr);
        });

        $('#toimikuleidja-initial').addClass('hidden');
        $('#toimikuleidja-empty').addClass('hidden');
    }

    function createToimikuleidjaTableRow(rowData, index) {
        // Format currency
        const jääk = typeof rowData.võla_jääk === 'number' ?
            rowData.võla_jääk.toFixed(2).replace('.', ',') + ' €' :
            (rowData.võla_jääk || '0,00 €');

        // Build sissenõudja display string
        const sissenõudja = [
            rowData.sissenõudja_eesnimi,
            rowData.sissenõudja_perenimi,
            rowData.sissenõudja_kood ? `(${rowData.sissenõudja_kood})` : ''
        ].filter(part => part && part.trim()).join(' ');

        const tr = $(`
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" data-index="${index}">
            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                ${escapeHtml(rowData.toimiku_nr || '')}
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                ${escapeHtml(rowData.võlgnik || '')}
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                ${escapeHtml(sissenõudja)}
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono currency-cell">
                ${jääk}
            </td>
            <td class="px-4 py-3 text-sm">
                <button class="toimiku-select-btn" data-index="${index}" title="Vali see toimik">
                    <i class="fas fa-check text-xs"></i>
                </button>
            </td>
        </tr>
    `);

        // Add click handlers
        tr.find('.toimiku-select-btn').click(function (e) {
            e.stopPropagation();
            selectToimik(index);
        });

        tr.click(function () {
            selectToimik(index);
        });

        return tr;
    }

    function selectToimik(index) {
        if (!toimikuleidjaData[index]) return;

        const selectedToimik = toimikuleidjaData[index];

        // Update the Koondaja row if we have a selected row
        if (selectedKoondajaRow && koondajaGridApi) {
            // Find the row in the grid data
            const koondajaRowIndex = koondajaData.findIndex(row => row === selectedKoondajaRow);

            if (koondajaRowIndex !== -1) {
                // Update the row data
                koondajaData[koondajaRowIndex].toimiku_nr_loplik = selectedToimik.toimiku_nr;
                koondajaData[koondajaRowIndex].nimi_baasis = selectedToimik.võlgnik;
                koondajaData[koondajaRowIndex].toimiku_jaak = selectedToimik.võla_jääk;
                koondajaData[koondajaRowIndex].staatus_baasis = selectedToimik.staatus;
                koondajaData[koondajaRowIndex].has_valid_toimiku = true;
                koondajaData[koondajaRowIndex].match_source = 'toimikuleidja_manual';

                // Mark as modified if it's a new row
                if (koondajaData[koondajaRowIndex]._isNewRow) {
                    koondajaData[koondajaRowIndex]._isModified = true;
                }

                // Refresh the grid
                updateGrid();

                showNotification(`Toimik ${selectedToimik.toimiku_nr} valitud ja andmed uuendatud`, 'success');
            }
        } else {
            showNotification(`Toimik ${selectedToimik.toimiku_nr} valitud`, 'info');
        }

        // Close modal
        closeToimikuleidjaModal();
    }

    function clearToimikuleidjaSearchResults() {
        $('#toimikuleidja-table-body').empty();
        toimikuleidjaData = [];
        resetToimikuleidjaModalStates();
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

// 5. UPDATE the window.KoondajaModule export to include Toimikuleidja functions
    window.KoondajaModule = {
        show: showKoondajaModal,
        hide: hideKoondajaModal,
        getData: function () {
            return koondajaData;
        },
        clearData: clearKoondajaData,
        exportData: exportKoondajaData,
        addRow: function (afterIndex = -1) {
            if (afterIndex === -1) {
                afterIndex = koondajaData.length - 1;
            }
            insertRowAfter(afterIndex);
        },
        validateNewRows: validateNewRowsAgainstDatabase,
        getNewRows: function () {
            return koondajaData.filter(row => row._isNewRow);
        },
        removeNewRows: function () {
            const newRowCount = koondajaData.filter(row => row._isNewRow).length;
            if (newRowCount > 0 && confirm(`Remove ${newRowCount} new rows?`)) {
                koondajaData = koondajaData.filter(row => !row._isNewRow);
                updateGrid();
                showNotification(`Removed ${newRowCount} new rows`, 'success');
            }
        },
        // ADD THESE NEW EXPORTS
        toimikuleidja: {
            open: openToimikuleidjaModal,
            close: closeToimikuleidjaModal,
            search: searchToimikud
        }
    };

// Add toolbar button for adding rows (optional)
    function addRowToolbarButton() {
        const toolbar = $('#koondaja-toolbar'); // Assuming you have a toolbar div

        if (toolbar.length > 0 && $('#add-row-btn').length === 0) {
            const addRowBtn = $(`
            <button id="add-row-btn" 
                    class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <i class="fas fa-plus mr-2"></i>
                Add Row
            </button>
        `);

            addRowBtn.click(() => {
                if (koondajaData.length === 0) {
                    showNotification('Load data first before adding rows', 'warning');
                    return;
                }

                // Add at the end
                insertRowAfter(koondajaData.length - 1);
            });

            toolbar.append(addRowBtn);
        }
    }

    function updateInvalidRowCount() {
        const totalRows = koondajaData.length;
        const invalidRows = koondajaData.filter(row => !row.has_valid_toimiku);
        const newRows = koondajaData.filter(row => row._isNewRow);

        // Breakdown by match source
        const nameMatches = koondajaData.filter(row => row.match_source === 'name').length;

        // Remove existing elements
        $('#koondaja-invalid-count, #koondaja-validation-summary').remove();

        if (invalidRows.length > 0 || nameMatches > 0 || newRows.length > 0) {
            // Create detailed summary
            let summaryHtml = '<div id="koondaja-validation-summary" class="ml-3 flex items-center space-x-4">';

            if (invalidRows.length > 0) {
                summaryHtml += `
                <span class="text-blue-600 font-medium">
                    <i class="fas fa-info-circle mr-1"></i>
                    ${invalidRows.length} ilma toimikuta
                </span>
            `;
            }

            if (newRows.length > 0) {
                const validNewRows = newRows.filter(row => row.has_valid_toimiku).length;
                const invalidNewRows = newRows.length - validNewRows;

                summaryHtml += `
                <span class="text-green-600 font-medium">
                    <i class="fas fa-plus mr-1"></i>
                    ${newRows.length} uut rida
                </span>
            `;

                if (invalidNewRows > 0) {
                    summaryHtml += `
                    <span class="text-orange-600 font-medium text-sm">
                        (${invalidNewRows} valideerimata)
                    </span>
                `;
                }
            }

            summaryHtml += '</div>';
            $('#koondaja-row-count').after(summaryHtml);
        } else if (totalRows > 0) {
            // All have toimiku numbers
            $('#koondaja-row-count').after(`
            <div id="koondaja-validation-summary" class="ml-3">
                <span class="text-green-600 font-medium">
                    <i class="fas fa-check-circle mr-1"></i>
                    Kõik valideeritud
                </span>
            </div>
        `);
        }
    }

    function showKoondajaModal() {
        $('#koondaja-modal').removeClass('hidden');
        $('body').addClass('overflow-hidden');

        if (!koondajaGridApi) {
            setTimeout(initializeKoondajaGrid, 100);
        }
    }

    function hideKoondajaModal() {
        $('#koondaja-modal').addClass('hidden');
        $('body').removeClass('overflow-hidden');
    }

    function toggleColumnWidthImproved() {
        if (!koondajaGridApi) {
            showNotification('Grid not initialized', 'warning');
            return;
        }

        const button = $('#toggle-column-width-btn');
        const buttonText = $('#toggle-column-width-text');

        if (isColumnsFittedToHeader) {
            koondajaGridApi.sizeColumnsToFit();
            buttonText.text('Fit Headers');
            isColumnsFittedToHeader = false;

            button.removeClass('bg-indigo-50 border-indigo-300 text-indigo-700')
                .addClass('bg-white border-gray-300 text-gray-700');

            showNotification('Columns resized to fit container', 'info');
        } else {
            try {
                if (typeof koondajaGridApi.autoSizeAllColumns === 'function') {
                    koondajaGridApi.autoSizeAllColumns(false);
                } else if (koondajaColumnApi && typeof koondajaColumnApi.autoSizeAllColumns === 'function') {
                    koondajaColumnApi.autoSizeAllColumns(false);
                } else {
                    const allColumns = koondajaGridApi.getAllGridColumns();
                    const columnIds = allColumns.map(col => col.getColId());
                    if (typeof koondajaGridApi.autoSizeColumns === 'function') {
                        koondajaGridApi.autoSizeColumns(columnIds, false);
                    }
                }

                buttonText.text('Small Columns');
                isColumnsFittedToHeader = true;

                button.removeClass('bg-white border-gray-300 text-gray-700')
                    .addClass('bg-indigo-50 border-indigo-300 text-indigo-700');

                showNotification('Columns auto-sized to headers', 'info');

            } catch (error) {
                console.error('Error auto-sizing columns:', error);
                showNotification('Error resizing columns', 'error');
            }
        }
    }

    async function loadAllKoondajaData() {
        if (isLoading) {
            showNotification('Data loading already in progress', 'warning');
            return;
        }

        koondajaData = [];
        updateGrid();

        showLoadingModal();
        isLoading = true;

        loadKoondajaDataFromFolders();
    }

    function showLoadingModal() {
        $('#koondaja-loading-modal').removeClass('hidden');
        $('#koondaja-loading-progress').css('width', '0%');
        $('#koondaja-loading-status').text('Starting data load...');
        $('#koondaja-loading-details').text('Waiting...');
        $('#cancel-koondaja-loading').prop('disabled', true);
    }

    function hideLoadingModal() {
        $('#koondaja-loading-modal').addClass('hidden');
    }

    function updateLoadingProgress(current, total, currentFolder, currentFile) {
        const percentage = Math.round((current / total) * 100);
        $('#koondaja-loading-progress').css('width', percentage + '%');
        $('#koondaja-loading-status').text(`Processing folder: ${currentFolder}`);
        $('#koondaja-loading-details').text(`File: ${currentFile || 'Looking for files...'} (${current}/${total})`);
    }

    async function loadKoondajaDataFromFolders() {
        try {
            const allFiles = [];
            let folderIndex = 0;

            // Get all CSV files from all folders
            for (const folder of KOONDAJA_FOLDERS) {
                updateLoadingProgress(folderIndex, KOONDAJA_FOLDERS.length, folder, null);

                try {
                    const response = await $.ajax({
                        url: '/api/v1/koondaja/koondaja-list-files',
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
                showNotification('No CSV files found', 'warning');
                return;
            }

            // Process all files
            let processedFiles = 0;
            let totalRows = 0;
            let invalidRows = 0;
            const errors = [];

            for (const file of allFiles) {
                updateLoadingProgress(processedFiles, allFiles.length, file.folder, file.name);

                try {
                    const response = await $.ajax({
                        url: '/api/v1/koondaja/import-koondaja-csv',
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
                        invalidRows += response.data.filter(row => !row.has_valid_toimiku).length;
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    errors.push(`${file.folder}/${file.name}: ${error.responseJSON?.detail || 'Error'}`);
                }

                processedFiles++;
            }

            updateGrid();
            hideLoadingModal();
            isLoading = false;

            // Show summary
            let message = `Loaded ${totalRows} rows from ${processedFiles} files`;
            if (invalidRows > 0) {
                message += `\n${invalidRows} rows without valid toimiku numbers`;
            }
            if (errors.length > 0) {
                message += `\n\nErrors:\n${errors.slice(0, 5).join('\n')}`;
                if (errors.length > 5) {
                    message += `\n... and ${errors.length - 5} more errors`;
                }
                showNotification(message, 'warning');
            } else {
                showNotification(message, 'success');
            }

        } catch (error) {
            console.error('Error loading Koondaja data:', error);
            hideLoadingModal();
            isLoading = false;
            showNotification('Error loading data', 'error');
        }
    }

    function updateGrid() {
        if (koondajaGridApi) {
            $('#koondaja-empty-state').addClass('hidden');
            koondajaGridApi.setRowData(koondajaData);
            updateRowCount();
            updateInvalidRowCount();
            updateToolbarButtonStates(); // Update button states

            setTimeout(() => {
                if (koondajaGridApi) {
                    koondajaGridApi.refreshCells({
                        force: true,
                        suppressFlash: true
                    });
                }
            }, 100);

            // Trigger custom event
            $(document).trigger('koondajaDataChanged');
        }
    }

// Keyboard shortcuts for power users
    $(document).on('keydown', function (e) {
        if (!$('#koondaja-modal').hasClass('hidden')) {
            // Ctrl+N: Add new row
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                addRowFromSelection();
            }

            // Ctrl+D: Duplicate selected row (alternative shortcut)
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                addRowFromSelection();
            }

            // Delete: Remove selected new rows
            if (e.key === 'Delete') {
                if (koondajaGridApi) {
                    const selectedRows = koondajaGridApi.getSelectedRows();
                    const newRowsToDelete = selectedRows.filter(row => row._isNewRow);

                    if (newRowsToDelete.length > 0) {
                        e.preventDefault();
                        if (confirm(`Eemalda ${newRowsToDelete.length} valitud uut rida?`)) {
                            newRowsToDelete.forEach(row => {
                                const index = koondajaData.indexOf(row);
                                if (index > -1) {
                                    koondajaData.splice(index, 1);
                                }
                            });
                            updateGrid();
                            showNotification(`Eemaldatud ${newRowsToDelete.length} uut rida`, 'success');
                        }
                    }
                }
            }

            // Escape: Clear selection
            if (e.key === 'Escape') {
                if (koondajaGridApi) {
                    koondajaGridApi.deselectAll();
                }
            }
        }
    });

    function updateRowCount() {
        const totalRows = koondajaData.length;
        const newRows = koondajaData.filter(row => row._isNewRow).length;

        let countText = `${totalRows} rida`;
        if (newRows > 0) {
            countText += ` (${newRows} uut)`;
        }

        $('#koondaja-row-count').text(countText);
    }

    function clearKoondajaData() {
        if (koondajaData.length === 0) {
            showNotification('No data to clear', 'info');
            return;
        }

        const newRowCount = koondajaData.filter(row => row._isNewRow).length;
        let confirmMessage = 'Are you sure you want to clear all data?';

        if (newRowCount > 0) {
            confirmMessage += `\n\nThis will also remove ${newRowCount} manually added rows.`;
        }

        if (confirm(confirmMessage)) {
            koondajaData = [];
            updateGrid();
            $('#koondaja-empty-state').removeClass('hidden');
            $('#koondaja-invalid-count, #koondaja-validation-summary').remove();
            showNotification('Data cleared', 'success');
        }
    }

    function exportKoondajaData() {
        if (koondajaData.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }

        // Ask user if they want to include new rows
        const newRowCount = koondajaData.filter(row => row._isNewRow).length;
        let dataToExport = koondajaData;

        if (newRowCount > 0) {
            const includeNew = confirm(
                `You have ${newRowCount} new rows that were added manually.\n\n` +
                `Do you want to include them in the export?\n\n` +
                `Click "OK" to include new rows, "Cancel" to export only original data.`
            );

            if (!includeNew) {
                dataToExport = koondajaData.filter(row => !row._isNewRow);
            }
        }

        if (dataToExport.length === 0) {
            showNotification('No data to export after filtering', 'warning');
            return;
        }

        // Create CSV content with all columns (excluding internal tracking fields)
        const exportColumns = currentColumns.filter(col =>
            !col.field.startsWith('_') && // Exclude internal fields like _isNewRow, _newRowId
            col.field !== 'has_valid_toimiku' &&
            col.field !== 'match_source'
        );

        const headers = exportColumns.map(col => col.headerName);
        const csvContent = [
            headers.join(';'),
            ...dataToExport.map(row =>
                exportColumns.map(col => {
                    let value = row[col.field] || '';

                    // Format numbers with Estonian locale
                    if (typeof value === 'number') {
                        value = value.toFixed(2).replace('.', ',');
                    }

                    // Escape values
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(';')
            )
        ].join('\n');

        // Add BOM for UTF-8
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], {type: 'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = newRowCount > 0 && dataToExport.length === koondajaData.length
            ? `koondaja_with_new_rows_${timestamp}.csv`
            : `koondaja_${timestamp}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const exportedCount = dataToExport.length;
        const newRowsIncluded = dataToExport.filter(row => row._isNewRow).length;

        let message = `Exported ${exportedCount} rows`;
        if (newRowsIncluded > 0) {
            message += ` (including ${newRowsIncluded} new rows)`;
        }

        showNotification(message, 'success');
    }

    function showDbColumnSelector() {
        $.ajax({
            url: '/api/v1/table/columns',
            method: 'GET',
            success: function (response) {
                availableDbColumns = response.columns || [];
                displayDbColumns();
                $('#db-column-selector-modal').removeClass('hidden');
            },
            error: function (xhr) {
                showNotification('Error loading columns', 'error');
            }
        });
    }

    function hideDbColumnSelector() {
        $('#db-column-selector-modal').addClass('hidden');
        $('#db-column-search').val('');
        $('#add-selected-columns-btn, #remove-selected-columns-btn').off('click.columnSelector');
    }

    function displayDbColumns() {
        const container = $('#db-columns-list');
        container.empty();

        const defaultFields = defaultColumns.map(col => col.field);
        const currentDbFields = currentColumns
            .filter(col => !defaultFields.includes(col.field))
            .map(col => col.field);

        if (availableDbColumns.length === 0) {
            container.html('<p class="text-gray-500 text-center py-4">No database columns found</p>');
            return;
        }

        const selectedColumns = availableDbColumns.filter(col => currentDbFields.includes(col.field));
        const availableColumns = availableDbColumns.filter(col => !currentDbFields.includes(col.field));

        // Display selected columns
        if (selectedColumns.length > 0) {
            const selectedSection = $(`
                <div class="mb-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-2">Selected columns (${selectedColumns.length})</h4>
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
                        <span class="text-xs text-green-600 font-medium">ADDED</span>
                    </div>
                `);
                selectedContainer.append(item);
            });
        }

        // Display available columns
        if (availableColumns.length > 0) {
            const availableSection = $(`
                <div>
                    <h4 class="text-sm font-medium text-gray-900 mb-2">Available columns (${availableColumns.length})</h4>
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
        }

        updateColumnSelectorButtons();
    }

    function updateColumnSelectorButtons() {
        const hasSelectedToAdd = $('.available-column-checkbox:checked').length > 0;
        const hasSelectedToRemove = $('.selected-column-checkbox:checked').length > 0;

        if ($('#add-selected-columns-btn').length === 0) {
            $('#cancel-db-columns-btn').after(`
                <button id="add-selected-columns-btn" 
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                    Add selected
                </button>
            `);
            $('#add-selected-columns-btn').click(addSelectedDbColumns);
        }

        if ($('#remove-selected-columns-btn').length === 0) {
            $('#add-selected-columns-btn').after(`
                <button id="remove-selected-columns-btn" 
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ml-2">
                    Remove selected
                </button>
            `);
            $('#remove-selected-columns-btn').click(removeSelectedDbColumns);
        }

        $('#add-selected-columns-btn').prop('disabled', !hasSelectedToAdd);
        $('#remove-selected-columns-btn').prop('disabled', !hasSelectedToRemove);

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
                width: 150
            });
        });

        if (selectedColumns.length === 0) {
            showNotification('Please select at least one column', 'warning');
            return;
        }

        currentColumns = [...currentColumns, ...selectedColumns];
        selectedDbColumns = [...selectedDbColumns, ...selectedColumns.map(col => col.field)];

        if (koondajaGridApi) {
            koondajaGridApi.setColumnDefs(currentColumns);

            if (koondajaData.length > 0) {
                fetchDbColumnData(selectedColumns.map(col => col.field));
            }
        }

        displayDbColumns();
        showNotification(`Added ${selectedColumns.length} columns`, 'success');
    }

    function removeSelectedDbColumns() {
        const columnsToRemove = [];

        $('.selected-column-checkbox:checked').each(function () {
            columnsToRemove.push($(this).data('field'));
        });

        if (columnsToRemove.length === 0) {
            showNotification('Please select at least one column to remove', 'warning');
            return;
        }

        currentColumns = currentColumns.filter(col => !columnsToRemove.includes(col.field));
        selectedDbColumns = selectedDbColumns.filter(field => !columnsToRemove.includes(field));

        if (koondajaGridApi) {
            koondajaGridApi.setColumnDefs(currentColumns);
        }

        displayDbColumns();
        showNotification(`Removed ${columnsToRemove.length} columns`, 'success');
    }

    function fetchDbColumnData(newFields) {
        // For new structure, we may need different identifiers
        const toimikuNumbers = [...new Set(koondajaData.map(row =>
            row.toimiku_nr_loplik || row.toimiku_nr_selgituses || row.toimiku_nr_viitenumbris
        ).filter(nr => nr))];

        if (toimikuNumbers.length === 0) {
            showNotification('No toimiku numbers for database lookup', 'warning');
            return;
        }

        showNotification('Loading database data...', 'info');

        $.ajax({
            url: '/api/v1/koondaja/koondaja-fetch-columns',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                toimiku_numbers: toimikuNumbers,
                fields: newFields
            }),
            success: function (response) {
                if (response.success && response.data) {
                    mergeDbData(response.data);
                    showNotification('Database data added', 'success');
                }
            },
            error: function (xhr) {
                showNotification('Error loading database data', 'error');
            }
        });
    }

    async function validateNewRowsAgainstDatabase() {
        const newRows = koondajaData.filter(row => row._isNewRow && row._isModified);

        if (newRows.length === 0) {
            showNotification('No new rows to validate', 'info');
            return;
        }

        // Extract toimiku numbers from new rows for database lookup
        const toimikuNumbers = newRows
            .map(row => row.toimiku_nr_loplik || row.toimiku_nr_selgituses)
            .filter(nr => nr && nr.trim() !== '');

        if (toimikuNumbers.length === 0) {
            showNotification('No toimiku numbers found in new rows', 'warning');
            return;
        }

        try {
            showNotification('Validating new rows against database...', 'info');

            const response = await $.ajax({
                url: '/api/v1/koondaja/koondaja-fetch-columns',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    toimiku_numbers: toimikuNumbers,
                    fields: ['võlgnik', 'nõude_sisu', 'võla_jääk', 'staatus']
                })
            });

            if (response.success && response.data) {
                // Create lookup map
                const dbDataMap = {};
                response.data.forEach(row => {
                    if (row.toimiku_nr) {
                        dbDataMap[row.toimiku_nr] = row;
                    }
                });

                // Update new rows with database data
                let updatedCount = 0;
                newRows.forEach(row => {
                    const toimikuNr = row.toimiku_nr_loplik || row.toimiku_nr_selgituses;
                    if (toimikuNr && dbDataMap[toimikuNr]) {
                        const dbData = dbDataMap[toimikuNr];
                        row.nimi_baasis = dbData.võlgnik || '';
                        row.noude_sisu = dbData.nõude_sisu || '';
                        row.toimiku_jaak = dbData.võla_jääk || 0.0;
                        row.staatus_baasis = dbData.staatus || '';
                        row.has_valid_toimiku = true;
                        row.match_source = 'database_validated';
                        updatedCount++;
                    }
                });

                updateGrid();
                showNotification(`Validated ${updatedCount} new rows against database`, 'success');
            }
        } catch (error) {
            console.error('Error validating new rows:', error);
            showNotification('Error validating new rows against database', 'error');
        }
    }

    function mergeDbData(dbData) {
        const dbDataMap = {};
        dbData.forEach(row => {
            if (row.toimiku_nr) {
                dbDataMap[row.toimiku_nr] = row;
            }
        });

        koondajaData = koondajaData.map(row => {
            const toimikuNr = row.toimiku_nr_loplik || row.toimiku_nr_selgituses || row.toimiku_nr_viitenumbris;
            const dbRow = dbDataMap[toimikuNr];
            if (dbRow) {
                return {...row, ...dbRow};
            }
            return row;
        });

        updateGrid();
    }

    // Export functions
    window.KoondajaModule = {
        show: showKoondajaModal,
        hide: hideKoondajaModal,
        getData: function () {
            return koondajaData;
        },
        clearData: clearKoondajaData,
        exportData: exportKoondajaData,
        addRow: function (afterIndex = -1) {
            if (afterIndex === -1) {
                afterIndex = koondajaData.length - 1;
            }
            insertRowAfter(afterIndex);
        },
        validateNewRows: validateNewRowsAgainstDatabase,
        getNewRows: function () {
            return koondajaData.filter(row => row._isNewRow);
        },
        removeNewRows: function () {
            const newRowCount = koondajaData.filter(row => row._isNewRow).length;
            if (newRowCount > 0 && confirm(`Remove ${newRowCount} new rows?`)) {
                koondajaData = koondajaData.filter(row => !row._isNewRow);
                updateGrid();
                showNotification(`Removed ${newRowCount} new rows`, 'success');
            }
        }
    };

})();