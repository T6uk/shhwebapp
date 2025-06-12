/**
 * Koondaja Grid Module
 * Handles main grid functionality, row management, and data operations
 * File: /static/js/koondaja-grid.js
 * Dependencies: koondaja-shared.js
 */

(function(window) {
    'use strict';

    // Check if shared module is loaded
    if (!window.KoondajaShared) {
        console.error('KoondajaShared module must be loaded before KoondajaGrid');
        return;
    }

    const { State, StateManager, Utils, RowUtils, defaultColumns } = window.KoondajaShared;

    // ===========================
    // GRID MANAGEMENT
    // ===========================

    const GridManager = {
        /**
         * Initialize the main Koondaja grid
         */
        initializeGrid() {
            const gridOptions = {
                columnDefs: [...defaultColumns],
                rowData: StateManager.getKoondajaData(),
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
                getContextMenuItems: this.getContextMenuItems,

                // Enhanced row styling
                getRowClass: function(params) {
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

                // Handle selection changes
                onSelectionChanged: (event) => {
                    const selectedRows = StateManager.getGridApi().getSelectedRows();
                    console.log(`Selected ${selectedRows.length} rows`);

                    // Update button states and trigger events
                    UIManager.updateToolbarButtonStates();
                    StateManager.triggerSelectionChanged(selectedRows);
                },

                onGridReady: (params) => {
                    StateManager.setGridApi(params.api, params.columnApi);

                    UIManager.updateRowCount();
                    UIManager.updateToolbarButtonStates();

                    if (StateManager.getKoondajaData().length === 0) {
                        $('#koondaja-empty-state').removeClass('hidden');
                    }

                    // Auto-size columns
                    setTimeout(() => {
                        this.autoSizeColumns();
                    }, 100);
                },

                onRowDataUpdated: () => {
                    UIManager.updateRowCount();
                    UIManager.updateInvalidRowCount();
                    UIManager.updateToolbarButtonStates();
                    const gridApi = StateManager.getGridApi();
                    if (gridApi) {
                        gridApi.refreshCells();
                    }
                },

                // Handle cell value changes for new rows
                onCellValueChanged: (params) => {
                    if (params.data && params.data._isNewRow) {
                        params.data._isModified = true;

                        if (['toimiku_nr_loplik', 'toimiku_nr_selgituses', 'viitenumber', 'isiku_registrikood'].includes(params.colDef.field)) {
                            RowUtils.validateNewRow(params.data, params.node.rowIndex);
                        }

                        UIManager.updateToolbarButtonStates();
                    }
                }
            };

            const gridDiv = document.querySelector('#koondaja-ag-grid');
            new agGrid.Grid(gridDiv, gridOptions);

            StateManager.setColumns([...defaultColumns]);
        },

        /**
         * Auto-size columns
         */
        autoSizeColumns() {
            const gridApi = StateManager.getGridApi();
            const columnApi = StateManager.getColumnApi();

            if (gridApi) {
                try {
                    if (typeof gridApi.autoSizeAllColumns === 'function') {
                        gridApi.autoSizeAllColumns(false);
                    } else if (columnApi && typeof columnApi.autoSizeAllColumns === 'function') {
                        columnApi.autoSizeAllColumns(false);
                    }
                    State.isColumnsFittedToHeader = true;

                    const button = $('#toggle-column-width-btn');
                    const buttonText = $('#toggle-column-width-text');
                    buttonText.text('Fit Container');
                    button.removeClass('bg-white border-gray-300 text-gray-700')
                        .addClass('bg-indigo-50 border-indigo-300 text-indigo-700');
                } catch (error) {
                    console.warn('Auto-sizing failed:', error);
                    gridApi.sizeColumnsToFit();
                    State.isColumnsFittedToHeader = false;
                }
            }
        },

        /**
         * Update grid data and maintain selection/scroll position
         */
        updateGrid() {
            const gridApi = StateManager.getGridApi();
            if (gridApi) {
                $('#koondaja-empty-state').addClass('hidden');

                // Store current selection and scroll position
                const selectedRows = gridApi.getSelectedRows();
                const scrollTop = document.querySelector('.ag-body-viewport')?.scrollTop || 0;

                // Update row data
                gridApi.setRowData(StateManager.getKoondajaData());

                // Update UI elements
                UIManager.updateRowCount();
                UIManager.updateInvalidRowCount();
                UIManager.updateToolbarButtonStates();

                setTimeout(() => {
                    // Restore scroll position
                    const viewport = document.querySelector('.ag-body-viewport');
                    if (viewport) {
                        viewport.scrollTop = scrollTop;
                    }

                    // Try to restore selection if possible
                    if (selectedRows.length > 0 && StateManager.getKoondajaData().length > 0) {
                        const firstSelectedRow = selectedRows[0];
                        const newIndex = Utils.findRowIndex(firstSelectedRow, StateManager.getKoondajaData());

                        if (newIndex >= 0) {
                            const nodeToSelect = gridApi.getRowNode(newIndex);
                            if (nodeToSelect) {
                                gridApi.deselectAll();
                                nodeToSelect.setSelected(true);
                            }
                        }
                    }

                    // Refresh cells with animations
                    if (gridApi) {
                        gridApi.refreshCells({
                            force: true,
                            suppressFlash: false
                        });
                    }
                }, 100);

                // Trigger custom event
                StateManager.triggerDataChanged();
            }
        },

        /**
         * Get context menu items for right-click
         */
        getContextMenuItems(params) {
            const result = [];

            if (params.node && params.node.rowIndex !== undefined) {
                const rowIndex = params.node.rowIndex;

                result.push({
                    name: `Lisa rida rea ${rowIndex + 1} järele`,
                    icon: '<i class="fas fa-plus" style="color: #10b981;"></i>',
                    action: () => RowManager.insertRowAfter(rowIndex)
                });

                result.push('separator');

                result.push({
                    name: `Kopeeri rea andmed`,
                    icon: '<i class="fas fa-copy" style="color: #3b82f6;"></i>',
                    action: () => RowManager.copyRowToClipboard(rowIndex)
                });

                // Only show delete for new rows
                if (params.node.data && params.node.data._isNewRow) {
                    result.push('separator');
                    result.push({
                        name: `Kustuta rida`,
                        icon: '<i class="fas fa-trash" style="color: #ef4444;"></i>',
                        action: () => RowManager.deleteRow(rowIndex)
                    });
                }
            }

            return result;
        },

        /**
         * Toggle column width between auto-size and fit container
         */
        toggleColumnWidth() {
            const gridApi = StateManager.getGridApi();
            if (!gridApi) {
                Utils.showNotification('Grid not initialized', 'warning');
                return;
            }

            const button = $('#toggle-column-width-btn');
            const buttonText = $('#toggle-column-width-text');

            if (State.isColumnsFittedToHeader) {
                gridApi.sizeColumnsToFit();
                buttonText.text('Fit Headers');
                State.isColumnsFittedToHeader = false;

                button.removeClass('bg-indigo-50 border-indigo-300 text-indigo-700')
                    .addClass('bg-white border-gray-300 text-gray-700');

                Utils.showNotification('Columns resized to fit container', 'info');
            } else {
                this.autoSizeColumns();
                Utils.showNotification('Columns auto-sized to headers', 'info');
            }
        }
    };

    // ===========================
    // ROW MANAGEMENT
    // ===========================

    const RowManager = {
        /**
         * Add row from current selection
         */
        addRowFromSelection() {
            const koondajaData = StateManager.getKoondajaData();
            const gridApi = StateManager.getGridApi();

            if (!gridApi || koondajaData.length === 0) {
                Utils.showNotification('Andmeid pole laetud - lae esmalt andmed', 'warning');
                return;
            }

            let selectedRows = gridApi.getSelectedRows();
            let sourceRowIndex = -1;
            let sourceRow = null;

            if (selectedRows.length > 0) {
                // Use the first selected row as source
                sourceRow = selectedRows[0];
                sourceRowIndex = Utils.findRowIndex(sourceRow, koondajaData);

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
                Utils.showNotification('Ei suuda leida allikat rea kopeerimiseks', 'error');
                return;
            }

            // Insert the new row directly after the source row
            this.insertRowDirectlyAfter(sourceRowIndex, sourceRow);
        },

        /**
         * Insert row after specific index
         */
        insertRowAfter(targetRowIndex) {
            const koondajaData = StateManager.getKoondajaData();
            const gridApi = StateManager.getGridApi();

            if (!gridApi || koondajaData.length === 0) {
                Utils.showNotification('Cannot add row - no data loaded', 'warning');
                return;
            }

            if (targetRowIndex < 0 || targetRowIndex >= koondajaData.length) {
                Utils.showNotification('Invalid row index', 'error');
                return;
            }

            // Get the source row data
            const sourceRow = koondajaData[targetRowIndex];
            this.insertRowDirectlyAfter(targetRowIndex, sourceRow);
        },

        /**
         * Insert row directly after specified index
         */
        insertRowDirectlyAfter(sourceRowIndex, sourceRow) {
            const koondajaData = StateManager.getKoondajaData();

            if (sourceRowIndex < 0 || sourceRowIndex >= koondajaData.length) {
                Utils.showNotification('Vale rea indeks', 'error');
                return;
            }

            // Create the new row
            const newRow = RowUtils.copyRowData(sourceRow);
            if (!newRow) {
                Utils.showNotification('Viga rea andmete kopeerimisel', 'error');
                return;
            }

            // Calculate the exact insertion index (directly after source row)
            const insertIndex = sourceRowIndex + 1;

            // Insert the new row at the calculated position
            koondajaData.splice(insertIndex, 0, newRow);
            StateManager.setKoondajaData(koondajaData);

            console.log(`Inserted new row at index ${insertIndex} (after source row ${sourceRowIndex})`);

            // Update the grid immediately
            this.updateGridAndMaintainSelection(insertIndex);

            // Provide user feedback
            const sourceInfo = sourceRow.toimiku_nr_loplik || sourceRow.dokumendi_nr || `Rida ${sourceRowIndex + 1}`;
            Utils.showNotification(`Uus rida lisatud rida ${insertIndex + 1} (kopeeritud: ${sourceInfo})`, 'success');
        },

        /**
         * Update grid and maintain selection on new row
         */
        updateGridAndMaintainSelection(newRowIndex) {
            const gridApi = StateManager.getGridApi();
            if (!gridApi) return;

            // Store current scroll position
            const scrollTop = document.querySelector('.ag-body-viewport').scrollTop;

            // Update the grid data
            gridApi.setRowData(StateManager.getKoondajaData());

            // Update counters and states
            UIManager.updateRowCount();
            UIManager.updateInvalidRowCount();
            UIManager.updateToolbarButtonStates();

            // Restore scroll position and handle new row
            setTimeout(() => {
                // Restore scroll position
                document.querySelector('.ag-body-viewport').scrollTop = scrollTop;

                // Ensure the new row is visible
                gridApi.ensureIndexVisible(newRowIndex);

                // Get the new row node and select it
                const newRowNode = gridApi.getRowNode(newRowIndex);
                if (newRowNode) {
                    // Clear previous selections and select the new row
                    gridApi.deselectAll();
                    newRowNode.setSelected(true);

                    // Add visual feedback - flash the new row
                    gridApi.flashCells({
                        rowNodes: [newRowNode],
                        columns: ['toimiku_nr_loplik', 'dokumendi_nr'],
                        fadeDelay: 2000
                    });

                    // Focus on the first editable cell of the new row
                    const editableColumns = gridApi.getAllGridColumns()
                        .filter(col => col.getColDef().editable);

                    if (editableColumns.length > 0) {
                        gridApi.setFocusedCell(newRowIndex, editableColumns[0]);
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
                StateManager.triggerDataChanged();

                console.log(`Grid updated, new row at index ${newRowIndex} selected and visible`);
            }, 50);
        },

        /**
         * Delete row at specific index
         */
        deleteRow(targetRowIndex) {
            const koondajaData = StateManager.getKoondajaData();
            const gridApi = StateManager.getGridApi();

            if (!gridApi || koondajaData.length === 0) {
                Utils.showNotification('Cannot delete row - no data loaded', 'warning');
                return;
            }

            if (targetRowIndex < 0 || targetRowIndex >= koondajaData.length) {
                Utils.showNotification('Invalid row index', 'error');
                return;
            }

            // Confirm deletion
            const rowData = koondajaData[targetRowIndex];
            const identifier = rowData.toimiku_nr_loplik || rowData.dokumendi_nr || `Rida ${targetRowIndex + 1}`;

            if (!confirm(`Kas oled kindel, et soovid selle rea kustutada?\n\n${identifier}`)) {
                return;
            }

            // Store the current selection for restoration
            const selectedRows = gridApi.getSelectedRows();
            const wasSelected = selectedRows.includes(rowData);

            // Remove the row
            koondajaData.splice(targetRowIndex, 1);
            StateManager.setKoondajaData(koondajaData);

            // Update the grid
            GridManager.updateGrid();

            // If the deleted row was selected, select the row that took its place (if any)
            if (wasSelected && koondajaData.length > 0) {
                setTimeout(() => {
                    const newIndexToSelect = Math.min(targetRowIndex, koondajaData.length - 1);
                    const nodeToSelect = gridApi.getRowNode(newIndexToSelect);
                    if (nodeToSelect) {
                        gridApi.deselectAll();
                        nodeToSelect.setSelected(true);
                        gridApi.ensureIndexVisible(newIndexToSelect);
                    }
                }, 50);
            }

            Utils.showNotification(`Rida kustutatud`, 'success');
        },

        /**
         * Copy row data to clipboard
         */
        copyRowToClipboard(rowIndex) {
            const koondajaData = StateManager.getKoondajaData();
            const currentColumns = StateManager.getColumns();

            if (rowIndex < 0 || rowIndex >= koondajaData.length) {
                Utils.showNotification('Vale rea indeks', 'error');
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
                    Utils.showNotification(`Rea ${rowIndex + 1} andmed kopeeritud lõikelauale`, 'success');
                }).catch(() => {
                    Utils.showNotification('Lõikelauale kopeerimine ebaõnnestus', 'error');
                });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = formattedData;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    Utils.showNotification(`Rea ${rowIndex + 1} andmed kopeeritud lõikelauale`, 'success');
                } catch (err) {
                    Utils.showNotification('Lõikelauale kopeerimine ebaõnnestus', 'error');
                }
                document.body.removeChild(textArea);
            }
        },

        /**
         * Remove all new rows
         */
        removeAllNewRows() {
            const koondajaData = StateManager.getKoondajaData();
            const newRows = koondajaData.filter(row => row._isNewRow);

            if (newRows.length === 0) {
                Utils.showNotification('Uusi ridu pole eemaldamiseks', 'info');
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
            const gridApi = StateManager.getGridApi();
            const selectedRows = gridApi ? gridApi.getSelectedRows() : [];
            const hasSelectedNewRow = selectedRows.some(row => row._isNewRow);

            // Remove all new rows
            const filteredData = koondajaData.filter(row => !row._isNewRow);
            StateManager.setKoondajaData(filteredData);

            // Update the grid
            GridManager.updateGrid();

            // If we had a selected new row, try to select something nearby
            if (hasSelectedNewRow && filteredData.length > 0) {
                setTimeout(() => {
                    const nodeToSelect = gridApi.getRowNode(Math.min(0, filteredData.length - 1));
                    if (nodeToSelect) {
                        gridApi.deselectAll();
                        nodeToSelect.setSelected(true);
                        gridApi.ensureIndexVisible(0);
                    }
                }, 50);
            }

            Utils.showNotification(`Eemaldatud ${newRows.length} uut rida`, 'success');
        }
    };

    // ===========================
    // UI MANAGEMENT
    // ===========================

    const UIManager = {
        /**
         * Update row count display
         */
        updateRowCount() {
            const koondajaData = StateManager.getKoondajaData();
            const totalRows = koondajaData.length;
            const newRows = koondajaData.filter(row => row._isNewRow).length;

            let countText = `${totalRows} rida`;
            if (newRows > 0) {
                countText += ` (${newRows} uut)`;
            }

            $('#koondaja-row-count').text(countText);
        },

        /**
         * Update invalid row count display
         */
        updateInvalidRowCount() {
            const koondajaData = StateManager.getKoondajaData();
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
        },

        /**
         * Update toolbar button states
         */
        updateToolbarButtonStates() {
            const koondajaData = StateManager.getKoondajaData();
            const gridApi = StateManager.getGridApi();

            const hasData = koondajaData.length > 0;
            const hasNewRows = koondajaData.some(row => row._isNewRow);
            const hasModifiedNewRows = koondajaData.some(row => row._isNewRow && row._isModified);
            const hasSelection = gridApi ? gridApi.getSelectedRows().length > 0 : false;

            // Add button states
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

            this.updateButtonVisualStates(hasData, hasNewRows, hasModifiedNewRows);
        },

        /**
         * Update button visual states
         */
        updateButtonVisualStates(hasData, hasNewRows, hasModifiedNewRows) {
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
    };

    // ===========================
    // DATA OPERATIONS
    // ===========================

    const DataManager = {
        /**
         * Load data from all folders
         */
        async loadAllKoondajaData() {
            if (State.isLoading) {
                Utils.showNotification('Data loading already in progress', 'warning');
                return;
            }

            StateManager.setKoondajaData([]);
            GridManager.updateGrid();

            this.showLoadingModal();
            State.isLoading = true;

            await this.loadKoondajaDataFromFolders();
        },

        /**
         * Show loading modal
         */
        showLoadingModal() {
            $('#koondaja-loading-modal').removeClass('hidden');
            $('#koondaja-loading-progress').css('width', '0%');
            $('#koondaja-loading-status').text('Starting data load...');
            $('#koondaja-loading-details').text('Waiting...');
            $('#cancel-koondaja-loading').prop('disabled', true);
        },

        /**
         * Hide loading modal
         */
        hideLoadingModal() {
            $('#koondaja-loading-modal').addClass('hidden');
        },

        /**
         * Update loading progress
         */
        updateLoadingProgress(current, total, currentFolder, currentFile) {
            const percentage = Math.round((current / total) * 100);
            $('#koondaja-loading-progress').css('width', percentage + '%');
            $('#koondaja-loading-status').text(`Processing folder: ${currentFolder}`);
            $('#koondaja-loading-details').text(`File: ${currentFile || 'Looking for files...'} (${current}/${total})`);
        },

        /**
         * Load data from all folders
         */
        async loadKoondajaDataFromFolders() {
            try {
                const allFiles = [];
                let folderIndex = 0;

                // Get all CSV files from all folders
                for (const folder of State.KOONDAJA_FOLDERS) {
                    this.updateLoadingProgress(folderIndex, State.KOONDAJA_FOLDERS.length, folder, null);

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
                    this.hideLoadingModal();
                    State.isLoading = false;
                    Utils.showNotification('No CSV files found', 'warning');
                    return;
                }

                // Process all files
                let processedFiles = 0;
                let totalRows = 0;
                let invalidRows = 0;
                const errors = [];
                const koondajaData = [];

                for (const file of allFiles) {
                    this.updateLoadingProgress(processedFiles, allFiles.length, file.folder, file.name);

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
                            koondajaData.push(...response.data);
                            totalRows += response.data.length;
                            invalidRows += response.data.filter(row => !row.has_valid_toimiku).length;
                        }
                    } catch (error) {
                        console.error(`Error processing file ${file.name}:`, error);
                        errors.push(`${file.folder}/${file.name}: ${error.responseJSON?.detail || 'Error'}`);
                    }

                    processedFiles++;
                }

                StateManager.setKoondajaData(koondajaData);
                GridManager.updateGrid();
                this.hideLoadingModal();
                State.isLoading = false;

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
                    Utils.showNotification(message, 'warning');
                } else {
                    Utils.showNotification(message, 'success');
                }

            } catch (error) {
                console.error('Error loading Koondaja data:', error);
                this.hideLoadingModal();
                State.isLoading = false;
                Utils.showNotification('Error loading data', 'error');
            }
        },

        /**
         * Clear all data
         */
        clearKoondajaData() {
            const koondajaData = StateManager.getKoondajaData();
            if (koondajaData.length === 0) {
                Utils.showNotification('No data to clear', 'info');
                return;
            }

            const newRowCount = koondajaData.filter(row => row._isNewRow).length;
            let confirmMessage = 'Are you sure you want to clear all data?';

            if (newRowCount > 0) {
                confirmMessage += `\n\nThis will also remove ${newRowCount} manually added rows.`;
            }

            if (confirm(confirmMessage)) {
                StateManager.setKoondajaData([]);
                GridManager.updateGrid();
                $('#koondaja-empty-state').removeClass('hidden');
                $('#koondaja-invalid-count, #koondaja-validation-summary').remove();
                Utils.showNotification('Data cleared', 'success');
            }
        },

        /**
         * Export data to CSV
         */
        exportKoondajaData() {
            const koondajaData = StateManager.getKoondajaData();
            const currentColumns = StateManager.getColumns();

            if (koondajaData.length === 0) {
                Utils.showNotification('No data to export', 'warning');
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
                Utils.showNotification('No data to export after filtering', 'warning');
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

            Utils.showNotification(message, 'success');
        }
    };

    // ===========================
    // INITIALIZATION
    // ===========================

    const KoondajaGrid = {
        /**
         * Initialize the Koondaja grid module
         */
        init() {
            this.setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        setupEventHandlers() {
            // Basic button handlers
            $('#koondaja-btn').click(() => this.showModal());
            $('#close-koondaja-modal, #koondaja-backdrop').click(() => this.hideModal());
            $('#load-koondaja-data-btn').click(() => DataManager.loadAllKoondajaData());
            $('#clear-koondaja-data-btn').click(() => DataManager.clearKoondajaData());
            $('#export-koondaja-btn').click(() => DataManager.exportKoondajaData());
            $('#toggle-column-width-btn').click(() => GridManager.toggleColumnWidth());

            // Row management button handlers
            $('#add-row-btn').click(() => RowManager.addRowFromSelection());
            $('#remove-new-rows-btn').click(() => RowManager.removeAllNewRows());

            // Initialize the grid when modal is first shown
            $('#koondaja-modal').on('shown.bs.modal', () => {
                if (!StateManager.getGridApi()) {
                    GridManager.initializeGrid();
                    UIManager.updateToolbarButtonStates();
                }
            });

            // Update button states when data changes
            $(document).on('koondajaDataChanged', () => {
                UIManager.updateToolbarButtonStates();
            });

            // Handle selection changes for toolbar button states
            $(document).on('koondajaSelectionChanged', () => {
                UIManager.updateToolbarButtonStates();
            });

            // Keyboard shortcuts
            $(document).on('keydown', (e) => {
                if (!$('#koondaja-modal').hasClass('hidden')) {
                    this.handleKeyboardShortcuts(e);
                }
            });
        },

        /**
         * Handle keyboard shortcuts
         */
        handleKeyboardShortcuts(e) {
            // Ctrl+Enter: Add new row after selected
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                RowManager.addRowFromSelection();
            }

            // Ctrl+D: Duplicate selected row (alternative shortcut)
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                RowManager.addRowFromSelection();
            }

            // Ctrl+Shift+D: Delete selected new rows
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                const gridApi = StateManager.getGridApi();
                if (gridApi) {
                    const selectedRows = gridApi.getSelectedRows();
                    const newRowsToDelete = selectedRows.filter(row => row._isNewRow);

                    if (newRowsToDelete.length > 0) {
                        e.preventDefault();
                        if (confirm(`Eemalda ${newRowsToDelete.length} valitud uut rida?`)) {
                            const koondajaData = StateManager.getKoondajaData();
                            // Remove rows in reverse order to maintain indices
                            const indicesToDelete = newRowsToDelete.map(row => koondajaData.indexOf(row))
                                .sort((a, b) => b - a); // Sort in descending order

                            indicesToDelete.forEach(index => {
                                if (index > -1) {
                                    koondajaData.splice(index, 1);
                                }
                            });

                            StateManager.setKoondajaData(koondajaData);
                            RowManager.updateGridAndMaintainSelection(-1);
                            Utils.showNotification(`Eemaldatud ${newRowsToDelete.length} uut rida`, 'success');
                        }
                    }
                }
            }
        },

        /**
         * Show modal
         */
        showModal() {
            $('#koondaja-modal').removeClass('hidden');
            $('body').addClass('overflow-hidden');

            if (!StateManager.getGridApi()) {
                setTimeout(() => GridManager.initializeGrid(), 100);
            }
        },

        /**
         * Hide modal
         */
        hideModal() {
            $('#koondaja-modal').addClass('hidden');
            $('body').removeClass('overflow-hidden');
        },

        // Public API
        getData: () => StateManager.getKoondajaData(),
        clearData: () => DataManager.clearKoondajaData(),
        exportData: () => DataManager.exportKoondajaData(),
        addRow: (afterIndex = -1) => {
            if (afterIndex === -1) {
                afterIndex = StateManager.getKoondajaData().length - 1;
            }
            RowManager.insertRowAfter(afterIndex);
        },
        getNewRows: () => StateManager.getKoondajaData().filter(row => row._isNewRow),
        removeNewRows: () => RowManager.removeAllNewRows()
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Initialize when DOM is ready
    $(document).ready(() => {
        KoondajaGrid.init();
    });

    // Export to window
    window.KoondajaGrid = KoondajaGrid;

})(window);