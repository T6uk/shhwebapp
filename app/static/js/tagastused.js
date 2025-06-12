/**
 * Tagastused Module
 * Handles returns/refunds functionality and related reporting
 * File: /static/js/tagastused.js
 * Dependencies: koondaja-shared.js
 */

(function(window) {
    'use strict';

    // Check if shared module is loaded
    if (!window.KoondajaShared) {
        console.error('KoondajaShared module must be loaded before Tagastused');
        return;
    }

    const { StateManager, Utils } = window.KoondajaShared;

    // ===========================
    // MODULE STATE
    // ===========================

    const TagastusedState = {
        tagastusedGridApi: null,
        tagastusedColumnApi: null,
        tagastusedData: []
    };

    // ===========================
    // COLUMN DEFINITIONS
    // ===========================

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
            valueFormatter: params => Utils.formatEstonianNumber(params.value),
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

    // ===========================
    // GRID MANAGEMENT
    // ===========================

    const GridManager = {
        /**
         * Initialize the Tagastused grid
         */
        initializeGrid() {
            const gridOptions = {
                columnDefs: [...tagastusedColumns],
                rowData: TagastusedState.tagastusedData,
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

                onGridReady: (params) => {
                    TagastusedState.tagastusedGridApi = params.api;
                    TagastusedState.tagastusedColumnApi = params.columnApi;

                    UIManager.updateRowCount();

                    if (TagastusedState.tagastusedData.length === 0) {
                        $('#tagastused-empty-state').removeClass('hidden');
                    }

                    // Auto-size columns
                    setTimeout(() => {
                        this.autoSizeColumns();
                    }, 100);
                },

                onRowDataUpdated: () => {
                    UIManager.updateRowCount();
                    if (TagastusedState.tagastusedGridApi) {
                        TagastusedState.tagastusedGridApi.refreshCells();
                    }
                }
            };

            const gridDiv = document.querySelector('#tagastused-ag-grid');
            new agGrid.Grid(gridDiv, gridOptions);
        },

        /**
         * Auto-size columns
         */
        autoSizeColumns() {
            if (TagastusedState.tagastusedGridApi) {
                try {
                    TagastusedState.tagastusedGridApi.autoSizeAllColumns(false);
                } catch (error) {
                    console.warn('Auto-sizing failed:', error);
                    TagastusedState.tagastusedGridApi.sizeColumnsToFit();
                }
            }
        }
    };

    // ===========================
    // DATA PROCESSING
    // ===========================

    const DataProcessor = {
        /**
         * Process Tagastused data from Koondaja data
         */
        async processTagastusedData() {
            try {
                const koondajaData = StateManager.getKoondajaData();

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
                const isikukoodMap = await this.fetchIsikukoodData(volgnikuNimed);

                // Process each row
                TagastusedState.tagastusedData = dataToProcess.map(row => ({
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
                if (TagastusedState.tagastusedGridApi) {
                    $('#tagastused-empty-state').addClass('hidden');
                    TagastusedState.tagastusedGridApi.setRowData(TagastusedState.tagastusedData);
                }

                // Calculate and update summary
                SummaryManager.updateSummary();

                Utils.showNotification(`Tagastuste andmed laetud: ${TagastusedState.tagastusedData.length} rida`, 'success');

            } catch (error) {
                console.error('Error processing tagastused data:', error);
                Utils.showNotification('Viga tagastuste andmete töötlemisel', 'error');
            }
        },

        /**
         * Fetch isikukood data from database
         */
        async fetchIsikukoodData(volgnikuNimed) {
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
    };

    // ===========================
    // SUMMARY MANAGEMENT
    // ===========================

    const SummaryManager = {
        /**
         * Update summary calculations and display
         */
        updateSummary() {
            const koondajaData = StateManager.getKoondajaData();

            if (!TagastusedState.tagastusedData || TagastusedState.tagastusedData.length === 0) {
                // Reset all summary values to 0
                this.resetSummaryValues();
                return;
            }

            // Calculate sums from tagastused data
            let tagastamisedSum = 0;
            let laekusKokku = 0;

            TagastusedState.tagastusedData.forEach(row => {
                // Sum tagastamised
                const tagastamised = Utils.safeNumberConversion(row.tagastamised, 0);
                tagastamisedSum += tagastamised;
            });

            // Calculate laekus kokku from original koondaja data
            koondajaData.forEach(row => {
                const summa = Utils.safeNumberConversion(row.summa, 0);
                laekusKokku += summa;
            });

            // Get date range from koondaja data
            const dateRangeText = this.calculateDateRange(koondajaData);

            // Static values for now (as requested)
            const arhiivis = 0;
            const sebDeposit = 0;
            const baasiVaeline = 0; // Will be calculated later if needed
            const baasisKandmiseks = 0; // Static for now

            // Calculated values
            const tagastamisedBaasi = tagastamisedSum; // Same as tagastamised sum for now
            const baasEiKanta = laekusKokku - baasisKandmiseks;

            // Update the summary display
            this.updateSummaryDisplay({
                tagastamisedSum,
                arhiivis,
                sebDeposit,
                baasiVaeline,
                tagastamisedBaasi,
                laekusKokku,
                baasisKandmiseks,
                baasEiKanta,
                dateRangeText
            });
        },

        /**
         * Reset all summary values to 0
         */
        resetSummaryValues() {
            const defaultSummary = {
                tagastamisedSum: 0,
                arhiivis: 0,
                sebDeposit: 0,
                baasiVaeline: 0,
                tagastamisedBaasi: 0,
                laekusKokku: 0,
                baasisKandmiseks: 0,
                baasEiKanta: 0,
                dateRangeText: 'Kuupäev laekus kokku'
            };

            this.updateSummaryDisplay(defaultSummary);
        },

        /**
         * Calculate date range from koondaja data
         */
        calculateDateRange(koondajaData) {
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

            return dateRangeText;
        },

        /**
         * Update summary display with calculated values
         */
        updateSummaryDisplay(summary) {
            $('#summary-tagastamised').text(Utils.formatEstonianCurrency(summary.tagastamisedSum));
            $('#summary-arhiivis').text(Utils.formatEstonianCurrency(summary.arhiivis));
            $('#summary-seb-deposit').text(Utils.formatEstonianCurrency(summary.sebDeposit));
            $('#summary-baasivaline').text(Utils.formatEstonianCurrency(summary.baasiVaeline));
            $('#summary-tagastamised-baasi').text(Utils.formatEstonianCurrency(summary.tagastamisedBaasi));
            $('#summary-laekus-kokku').text(Utils.formatEstonianCurrency(summary.laekusKokku));
            $('#summary-baasi-kandmiseks').text(Utils.formatEstonianCurrency(summary.baasisKandmiseks));
            $('#summary-baasi-ei-kanta').text(Utils.formatEstonianCurrency(summary.baasEiKanta));
            $('#summary-date-range').text(summary.dateRangeText);
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
            const totalRows = TagastusedState.tagastusedData.length;
            $('#tagastused-row-count').text(`${totalRows} rida`);
        },

        /**
         * Update button states based on data availability
         */
        updateButtonStates() {
            const koondajaData = StateManager.getKoondajaData();
            const hasData = koondajaData && koondajaData.length > 0;

            const tagastusedBtn = $('#tagastused-btn');
            tagastusedBtn.prop('disabled', !hasData);

            if (hasData) {
                tagastusedBtn.removeClass('opacity-50').addClass('hover:bg-blue-50');
                tagastusedBtn.attr('title', 'Ava tagastuste aruanne');
            } else {
                tagastusedBtn.addClass('opacity-50').removeClass('hover:bg-blue-50');
                tagastusedBtn.attr('title', 'Lae esmalt andmed');
            }
        }
    };

    // ===========================
    // MODAL MANAGEMENT
    // ===========================

    const ModalManager = {
        /**
         * Show Tagastused modal
         */
        showModal() {
            const koondajaData = StateManager.getKoondajaData();

            if (!koondajaData || koondajaData.length === 0) {
                Utils.showNotification('Koondaja andmeid pole laetud', 'warning');
                return;
            }

            $('#tagastused-modal').removeClass('hidden');
            $('body').addClass('overflow-hidden');

            if (!TagastusedState.tagastusedGridApi) {
                setTimeout(() => GridManager.initializeGrid(), 100);
            }

            // Process the data for tagastused
            DataProcessor.processTagastusedData();
        },

        /**
         * Hide Tagastused modal
         */
        hideModal() {
            $('#tagastused-modal').addClass('hidden');
            $('body').removeClass('overflow-hidden');
        }
    };

    // ===========================
    // EXPORT FUNCTIONALITY
    // ===========================

    const ExportManager = {
        /**
         * Export Tagastused data to CSV
         */
        exportData() {
            if (!TagastusedState.tagastusedData || TagastusedState.tagastusedData.length === 0) {
                Utils.showNotification('Andmeid pole eksportimiseks', 'warning');
                return;
            }

            // Create CSV content
            const headers = tagastusedColumns.map(col => col.headerName);
            const csvContent = [
                headers.join(';'),
                ...TagastusedState.tagastusedData.map(row =>
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

            Utils.showNotification(`Eksporditud ${TagastusedState.tagastusedData.length} rida`, 'success');
        }
    };

    // ===========================
    // INITIALIZATION
    // ===========================

    const Tagastused = {
        /**
         * Initialize the Tagastused module
         */
        init() {
            this.setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        setupEventHandlers() {
            // Modal handlers
            $('#tagastused-btn').click(() => ModalManager.showModal());
            $('#close-tagastused-modal, #tagastused-backdrop').click(() => ModalManager.hideModal());

            // Action handlers
            $('#refresh-tagastused-btn').click(() => this.refreshData());
            $('#export-tagastused-btn').click(() => ExportManager.exportData());

            // Update button states when data changes
            $(document).on('koondajaDataChanged', () => {
                UIManager.updateButtonStates();
            });

            // Initial button state setup
            UIManager.updateButtonStates();
        },

        /**
         * Refresh Tagastused data
         */
        refreshData() {
            const koondajaData = StateManager.getKoondajaData();

            if (!koondajaData || koondajaData.length === 0) {
                Utils.showNotification('Koondaja andmeid pole laetud', 'warning');
                return;
            }

            DataProcessor.processTagastusedData();
        },

        // Public API
        show: () => ModalManager.showModal(),
        hide: () => ModalManager.hideModal(),
        refresh: () => DataProcessor.processTagastusedData(),
        export: () => ExportManager.exportData(),
        getData: () => TagastusedState.tagastusedData
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Initialize when DOM is ready
    $(document).ready(() => {
        Tagastused.init();
    });

    // Export to window
    window.Tagastused = Tagastused;

})(window);