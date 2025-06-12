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
    let selectedKoondajaRowIndex = -1;
    let tagastusedGridApi = null;
    let tagastusedColumnApi = null;
    let tagastusedData = [];

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
            editable: true,
            sortable: true,
            filter: true,
            width: 150
        },
        {
            field: 'toimiku_nr_viitenumbris',
            headerName: 'Toimiku nr viitenumbris',
            editable: true,
            sortable: true,
            filter: true,
            width: 150
        },

        // Document and transaction info
        {field: 'dokumendi_nr', headerName: 'Dokumendi nr', editable: true, sortable: true, filter: true, width: 120},
        {field: 'kande_kpv', headerName: 'Kande kpv', editable: true, sortable: true, filter: true, width: 100},
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
            editable: true,
            sortable: true,
            filter: true,
            width: 150
        },
        {field: 'panga_tunnus', headerName: 'Panga tunnus', editable: true, sortable: true, filter: true, width: 120},

        // Database info
        {field: 'nimi_baasis', headerName: 'Nimi baasis', editable: true, sortable: true, filter: true, width: 200},
        {field: 'noude_sisu', headerName: 'Nõude sisu', editable: true, sortable: true, filter: true, width: 200},
        {
            field: 'toimiku_jaak', headerName: 'Toimiku jääk', editable: true, sortable: true, filter: true,
            width: 120, valueFormatter: params => formatEstonianNumber(params.value)
        },
        {
            field: 'staatus_baasis',
            headerName: 'Staatus baasis',
            editable: true,
            sortable: true,
            filter: true,
            width: 120
        },

        // Statistics
        {
            field: 'toimikute_arv',
            headerName: 'Toimikute arv tööbaasis',
            editable: true,
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'toimikute_jaakide_summa',
            headerName: 'Toimikute jääkide summa tööbaasis',
            editable: true,
            sortable: true,
            filter: true,
            width: 200,
            valueFormatter: params => formatEstonianNumber(params.value)
        },
        {
            field: 'vahe', headerName: 'Vahe', editable: true, sortable: true, filter: true,
            width: 100, valueFormatter: params => formatEstonianNumber(params.value),
            cellClass: params => params.value < 0 ? 'text-red-600' : ''
        },
        {
            field: 'elatus_miinimumid',
            headerName: 'Elatus-miinimumid',
            editable: true,
            sortable: true,
            filter: true,
            width: 140
        },

        // Payment info - no formatting to keep exact CSV data
        {
            field: 'laekumiste_arv',
            headerName: 'Laekumiste arv',
            editable: true,
            sortable: true,
            filter: true,
            width: 120
        },
        {
            field: 'laekumised_kokku',
            headerName: 'Laekumised kokku',
            editable: true,
            sortable: true,
            filter: true,
            width: 140
        },
        {field: 'tagastamised', headerName: 'Tagastamised', editable: true, sortable: true, filter: true, width: 120},

        // Transaction details - no formatting for Summa to keep exact CSV data
        {field: 's_v', headerName: 'S/V', editable: true, sortable: true, filter: true, width: 60},
        {field: 'summa', headerName: 'Summa', editable: true, sortable: true, filter: true, width: 100},
        {field: 'viitenumber', headerName: 'Viitenumber', editable: true, sortable: true, filter: true, width: 140},
        {
            field: 'arhiveerimistunnus',
            headerName: 'Arhiveerimistunnus',
            editable: true,
            sortable: true,
            filter: true,
            width: 150
        },
        {
            field: 'makse_selgitus',
            headerName: 'Makse selgitus',
            editable: true,
            sortable: true,
            filter: true,
            width: 250
        },
        {field: 'valuuta', headerName: 'Valuuta', editable: false, sortable: true, filter: true, width: 80},

        // Additional info
        {
            field: 'isiku_registrikood',
            headerName: 'Isiku- või registrikood',
            editable: true,
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'laekumise_tunnus',
            headerName: 'Laekumise tunnus',
            editable: true,
            sortable: true,
            filter: true,
            width: 140
        },
        {
            field: 'laekumise_kood',
            headerName: 'Laekumise kood deposiidis',
            editable: true,
            sortable: true,
            filter: true,
            width: 180
        },
        {
            field: 'kliendi_konto',
            headerName: 'Kliendi konto',
            editable: true,
            sortable: true,
            filter: true,
            width: 140
        },

        // Notes
        {field: 'em_markus', headerName: 'EM märkus', editable: false, sortable: true, filter: true, width: 200},
        {
            field: 'toimiku_markused',
            headerName: 'Toimiku märkused',
            editable: true,
            sortable: true,
            filter: true,
            width: 200
        }
    ];

    const tagastusedColumns = [
        {
            field: 'toimiku_nr',
            headerName: 'Toimiku nr',
            sortable: true,
            filter: true,
            width: 120,
            cellClass: 'font-medium'
        },
        {
            field: 'staatus_baasis',
            headerName: 'Staatus baasis',
            sortable: true,
            filter: true,
            width: 120
        },
        {
            field: 'elatus_miinimumid',
            headerName: 'Elatusmiinimumid',
            sortable: true,
            filter: true,
            width: 140
        },
        {
            field: 'tagastamised',
            headerName: 'Tagastamised',
            sortable: true,
            filter: true,
            width: 120,
            valueFormatter: params => formatEstonianNumber(params.value),
            cellClass: params => params.value > 0 ? 'text-green-600 font-medium' : ''
        },
        {
            field: 'nimi_pangakandes',
            headerName: 'Nimi pangakandes',
            sortable: true,
            filter: true,
            width: 200
        },
        {
            field: 'pangakonto_lyhinumber',
            headerName: 'Pangakonto lühinumber',
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'volgniku_nimi',
            headerName: 'Võlgniku nimi',
            sortable: true,
            filter: true,
            width: 200
        },
        {
            field: 'isikukood_baasist',
            headerName: 'Isikukood baasist',
            sortable: true,
            filter: true,
            width: 160
        },
        {
            field: 'isikukood_pangast',
            headerName: 'Isikukood pangast',
            sortable: true,
            filter: true,
            width: 160
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

        // Use the enhanced insertion method
        insertRowDirectlyAfter(targetRowIndex, sourceRow);
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
        const identifier = rowData.toimiku_nr_loplik || rowData.dokumendi_nr || `Rida ${targetRowIndex + 1}`;

        if (!confirm(`Kas oled kindel, et soovid selle rea kustutada?\n\n${identifier}`)) {
            return;
        }

        // Store the current selection for restoration
        const selectedRows = koondajaGridApi.getSelectedRows();
        const wasSelected = selectedRows.includes(rowData);

        // Remove the row
        koondajaData.splice(targetRowIndex, 1);

        // Update the grid
        koondajaGridApi.setRowData(koondajaData);
        updateRowCount();
        updateInvalidRowCount();
        updateToolbarButtonStates();

        // If the deleted row was selected, select the row that took its place (if any)
        if (wasSelected && koondajaData.length > 0) {
            setTimeout(() => {
                const newIndexToSelect = Math.min(targetRowIndex, koondajaData.length - 1);
                const nodeToSelect = koondajaGridApi.getRowNode(newIndexToSelect);
                if (nodeToSelect) {
                    koondajaGridApi.deselectAll();
                    nodeToSelect.setSelected(true);
                    koondajaGridApi.ensureIndexVisible(newIndexToSelect);
                }
            }, 50);
        }

        showNotification(`Rida kustutatud`, 'success');
        $(document).trigger('koondajaDataChanged');
    }

    function getContextMenuItems(params) {
        const result = [];

        if (params.node && params.node.rowIndex !== undefined) {
            const rowIndex = params.node.rowIndex;

            result.push({
                name: `Lisa rida rea ${rowIndex + 1} järele`,
                icon: '<i class="fas fa-plus" style="color: #10b981;"></i>',
                action: () => insertRowAfter(rowIndex)
            });

            result.push('separator');

            result.push({
                name: `Kopeeri rea andmed`,
                icon: '<i class="fas fa-copy" style="color: #3b82f6;"></i>',
                action: () => copyRowToClipboard(rowIndex)
            });

            // Only show delete for new rows
            if (params.node.data && params.node.data._isNewRow) {
                result.push('separator');
                result.push({
                    name: `Kustuta rida`,
                    icon: '<i class="fas fa-trash" style="color: #ef4444;"></i>',
                    action: () => deleteRow(rowIndex)
                });
            }
        }

        return result;
    }

    function copyRowToClipboard(rowIndex) {
        if (rowIndex < 0 || rowIndex >= koondajaData.length) {
            showNotification('Vale rea indeks', 'error');
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
                showNotification(`Rea ${rowIndex + 1} andmed kopeeritud lõikelauale`, 'success');
            }).catch(() => {
                showNotification('Lõikelauale kopeerimine ebaõnnestus', 'error');
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = formattedData;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showNotification(`Rea ${rowIndex + 1} andmed kopeeritud lõikelauale`, 'success');
            } catch (err) {
                showNotification('Lõikelauale kopeerimine ebaõnnestus', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    // Initialize Koondaja when document is ready
    $(document).ready(function () {
        initializeKoondaja();
    });

    function initializeKoondaja() {
        // Existing button click handlers...
        $('#koondaja-btn').click(showKoondajaModal);
        $('#close-koondaja-modal, #koondaja-backdrop').click(hideKoondajaModal);
        $('#load-koondaja-data-btn').click(loadAllKoondajaData);
        $('#add-db-columns-btn').click(showDbColumnSelector);
        $('#clear-koondaja-data-btn').click(clearKoondajaData);
        $('#export-koondaja-btn').click(exportKoondajaData);
        $('#toggle-column-width-btn').click(toggleColumnWidthImproved);

        // Row management button handlers
        $('#add-row-btn').click(addRowFromSelection);
        $('#validate-new-rows-btn').click(validateNewRowsAgainstDatabase);
        $('#remove-new-rows-btn').click(removeAllNewRows);

        // Toimikuleidja handlers
        $('#toimikuleidja-btn').click(openToimikuleidjaModal);
        $('#close-toimikuleidja-modal, #toimikuleidja-backdrop, #close-toimikuleidja-btn').click(closeToimikuleidjaModal);
        $('#toimikuleidja-search-btn').click(searchToimikud);

        // ADD THESE NEW HANDLERS for Tagastused
        $('#tagastused-btn').click(showTagastusedModal);
        $('#close-tagastused-modal, #tagastused-backdrop').click(hideTagastusedModal);
        $('#refresh-tagastused-btn').click(refreshTagastusedData);
        $('#export-tagastused-btn').click(exportTagastusedData);

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
        $(document).on('koondajaDataChanged', function () {
            updateToolbarButtonStates();
            updateToimikuleidjaButtonState();
        });

        // Handle selection changes for toolbar button states
        $(document).on('koondajaSelectionChanged', function () {
            updateToolbarButtonStates();
            updateToimikuleidjaButtonState();
        });

        // Enter key support for search fields
        $('#toimikuleidja-otsing, #toimikuleidja-selgitus').keypress(function (e) {
            if (e.which === 13) { // Enter key
                searchToimikud();
            }
        });
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
            const selectedRow = selectedRows[0];
            const hasRegistrikood = selectedRow.isiku_registrikood && selectedRow.isiku_registrikood.trim() !== '';

            if (hasRegistrikood) {
                $('#toimikuleidja-btn').find('span').text('Toimikuleidja (valmis)');
                $('#toimikuleidja-btn').attr('title', 'Otsi toimikuid valitud rea registrikoodi põhjal');
                $('#toimikuleidja-btn').removeClass('opacity-50').addClass('hover:bg-blue-50');
            } else {
                $('#toimikuleidja-btn').find('span').text('Toimikuleidja (puudub kood)');
                $('#toimikuleidja-btn').attr('title', 'Valitud real puudub isiku-/registrikood');
                $('#toimikuleidja-btn').addClass('opacity-50').removeClass('hover:bg-blue-50');
            }
        } else {
            $('#toimikuleidja-btn').find('span').text('Toimikuleidja');
            $('#toimikuleidja-btn').attr('title', hasData ? 'Vali rida ja otsi toimikuid' : 'Lae esmalt andmed');
            $('#toimikuleidja-btn').removeClass('hover:bg-blue-50');

            if (hasData) {
                $('#toimikuleidja-btn').removeClass('opacity-50');
            } else {
                $('#toimikuleidja-btn').addClass('opacity-50');
            }
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

            // Find the exact index of this row in koondajaData using multiple criteria
            sourceRowIndex = findRowIndex(sourceRow);

            if (sourceRowIndex === -1) {
                // Fallback: try to find by matching key fields
                sourceRowIndex = koondajaData.findIndex(row => {
                    return (row.dokumendi_nr === sourceRow.dokumendi_nr &&
                            row.kande_kpv === sourceRow.kande_kpv) ||
                        (row.viitenumber === sourceRow.viitenumber && sourceRow.viitenumber) ||
                        (row._newRowId === sourceRow._newRowId && sourceRow._newRowId);
                });
            }
        } else {
            // No selection - use the last row
            sourceRowIndex = koondajaData.length - 1;
            sourceRow = koondajaData[sourceRowIndex];
        }

        if (sourceRowIndex === -1 || !sourceRow) {
            showNotification('Ei suuda leida allikat rea kopeerimiseks', 'error');
            return;
        }

        // Insert the new row directly after the source row
        insertRowDirectlyAfter(sourceRowIndex, sourceRow);
    }

    function insertRowDirectlyAfter(sourceRowIndex, sourceRow) {
        if (sourceRowIndex < 0 || sourceRowIndex >= koondajaData.length) {
            showNotification('Vale rea indeks', 'error');
            return;
        }

        // Create the new row
        const newRow = copyRowDataEnhanced(sourceRow);
        if (!newRow) {
            showNotification('Viga rea andmete kopeerimisel', 'error');
            return;
        }

        // Calculate the exact insertion index (directly after source row)
        const insertIndex = sourceRowIndex + 1;

        // Insert the new row at the calculated position
        koondajaData.splice(insertIndex, 0, newRow);

        console.log(`Inserted new row at index ${insertIndex} (after source row ${sourceRowIndex})`);

        // Update the grid immediately
        updateGridAndMaintainSelection(insertIndex);

        // Provide user feedback
        const sourceInfo = sourceRow.toimiku_nr_loplik || sourceRow.dokumendi_nr || `Rida ${sourceRowIndex + 1}`;
        showNotification(`Uus rida lisatud rida ${insertIndex + 1} (kopeeritud: ${sourceInfo})`, 'success');
    }

    function updateGridAndMaintainSelection(newRowIndex) {
        if (!koondajaGridApi) return;

        // Store current scroll position
        const scrollTop = document.querySelector('.ag-body-viewport').scrollTop;

        // Update the grid data
        koondajaGridApi.setRowData(koondajaData);

        // Update counters and states
        updateRowCount();
        updateInvalidRowCount();
        updateToolbarButtonStates();

        // Restore scroll position and handle new row
        setTimeout(() => {
            // Restore scroll position
            document.querySelector('.ag-body-viewport').scrollTop = scrollTop;

            // Ensure the new row is visible
            koondajaGridApi.ensureIndexVisible(newRowIndex);

            // Get the new row node and select it
            const newRowNode = koondajaGridApi.getRowNode(newRowIndex);
            if (newRowNode) {
                // Clear previous selections and select the new row
                koondajaGridApi.deselectAll();
                newRowNode.setSelected(true);

                // Add visual feedback - flash the new row
                koondajaGridApi.flashCells({
                    rowNodes: [newRowNode],
                    columns: ['toimiku_nr_loplik', 'dokumendi_nr'], // Flash key columns
                    fadeDelay: 2000
                });

                // Focus on the first editable cell of the new row
                const editableColumns = koondajaGridApi.getAllGridColumns()
                    .filter(col => col.getColDef().editable);

                if (editableColumns.length > 0) {
                    koondajaGridApi.setFocusedCell(newRowIndex, editableColumns[0]);
                }

                // Add temporary CSS class for enhanced visual feedback
                setTimeout(() => {
                    const rowElement = document.querySelector(`[row-index="${newRowIndex}"]`);
                    if (rowElement) {
                        rowElement.classList.add('koondaja-new-row-flash');
                        setTimeout(() => {
                            if (rowElement && rowElement.classList) {
                                rowElement.classList.remove('koondaja-new-row-flash');
                            }
                        }, 1500);
                    }
                }, 100);
            }

            // Trigger data change events
            $(document).trigger('koondajaDataChanged');

            console.log(`Grid updated, new row at index ${newRowIndex} selected and visible`);
        }, 50);
    }

    function findRowIndex(targetRow) {
        if (!targetRow) return -1;

        // Try to find exact object match first
        let index = koondajaData.indexOf(targetRow);
        if (index !== -1) return index;

        // If not found, try to match by unique identifiers
        for (let i = 0; i < koondajaData.length; i++) {
            const row = koondajaData[i];

            // Match by internal ID for new rows
            if (targetRow._newRowId && row._newRowId === targetRow._newRowId) {
                return i;
            }

            // Match by document number and date
            if (targetRow.dokumendi_nr && targetRow.kande_kpv &&
                row.dokumendi_nr === targetRow.dokumendi_nr &&
                row.kande_kpv === targetRow.kande_kpv) {
                return i;
            }

            // Match by reference number if unique
            if (targetRow.viitenumber &&
                row.viitenumber === targetRow.viitenumber &&
                targetRow.viitenumber.trim() !== '') {
                return i;
            }

            // Match by archive reference if unique
            if (targetRow.arhiveerimistunnus &&
                row.arhiveerimistunnus === targetRow.arhiveerimistunnus &&
                targetRow.arhiveerimistunnus.trim() !== '') {
                return i;
            }
        }

        return -1; // Not found
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

        // Store current selection to try to maintain something selected
        const selectedRows = koondajaGridApi ? koondajaGridApi.getSelectedRows() : [];
        const hasSelectedNewRow = selectedRows.some(row => row._isNewRow);

        // Remove all new rows
        koondajaData = koondajaData.filter(row => !row._isNewRow);

        // Update the grid
        koondajaGridApi.setRowData(koondajaData);
        updateRowCount();
        updateInvalidRowCount();
        updateToolbarButtonStates();

        // If we had a selected new row, try to select something nearby
        if (hasSelectedNewRow && koondajaData.length > 0) {
            setTimeout(() => {
                const nodeToSelect = koondajaGridApi.getRowNode(Math.min(0, koondajaData.length - 1));
                if (nodeToSelect) {
                    koondajaGridApi.deselectAll();
                    nodeToSelect.setSelected(true);
                    koondajaGridApi.ensureIndexVisible(0);
                }
            }, 50);
        }

        showNotification(`Eemaldatud ${newRows.length} uut rida`, 'success');
        $(document).trigger('koondajaDataChanged');
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

            // Keep fields that make sense to copy:
            // - toimiku_nr_loplik, arvelduskonto_nr, panga info, nimi_baasis, etc.

            // Add tracking fields for new rows
            newRow._isNewRow = true;
            newRow._newRowId = generateUniqueId();
            newRow._sourceRowData = {
                toimiku_nr_loplik: sourceRow.toimiku_nr_loplik,
                nimi_baasis: sourceRow.nimi_baasis,
                copied_at: new Date().toISOString(),
                source_index: koondajaData.indexOf(sourceRow)
            };

            // Set initial validation state
            newRow.has_valid_toimiku = !!newRow.toimiku_nr_loplik;
            newRow.match_source = newRow.has_valid_toimiku ? 'copied' : null;
            newRow._isModified = false; // Will be set to true when user edits

            // Reset calculated fields
            newRow.vahe = 0.0;
            newRow.laekumiste_arv = 1;
            newRow.laekumised_kokku = '';

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

        // UPDATE: Add tagastused button state
        const tagastusedBtn = $('#tagastused-btn');
        tagastusedBtn.prop('disabled', !hasData);

        if (hasData) {
            tagastusedBtn.removeClass('opacity-50').addClass('hover:bg-blue-50');
            tagastusedBtn.attr('title', 'Ava tagastuste aruanne');
        } else {
            tagastusedBtn.addClass('opacity-50').removeClass('hover:bg-blue-50');
            tagastusedBtn.attr('title', 'Lae esmalt andmed');
        }

        updateButtonVisualStates(hasData, hasNewRows, hasModifiedNewRows);

        // Always update Toimikuleidja button state
        updateToimikuleidjaButtonState();
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
            rowSelection: 'multiple',
            enableCellTextSelection: true,
            ensureDomOrder: true,
            suppressRowClickSelection: false,
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

                // Update button states immediately
                updateToolbarButtonStates();
                updateToimikuleidjaButtonState();

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
                updateToolbarButtonStates();
                updateToimikuleidjaButtonState(); // Initialize button state

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
                updateToolbarButtonStates();
                updateToimikuleidjaButtonState(); // Update on data changes
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
                    updateToimikuleidjaButtonState();
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

        // Store the row index for easier updating later
        if (selectedKoondajaRow) {
            selectedKoondajaRowIndex = koondajaData.findIndex(row => row === selectedKoondajaRow);
        } else {
            selectedKoondajaRowIndex = -1;
        }

        // Show modal
        $('#toimikuleidja-modal').removeClass('hidden');

        // Prefill fields
        prefillSearchFields();

        // Reset states
        resetToimikuleidjaModalStates();

        // Auto-search if we have selection with valid registrikood
        if (selectedKoondajaRow && selectedKoondajaRow.isiku_registrikood) {
            setTimeout(searchToimikud, 300);
        }
    }

    function closeToimikuleidjaModal() {
        $('#toimikuleidja-modal').addClass('hidden');
        clearToimikuleidjaSearchResults();
        selectedKoondajaRow = null;
        selectedKoondajaRowIndex = -1;
    }

    function prefillSearchFields() {
        let otsingValue = '';
        let selgitusValue = '';

        if (selectedKoondajaRow) {
            // Prefill "Otsing" with "Isiku- või registrikood" - this is what we search by
            otsingValue = selectedKoondajaRow.isiku_registrikood || '';

            // Prefill "Selgitus" with "Toimiku nr selgituses" - just for reference/display
            selgitusValue = selectedKoondajaRow.toimiku_nr_selgituses || '';

            // Show which row is selected
            const identifier = selectedKoondajaRow.toimiku_nr_loplik ||
                selectedKoondajaRow.dokumendi_nr ||
                `Rida ${selectedKoondajaRowIndex + 1}`;

            console.log(`Toimikuleidja opened for row: ${identifier}`);
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

        // Recalculate difference if both values are present
        if (rowData.toimiku_jaak && rowData.summa) {
            const toimikuJaak = parseFloat(rowData.toimiku_jaak) || 0.0;
            const summa = parseFloat(String(rowData.summa).replace(',', '.')) || 0.0;
            rowData.vahe = toimikuJaak - summa;
        }

        // Update the grid to reflect changes without losing position
        if (koondajaGridApi) {
            const rowNode = koondajaGridApi.getRowNode(rowIndex);
            if (rowNode) {
                koondajaGridApi.refreshCells({
                    rowNodes: [rowNode],
                    force: true
                });
            }
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
        // Format currency with better handling
        let jääk = '0,00 €';
        if (typeof rowData.võla_jääk === 'number') {
            jääk = rowData.võla_jääk.toFixed(2).replace('.', ',') + ' €';
        } else if (rowData.võla_jääk) {
            const numValue = parseFloat(String(rowData.võla_jääk).replace(',', '.'));
            if (!isNaN(numValue)) {
                jääk = numValue.toFixed(2).replace('.', ',') + ' €';
            }
        }

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
                <button class="toimiku-select-btn px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded" 
                        data-index="${index}" title="Vali see toimik">
                    <i class="fas fa-check text-xs"></i>
                    <span class="ml-1">Vali</span>
                </button>
            </td>
        </tr>
    `);

        // Add click handlers
        tr.find('.toimiku-select-btn').click(function (e) {
            e.stopPropagation();
            selectToimik(index);
        });

        // Double-click on row also selects
        tr.dblclick(function () {
            selectToimik(index);
        });

        // Single click highlights row
        tr.click(function () {
            // Remove highlight from other rows
            $('#toimikuleidja-table-body tr').removeClass('bg-blue-50 dark:bg-blue-900');
            // Highlight this row
            $(this).addClass('bg-blue-50 dark:bg-blue-900');
        });

        return tr;
    }

    function selectToimik(index) {
        if (!toimikuleidjaData[index]) {
            showNotification('Valitud toimikut ei leitud', 'error');
            return;
        }

        const selectedToimik = toimikuleidjaData[index];

        // Update the Koondaja row if we have a selected row
        if (selectedKoondajaRow && koondajaGridApi && selectedKoondajaRowIndex >= 0) {
            // Verify the row still exists
            if (selectedKoondajaRowIndex >= koondajaData.length) {
                showNotification('Valitud rida pole enam olemas', 'error');
                closeToimikuleidjaModal();
                return;
            }

            // Update the row data with new toimik information
            const updatedRow = koondajaData[selectedKoondajaRowIndex];

            // Store original values for comparison
            const originalToimikuNr = updatedRow.toimiku_nr_loplik;

            // Update toimik-related fields
            updatedRow.toimiku_nr_loplik = selectedToimik.toimiku_nr || '';
            updatedRow.nimi_baasis = selectedToimik.võlgnik || '';
            updatedRow.toimiku_jaak = selectedToimik.võla_jääk || 0.0;
            updatedRow.staatus_baasis = selectedToimik.staatus || '';
            updatedRow.has_valid_toimiku = true;
            updatedRow.match_source = 'toimikuleidja_manual';

            // Add additional fields if available
            if (selectedToimik.nõude_sisu) {
                updatedRow.noude_sisu = selectedToimik.nõude_sisu;
            }
            if (selectedToimik.rmp_märkused) {
                updatedRow.em_markus = selectedToimik.rmp_märkused;
            }
            if (selectedToimik.märkused) {
                updatedRow.toimiku_markused = selectedToimik.märkused;
            }

            // Mark as modified if it's a new row
            if (updatedRow._isNewRow) {
                updatedRow._isModified = true;
            }

            // Calculate difference if we have both toimiku_jaak and summa
            if (updatedRow.toimiku_jaak && updatedRow.summa) {
                const toimikuJaak = parseFloat(updatedRow.toimiku_jaak) || 0.0;
                const summa = parseFloat(String(updatedRow.summa).replace(',', '.')) || 0.0;
                updatedRow.vahe = toimikuJaak - summa;
            }

            // Update the data source
            koondajaData[selectedKoondajaRowIndex] = updatedRow;

            // Refresh the grid to show changes
            updateGrid();

            // Highlight the updated row
            setTimeout(() => {
                if (koondajaGridApi) {
                    const rowNode = koondajaGridApi.getRowNode(selectedKoondajaRowIndex);
                    if (rowNode) {
                        // Flash the updated row
                        koondajaGridApi.flashCells({
                            rowNodes: [rowNode],
                            fadeDelay: 1500
                        });

                        // Ensure the row is visible
                        koondajaGridApi.ensureIndexVisible(selectedKoondajaRowIndex);

                        // Keep the row selected
                        koondajaGridApi.deselectAll();
                        rowNode.setSelected(true);
                    }
                }
            }, 100);

            // Show success message
            const changeMessage = originalToimikuNr !== selectedToimik.toimiku_nr
                ? `Toimik muudetud: ${originalToimikuNr || 'tühi'} → ${selectedToimik.toimiku_nr}`
                : `Toimik ${selectedToimik.toimiku_nr} valitud ja andmed uuendatud`;

            showNotification(changeMessage, 'success');

            // Log the update for debugging
            console.log(`Koondaja row ${selectedKoondajaRowIndex + 1} updated with toimik:`, {
                toimiku_nr: selectedToimik.toimiku_nr,
                võlgnik: selectedToimik.võlgnik,
                võla_jääk: selectedToimik.võla_jääk
            });

        } else {
            // No selected row, just show info
            showNotification(`Toimik ${selectedToimik.toimiku_nr} valitud`, 'info');
            console.log('No Koondaja row selected for update');
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
        // Enhanced Toimikuleidja integration
        toimikuleidja: {
            open: openToimikuleidjaModal,
            close: closeToimikuleidjaModal,
            search: searchToimikud,
            getSelectedRow: function () {
                return {
                    row: selectedKoondajaRow,
                    index: selectedKoondajaRowIndex
                };
            },
            updateSelectedRow: function (toimikData) {
                if (selectedKoondajaRowIndex >= 0 && toimikData) {
                    const index = koondajaData.findIndex(row =>
                        row.toimiku_nr === toimikData.toimiku_nr
                    );
                    if (index >= 0) {
                        selectToimik(index);
                    }
                }
            }
        },
        // NEW: Tagastused integration
        tagastused: {
            show: showTagastusedModal,
            hide: hideTagastusedModal,
            refresh: refreshTagastusedData,
            export: exportTagastusedData,
            getData: function () {
                return tagastusedData;
            }
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

            // Store current selection and scroll position
            const selectedRows = koondajaGridApi.getSelectedRows();
            const scrollTop = document.querySelector('.ag-body-viewport')?.scrollTop || 0;

            // Update row data
            koondajaGridApi.setRowData(koondajaData);

            // Update UI elements
            updateRowCount();
            updateInvalidRowCount();
            updateToolbarButtonStates();

            setTimeout(() => {
                // Restore scroll position
                const viewport = document.querySelector('.ag-body-viewport');
                if (viewport) {
                    viewport.scrollTop = scrollTop;
                }

                // Try to restore selection if possible
                if (selectedRows.length > 0 && koondajaData.length > 0) {
                    const firstSelectedRow = selectedRows[0];
                    const newIndex = findRowIndex(firstSelectedRow);

                    if (newIndex >= 0) {
                        const nodeToSelect = koondajaGridApi.getRowNode(newIndex);
                        if (nodeToSelect) {
                            koondajaGridApi.deselectAll();
                            nodeToSelect.setSelected(true);
                        }
                    }
                }

                // Refresh cells with animations
                if (koondajaGridApi) {
                    koondajaGridApi.refreshCells({
                        force: true,
                        suppressFlash: false
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
            // Ctrl+Enter: Add new row after selected
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                addRowFromSelection();
            }

            // Ctrl+D: Duplicate selected row (alternative shortcut)
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                addRowFromSelection();
            }

            // Ctrl+Shift+D: Delete selected new rows
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                if (koondajaGridApi) {
                    const selectedRows = koondajaGridApi.getSelectedRows();
                    const newRowsToDelete = selectedRows.filter(row => row._isNewRow);

                    if (newRowsToDelete.length > 0) {
                        e.preventDefault();
                        if (confirm(`Eemalda ${newRowsToDelete.length} valitud uut rida?`)) {
                            // Remove rows in reverse order to maintain indices
                            const indicesToDelete = newRowsToDelete.map(row => koondajaData.indexOf(row))
                                .sort((a, b) => b - a); // Sort in descending order

                            indicesToDelete.forEach(index => {
                                if (index > -1) {
                                    koondajaData.splice(index, 1);
                                }
                            });

                            updateGridAndMaintainSelection(-1); // No specific row to select
                            showNotification(`Eemaldatud ${newRowsToDelete.length} uut rida`, 'success');
                        }
                    }
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

    function showTagastusedModal() {
        if (!koondajaData || koondajaData.length === 0) {
            showNotification('Koondaja andmeid pole laetud', 'warning');
            return;
        }

        $('#tagastused-modal').removeClass('hidden');
        $('body').addClass('overflow-hidden');

        if (!tagastusedGridApi) {
            setTimeout(initializeTagastusedGrid, 100);
        }

        // Process the data for tagastused
        processTagastusedData();
    }

    function hideTagastusedModal() {
        $('#tagastused-modal').addClass('hidden');
        $('body').removeClass('overflow-hidden');
    }

    function initializeTagastusedGrid() {
        const gridOptions = {
            columnDefs: [...tagastusedColumns],
            rowData: tagastusedData,
            defaultColDef: {
                resizable: true,
                minWidth: 80,
                maxWidth: 500,
                sortable: true,
                filter: true
            },
            animateRows: true,
            rowSelection: 'single',
            enableCellTextSelection: true,
            suppressRowClickSelection: false,

            onGridReady: function (params) {
                tagastusedGridApi = params.api;
                tagastusedColumnApi = params.columnApi;

                updateTagastusedRowCount();

                if (tagastusedData.length === 0) {
                    $('#tagastused-empty-state').removeClass('hidden');
                }

                // Auto-size columns
                setTimeout(() => {
                    if (tagastusedGridApi) {
                        try {
                            tagastusedGridApi.autoSizeAllColumns(false);
                        } catch (error) {
                            console.warn('Auto-sizing failed:', error);
                            tagastusedGridApi.sizeColumnsToFit();
                        }
                    }
                }, 100);
            },

            onRowDataUpdated: function () {
                updateTagastusedRowCount();
                if (tagastusedGridApi) {
                    tagastusedGridApi.refreshCells();
                }
            }
        };

        const gridDiv = document.querySelector('#tagastused-ag-grid');
        new agGrid.Grid(gridDiv, gridOptions);
    }

    async function processTagastusedData() {
        try {
            // Show loading state
            $('#tagastused-empty-state').addClass('hidden');

            // Filter koondaja data for relevant records
            const relevantData = koondajaData.filter(row => {
                // Include rows that have tagastamised value or specific conditions
                return row.tagastamised && parseFloat(row.tagastamised) !== 0;
            });

            // If no relevant data, include all data for now
            const dataToProcess = relevantData.length > 0 ? relevantData : koondajaData;

            // Get unique võlgniku names for database lookup
            const volgnikuNimed = [...new Set(dataToProcess
                .map(row => row.nimi_baasis)
                .filter(name => name && name.trim() !== ''))];

            // Fetch isikukood data from database
            const isikukoodMap = await fetchIsikukoodData(volgnikuNimed);

            // Process each row
            tagastusedData = dataToProcess.map(row => ({
                toimiku_nr: row.toimiku_nr_loplik || '',
                staatus_baasis: row.staatus_baasis || '',
                elatus_miinimumid: row.elatus_miinimumid || '',
                tagastamised: row.tagastamised || '',
                nimi_pangakandes: row.panga_tunnus_nimi || '', // 5th item from CSV
                pangakonto_lyhinumber: row.arvelduskonto_nr || '', // 4th item from CSV
                volgniku_nimi: row.nimi_baasis || '',
                isikukood_baasist: isikukoodMap[row.nimi_baasis] || '',
                isikukood_pangast: row.isiku_registrikood || ''
            }));

            // Update the grid
            if (tagastusedGridApi) {
                $('#tagastused-empty-state').addClass('hidden');
                tagastusedGridApi.setRowData(tagastusedData);
            }

            // Calculate and update summary
            updateTagastusedSummary();

            showNotification(`Tagastuste andmed laetud: ${tagastusedData.length} rida`, 'success');

        } catch (error) {
            console.error('Error processing tagastused data:', error);
            showNotification('Viga tagastuste andmete töötlemisel', 'error');
        }
    }

    async function fetchIsikukoodData(volgnikuNimed) {
        if (volgnikuNimed.length === 0) {
            return {};
        }

        try {
            const response = await $.ajax({
                url: '/api/v1/koondaja/fetch-isikukoodid',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    volgniku_nimed: volgnikuNimed
                })
            });

            if (response.success && response.data) {
                const isikukoodMap = {};
                response.data.forEach(item => {
                    if (item.võlgnik && item.võlgniku_kood) {
                        isikukoodMap[item.võlgnik] = item.võlgniku_kood;
                    }
                });
                return isikukoodMap;
            }

            return {};
        } catch (error) {
            console.error('Error fetching isikukood data:', error);
            return {};
        }
    }

    function updateTagastusedSummary() {
        if (!tagastusedData || tagastusedData.length === 0) {
            // Reset all summary values to 0
            $('#summary-tagastamised').text('0,00 €');
            $('#summary-arhiivis').text('0,00 €');
            $('#summary-seb-deposit').text('0,00 €');
            $('#summary-baasivaline').text('0,00 €');
            $('#summary-tagastamised-baasi').text('0,00 €');
            $('#summary-laekus-kokku').text('0,00 €');
            $('#summary-baasi-kandmiseks').text('0,00 €');
            $('#summary-baasi-ei-kanta').text('0,00 €');
            $('#summary-date-range').text('Kuupäev laekus kokku');
            return;
        }

        // Calculate sums from tagastused data
        let tagastamisedSum = 0;
        let laekusKokku = 0;

        tagastusedData.forEach(row => {
            // Sum tagastamised
            const tagastamised = safe_number_conversion(row.tagastamised, 0);
            tagastamisedSum += tagastamised;
        });

        // Calculate laekus kokku from original koondaja data
        koondajaData.forEach(row => {
            const summa = safe_number_conversion(row.summa, 0);
            laekusKokku += summa;
        });

        // Get date range from koondaja data
        const dates = koondajaData
            .map(row => row.kande_kpv)
            .filter(date => date && date.trim() !== '')
            .sort();

        let dateRangeText = 'Kuupäev laekus kokku';
        if (dates.length > 0) {
            const firstDate = dates[0];
            const lastDate = dates[dates.length - 1];

            if (firstDate === lastDate) {
                dateRangeText = `${firstDate} laekus kokku`;
            } else {
                dateRangeText = `${firstDate} - ${lastDate} laekus kokku`;
            }
        }

        // Static values for now (as requested)
        const arhiivis = 0;
        const sebDeposit = 0;
        const baasiVaeline = 0; // Will be calculated later if needed
        const baasisKandmiseks = 0; // Static for now

        // Calculated values
        const tagastamisedBaasi = tagastamisedSum; // Same as tagastamised sum for now
        const baasEiKanta = laekusKokku - baasisKandmiseks;

        // Update the summary display
        $('#summary-tagastamised').text(formatEstonianCurrency(tagastamisedSum));
        $('#summary-arhiivis').text(formatEstonianCurrency(arhiivis));
        $('#summary-seb-deposit').text(formatEstonianCurrency(sebDeposit));
        $('#summary-baasivaline').text(formatEstonianCurrency(baasiVaeline));
        $('#summary-tagastamised-baasi').text(formatEstonianCurrency(tagastamisedBaasi));
        $('#summary-laekus-kokku').text(formatEstonianCurrency(laekusKokku));
        $('#summary-baasi-kandmiseks').text(formatEstonianCurrency(baasisKandmiseks));
        $('#summary-baasi-ei-kanta').text(formatEstonianCurrency(baasEiKanta));
        $('#summary-date-range').text(dateRangeText);
    }

    function formatEstonianCurrency(value) {
        if (value === null || value === undefined || value === '') {
            return '0,00 €';
        }

        const num = parseFloat(value) || 0;
        return num.toFixed(2).replace('.', ',') + ' €';
    }

    function safe_number_conversion(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }

        try {
            if (typeof value === 'number') {
                return value;
            }

            if (typeof value === 'string') {
                const cleaned = value.trim().replace(',', '.');
                const num = parseFloat(cleaned);
                return isNaN(num) ? defaultValue : num;
            }

            return parseFloat(value) || defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    function updateTagastusedRowCount() {
        const totalRows = tagastusedData.length;
        $('#tagastused-row-count').text(`${totalRows} rida`);
    }

    function refreshTagastusedData() {
        if (!koondajaData || koondajaData.length === 0) {
            showNotification('Koondaja andmeid pole laetud', 'warning');
            return;
        }

        processTagastusedData();
    }

    function exportTagastusedData() {
        if (!tagastusedData || tagastusedData.length === 0) {
            showNotification('Andmeid pole eksportimiseks', 'warning');
            return;
        }

        // Create CSV content
        const headers = tagastusedColumns.map(col => col.headerName);
        const csvContent = [
            headers.join(';'),
            ...tagastusedData.map(row =>
                tagastusedColumns.map(col => {
                    let value = row[col.field] || '';

                    // Format numbers with Estonian locale
                    if (col.field === 'tagastamised' && typeof value === 'number') {
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
        const filename = `tagastused_${timestamp}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification(`Eksporditud ${tagastusedData.length} rida`, 'success');
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