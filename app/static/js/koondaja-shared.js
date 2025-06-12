/**
 * Koondaja Shared Module
 * Contains shared utilities, state management, and common functions
 * File: /static/js/koondaja-shared.js
 */

(function(window) {
    'use strict';

    // ===========================
    // SHARED STATE MANAGEMENT
    // ===========================

    const SharedState = {
        // Core data
        koondajaData: [],
        availableDbColumns: [],
        currentColumns: [],
        selectedDbColumns: [],

        // Grid references
        koondajaGridApi: null,
        koondajaColumnApi: null,

        // UI state
        isLoading: false,
        isColumnsFittedToHeader: false,

        // Configuration
        KOONDAJA_FOLDERS: ['CSV', 'Konto vv', 'MTA', 'Pension', 'Töötukassa']
    };

    // ===========================
    // COLUMN DEFINITIONS
    // ===========================

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
            field: 'toimiku_jaak',
            headerName: 'Toimiku jääk',
            editable: true,
            sortable: true,
            filter: true,
            width: 120,
            valueFormatter: params => SharedUtils.formatEstonianNumber(params.value)
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
            valueFormatter: params => SharedUtils.formatEstonianNumber(params.value)
        },
        {
            field: 'vahe',
            headerName: 'Vahe',
            editable: true,
            sortable: true,
            filter: true,
            width: 100,
            valueFormatter: params => SharedUtils.formatEstonianNumber(params.value),
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
        // Payment info
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
        // Transaction details
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

    // ===========================
    // SHARED UTILITIES
    // ===========================

    const SharedUtils = {
        /**
         * Format number to Estonian locale
         */
        formatEstonianNumber(value, decimalPlaces = 2) {
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
        },

        /**
         * Format Estonian currency
         */
        formatEstonianCurrency(value) {
            if (value === null || value === undefined || value === '') {
                return '0,00 €';
            }
            const num = parseFloat(value) || 0;
            return num.toFixed(2).replace('.', ',') + ' €';
        },

        /**
         * Safe number conversion
         */
        safeNumberConversion(value, defaultValue = 0) {
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
        },

        /**
         * Show notification
         */
        showNotification(message, type) {
            if (window.showNotification && typeof window.showNotification === 'function') {
                window.showNotification(message, type);
            } else {
                console.log(`${type}: ${message}`);
                if (type === 'error') {
                    alert(`Error: ${message}`);
                }
            }
        },

        /**
         * Generate unique ID
         */
        generateUniqueId() {
            return 'new_row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        /**
         * Escape HTML
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Find row index in data array
         */
        findRowIndex(targetRow, dataArray) {
            if (!targetRow) return -1;

            // Try to find exact object match first
            let index = dataArray.indexOf(targetRow);
            if (index !== -1) return index;

            // If not found, try to match by unique identifiers
            for (let i = 0; i < dataArray.length; i++) {
                const row = dataArray[i];

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
    };

    // ===========================
    // STATE MANAGEMENT
    // ===========================

    const StateManager = {
        /**
         * Get current state
         */
        getState() {
            return SharedState;
        },

        /**
         * Update data
         */
        setKoondajaData(data) {
            SharedState.koondajaData = data;
            this.triggerDataChanged();
        },

        /**
         * Get data
         */
        getKoondajaData() {
            return SharedState.koondajaData;
        },

        /**
         * Add row to data
         */
        addRow(row, index = -1) {
            if (index === -1) {
                SharedState.koondajaData.push(row);
            } else {
                SharedState.koondajaData.splice(index, 0, row);
            }
            this.triggerDataChanged();
        },

        /**
         * Remove row from data
         */
        removeRow(index) {
            if (index >= 0 && index < SharedState.koondajaData.length) {
                SharedState.koondajaData.splice(index, 1);
                this.triggerDataChanged();
            }
        },

        /**
         * Update row in data
         */
        updateRow(index, rowData) {
            if (index >= 0 && index < SharedState.koondajaData.length) {
                SharedState.koondajaData[index] = rowData;
                this.triggerDataChanged();
            }
        },

        /**
         * Set grid API references
         */
        setGridApi(gridApi, columnApi) {
            SharedState.koondajaGridApi = gridApi;
            SharedState.koondajaColumnApi = columnApi;
        },

        /**
         * Get grid API
         */
        getGridApi() {
            return SharedState.koondajaGridApi;
        },

        /**
         * Get column API
         */
        getColumnApi() {
            return SharedState.koondajaColumnApi;
        },

        /**
         * Set columns
         */
        setColumns(columns) {
            SharedState.currentColumns = columns;
        },

        /**
         * Get columns
         */
        getColumns() {
            return SharedState.currentColumns;
        },

        /**
         * Trigger data changed event
         */
        triggerDataChanged() {
            $(document).trigger('koondajaDataChanged');
        },

        /**
         * Trigger selection changed event
         */
        triggerSelectionChanged(selectedRows) {
            $(document).trigger('koondajaSelectionChanged', {
                selectedCount: selectedRows.length,
                selectedRows: selectedRows
            });
        }
    };

    // ===========================
    // ROW UTILITIES
    // ===========================

    const RowUtils = {
        /**
         * Copy row data for new row creation
         */
        copyRowData(sourceRow) {
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

                // Add tracking fields for new rows
                newRow._isNewRow = true;
                newRow._newRowId = SharedUtils.generateUniqueId();
                newRow._sourceRowData = {
                    toimiku_nr_loplik: sourceRow.toimiku_nr_loplik,
                    nimi_baasis: sourceRow.nimi_baasis,
                    copied_at: new Date().toISOString(),
                    source_index: SharedState.koondajaData.indexOf(sourceRow)
                };

                // Set initial validation state
                newRow.has_valid_toimiku = !!newRow.toimiku_nr_loplik;
                newRow.match_source = newRow.has_valid_toimiku ? 'copied' : null;
                newRow._isModified = false;

                // Reset calculated fields
                newRow.vahe = 0.0;
                newRow.laekumiste_arv = 1;
                newRow.laekumised_kokku = '';

                return newRow;

            } catch (error) {
                console.error('Error copying row data:', error);
                return null;
            }
        },

        /**
         * Validate new row
         */
        validateNewRow(rowData, rowIndex) {
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
            const gridApi = SharedState.koondajaGridApi;
            if (gridApi) {
                const rowNode = gridApi.getRowNode(rowIndex);
                if (rowNode) {
                    gridApi.refreshCells({
                        rowNodes: [rowNode],
                        force: true
                    });
                }
            }
        }
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Export to window
    window.KoondajaShared = {
        State: SharedState,
        StateManager: StateManager,
        Utils: SharedUtils,
        RowUtils: RowUtils,
        defaultColumns: defaultColumns
    };

})(window);