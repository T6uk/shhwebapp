/**
 * Koondaja Validation Module
 * Handles database validation, column management, and data integrity
 * File: /static/js/koondaja-validation.js
 * Dependencies: koondaja-shared.js
 */

(function(window) {
    'use strict';

    // Check if shared module is loaded
    if (!window.KoondajaShared) {
        console.error('KoondajaShared module must be loaded before KoondajaValidation');
        return;
    }

    const { State, StateManager, Utils, defaultColumns } = window.KoondajaShared;

    // ===========================
    // VALIDATION MANAGEMENT
    // ===========================

    const ValidationManager = {
        /**
         * Validate new rows against database
         */
        async validateNewRowsAgainstDatabase() {
            const koondajaData = StateManager.getKoondajaData();
            const newRows = koondajaData.filter(row => row._isNewRow && row._isModified);

            if (newRows.length === 0) {
                Utils.showNotification('No new rows to validate', 'info');
                return;
            }

            // Extract toimiku numbers from new rows for database lookup
            const toimikuNumbers = newRows
                .map(row => row.toimiku_nr_loplik || row.toimiku_nr_selgituses)
                .filter(nr => nr && nr.trim() !== '');

            if (toimikuNumbers.length === 0) {
                Utils.showNotification('No toimiku numbers found in new rows', 'warning');
                return;
            }

            try {
                Utils.showNotification('Validating new rows against database...', 'info');

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

                    // Update the grid
                    if (window.KoondajaGrid && typeof window.KoondajaGrid.updateGrid === 'function') {
                        window.KoondajaGrid.updateGrid();
                    } else {
                        // Fallback to direct grid update
                        const gridApi = StateManager.getGridApi();
                        if (gridApi) {
                            gridApi.setRowData(koondajaData);
                        }
                    }

                    Utils.showNotification(`Validated ${updatedCount} new rows against database`, 'success');
                }
            } catch (error) {
                console.error('Error validating new rows:', error);
                Utils.showNotification('Error validating new rows against database', 'error');
            }
        }
    };

    // ===========================
    // DATABASE COLUMN MANAGEMENT
    // ===========================

    const ColumnManager = {
        /**
         * Show database column selector modal
         */
        showDbColumnSelector() {
            $.ajax({
                url: '/api/v1/table/columns',
                method: 'GET',
                success: (response) => {
                    State.availableDbColumns = response.columns || [];
                    this.displayDbColumns();
                    $('#db-column-selector-modal').removeClass('hidden');
                },
                error: (xhr) => {
                    Utils.showNotification('Error loading columns', 'error');
                }
            });
        },

        /**
         * Hide database column selector modal
         */
        hideDbColumnSelector() {
            $('#db-column-selector-modal').addClass('hidden');
            $('#db-column-search').val('');
            $('#add-selected-columns-btn, #remove-selected-columns-btn').off('click.columnSelector');
        },

        /**
         * Display available database columns
         */
        displayDbColumns() {
            const container = $('#db-columns-list');
            container.empty();

            const defaultFields = defaultColumns.map(col => col.field);
            const currentColumns = StateManager.getColumns();
            const currentDbFields = currentColumns
                .filter(col => !defaultFields.includes(col.field))
                .map(col => col.field);

            if (State.availableDbColumns.length === 0) {
                container.html('<p class="text-gray-500 text-center py-4">No database columns found</p>');
                return;
            }

            const selectedColumns = State.availableDbColumns.filter(col => currentDbFields.includes(col.field));
            const availableColumns = State.availableDbColumns.filter(col => !currentDbFields.includes(col.field));

            // Display selected columns
            if (selectedColumns.length > 0) {
                const selectedSection = this.createColumnSection('Selected columns', selectedColumns, true);
                container.append(selectedSection);
            }

            // Display available columns
            if (availableColumns.length > 0) {
                const availableSection = this.createColumnSection('Available columns', availableColumns, false);
                container.append(availableSection);
            }

            this.updateColumnSelectorButtons();
        },

        /**
         * Create column section HTML
         */
        createColumnSection(title, columns, isSelected) {
            const sectionClass = isSelected ? 'bg-green-50 border-green-200' : '';
            const checkboxClass = isSelected ? 'selected-column-checkbox' : 'available-column-checkbox';
            const statusText = isSelected ? 'ADDED' : '';
            const statusClass = isSelected ? 'text-green-600 font-medium' : '';

            const section = $(`
                <div class="mb-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-2">${title} (${columns.length})</h4>
                    <div class="border rounded-md ${sectionClass} p-2">
                        <div class="${isSelected ? 'selected' : 'available'}-columns-list"></div>
                    </div>
                </div>
            `);

            const container = section.find(`.${isSelected ? 'selected' : 'available'}-columns-list`);

            columns.forEach(col => {
                const item = $(`
                    <div class="flex items-center p-2 hover:bg-${isSelected ? 'green-100' : 'gray-100'} rounded">
                        <input type="checkbox" id="${isSelected ? 'selected' : 'available'}-col-${col.field}" 
                               data-field="${col.field}" 
                               data-title="${col.title}"
                               class="mr-2 ${checkboxClass}" 
                               ${isSelected ? 'checked' : ''}>
                        <label for="${isSelected ? 'selected' : 'available'}-col-${col.field}" class="flex-grow cursor-pointer">
                            <span class="font-medium ${isSelected ? 'text-green-800' : ''}">${col.title}</span>
                            <span class="text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'} ml-2">(${col.field})</span>
                        </label>
                        ${statusText ? `<span class="text-xs ${statusClass}">${statusText}</span>` : ''}
                    </div>
                `);
                container.append(item);
            });

            return section;
        },

        /**
         * Update column selector buttons
         */
        updateColumnSelectorButtons() {
            const hasSelectedToAdd = $('.available-column-checkbox:checked').length > 0;
            const hasSelectedToRemove = $('.selected-column-checkbox:checked').length > 0;

            if ($('#add-selected-columns-btn').length === 0) {
                $('#cancel-db-columns-btn').after(`
                    <button id="add-selected-columns-btn" 
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        Add selected
                    </button>
                `);
                $('#add-selected-columns-btn').click(() => this.addSelectedDbColumns());
            }

            if ($('#remove-selected-columns-btn').length === 0) {
                $('#add-selected-columns-btn').after(`
                    <button id="remove-selected-columns-btn" 
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ml-2">
                        Remove selected
                    </button>
                `);
                $('#remove-selected-columns-btn').click(() => this.removeSelectedDbColumns());
            }

            $('#add-selected-columns-btn').prop('disabled', !hasSelectedToAdd);
            $('#remove-selected-columns-btn').prop('disabled', !hasSelectedToRemove);

            $('.available-column-checkbox, .selected-column-checkbox').off('change.columnSelector').on('change.columnSelector', () => {
                this.updateColumnSelectorButtons();
            });
        },

        /**
         * Add selected database columns
         */
        addSelectedDbColumns() {
            const selectedColumns = [];

            $('.available-column-checkbox:checked').each(function() {
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
                Utils.showNotification('Please select at least one column', 'warning');
                return;
            }

            const currentColumns = StateManager.getColumns();
            const newColumns = [...currentColumns, ...selectedColumns];
            StateManager.setColumns(newColumns);
            State.selectedDbColumns = [...State.selectedDbColumns, ...selectedColumns.map(col => col.field)];

            const gridApi = StateManager.getGridApi();
            if (gridApi) {
                gridApi.setColumnDefs(newColumns);

                const koondajaData = StateManager.getKoondajaData();
                if (koondajaData.length > 0) {
                    this.fetchDbColumnData(selectedColumns.map(col => col.field));
                }
            }

            this.displayDbColumns();
            Utils.showNotification(`Added ${selectedColumns.length} columns`, 'success');
        },

        /**
         * Remove selected database columns
         */
        removeSelectedDbColumns() {
            const columnsToRemove = [];

            $('.selected-column-checkbox:checked').each(function() {
                columnsToRemove.push($(this).data('field'));
            });

            if (columnsToRemove.length === 0) {
                Utils.showNotification('Please select at least one column to remove', 'warning');
                return;
            }

            const currentColumns = StateManager.getColumns();
            const filteredColumns = currentColumns.filter(col => !columnsToRemove.includes(col.field));
            StateManager.setColumns(filteredColumns);
            State.selectedDbColumns = State.selectedDbColumns.filter(field => !columnsToRemove.includes(field));

            const gridApi = StateManager.getGridApi();
            if (gridApi) {
                gridApi.setColumnDefs(filteredColumns);
            }

            this.displayDbColumns();
            Utils.showNotification(`Removed ${columnsToRemove.length} columns`, 'success');
        },

        /**
         * Filter database columns based on search
         */
        filterDbColumns() {
            const searchTerm = $('#db-column-search').val().toLowerCase();

            $('.available-columns-list > div, .selected-columns-list > div').each(function() {
                const text = $(this).text().toLowerCase();
                $(this).toggle(text.includes(searchTerm));
            });
        },

        /**
         * Fetch database column data
         */
        fetchDbColumnData(newFields) {
            const koondajaData = StateManager.getKoondajaData();

            // For new structure, we may need different identifiers
            const toimikuNumbers = [...new Set(koondajaData.map(row =>
                row.toimiku_nr_loplik || row.toimiku_nr_selgituses || row.toimiku_nr_viitenumbris
            ).filter(nr => nr))];

            if (toimikuNumbers.length === 0) {
                Utils.showNotification('No toimiku numbers for database lookup', 'warning');
                return;
            }

            Utils.showNotification('Loading database data...', 'info');

            $.ajax({
                url: '/api/v1/koondaja/koondaja-fetch-columns',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    toimiku_numbers: toimikuNumbers,
                    fields: newFields
                }),
                success: (response) => {
                    if (response.success && response.data) {
                        this.mergeDbData(response.data);
                        Utils.showNotification('Database data added', 'success');
                    }
                },
                error: (xhr) => {
                    Utils.showNotification('Error loading database data', 'error');
                }
            });
        },

        /**
         * Merge database data with existing data
         */
        mergeDbData(dbData) {
            const koondajaData = StateManager.getKoondajaData();
            const dbDataMap = {};

            dbData.forEach(row => {
                if (row.toimiku_nr) {
                    dbDataMap[row.toimiku_nr] = row;
                }
            });

            const mergedData = koondajaData.map(row => {
                const toimikuNr = row.toimiku_nr_loplik || row.toimiku_nr_selgituses || row.toimiku_nr_viitenumbris;
                const dbRow = dbDataMap[toimikuNr];
                if (dbRow) {
                    return {...row, ...dbRow};
                }
                return row;
            });

            StateManager.setKoondajaData(mergedData);

            // Update grid if available
            if (window.KoondajaGrid && typeof window.KoondajaGrid.updateGrid === 'function') {
                window.KoondajaGrid.updateGrid();
            } else {
                const gridApi = StateManager.getGridApi();
                if (gridApi) {
                    gridApi.setRowData(mergedData);
                }
            }
        }
    };

    // ===========================
    // INITIALIZATION
    // ===========================

    const KoondajaValidation = {
        /**
         * Initialize validation module
         */
        init() {
            this.setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        setupEventHandlers() {
            // Validation handlers
            $('#validate-new-rows-btn').click(() => ValidationManager.validateNewRowsAgainstDatabase());

            // Column management handlers
            $('#add-db-columns-btn').click(() => ColumnManager.showDbColumnSelector());
            $('#close-db-column-selector, #db-column-selector-backdrop').click(() => ColumnManager.hideDbColumnSelector());
            $('#cancel-db-columns-btn').click(() => ColumnManager.hideDbColumnSelector());
            $('#db-column-search').on('input', () => ColumnManager.filterDbColumns());
        },

        // Public API
        validateNewRows: () => ValidationManager.validateNewRowsAgainstDatabase(),
        showColumnSelector: () => ColumnManager.showDbColumnSelector(),
        hideColumnSelector: () => ColumnManager.hideDbColumnSelector(),
        addColumns: (columns) => ColumnManager.addSelectedDbColumns(),
        removeColumns: (columns) => ColumnManager.removeSelectedDbColumns()
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Initialize when DOM is ready
    $(document).ready(() => {
        KoondajaValidation.init();
    });

    // Export to window
    window.KoondajaValidation = KoondajaValidation;

})(window);