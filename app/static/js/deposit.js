/**
 * Final Fixed AG-Grid Deposit Module
 * Forces grid refresh and visibility after data import
 */

const DepositModule = {
    // State management
    state: {
        isVisible: false,
        currentData: [],
        selectedFile: null,
        currentPath: "",
        isLoading: false,
        isBrowserVisible: false,
        gridApi: null,
        columnApi: null,
        gridReady: false,
        predefinedColumns: []  // Add this to store column order
    },

    /**
     * Create column definitions from actual data
     */
    createColumnDefsFromData(data) {
        // If we have predefined columns from the API, use that order
        if (this.state.predefinedColumns && this.state.predefinedColumns.length > 0) {
            console.log("Using predefined column order:", this.state.predefinedColumns);

            const columns = this.state.predefinedColumns.map(field => ({
                field: field,
                headerName: field,
                width: this.calculateColumnWidth(field, data),
                resizable: true,
                sortable: true,
                filter: 'agTextColumnFilter',
                floatingFilter: true,
                cellStyle: {fontSize: '12px'},
                valueFormatter: (params) => {
                    if (params.value === null || params.value === undefined) {
                        return '';
                    }
                    return String(params.value);
                }
            }));

            console.log(`Created ${columns.length} column definitions using predefined order`);
            return columns;
        }

        // Fallback to detecting from data if no predefined columns
        if (!data || data.length === 0) {
            console.log("No data provided, using default columns");
            return [
                {field: 'placeholder', headerName: 'No Data', width: 200, resizable: true}
            ];
        }

        // Get all unique keys from the data
        const allKeys = new Set();
        data.slice(0, 10).forEach(row => {  // Check first 10 rows
            Object.keys(row).forEach(key => allKeys.add(key));
        });

        console.log("Detected columns from data:", Array.from(allKeys));

        const columns = Array.from(allKeys).map(field => ({
            field: field,
            headerName: field,
            width: this.calculateColumnWidth(field, data),
            resizable: true,
            sortable: true,
            filter: 'agTextColumnFilter',
            floatingFilter: true,
            cellStyle: {fontSize: '12px'},
            valueFormatter: (params) => {
                if (params.value === null || params.value === undefined) {
                    return '';
                }
                return String(params.value);
            }
        }));

        console.log(`Created ${columns.length} column definitions from data detection`);
        return columns;
    },

    /**
     * Calculate optimal column width
     */
    calculateColumnWidth(field, data) {
        let maxLength = field.length;

        // Special width handling for specific Estonian column names
        const specialWidths = {
            "Toimiku nr lõplik": 150,
            "Kande kpv": 120,
            "Arvelduskonto nr": 160,
            "Panga tunnus": 120,
            "Nimi pangas": 200,
            "Nimi baasis": 200,
            "Nõude sisu": 180,
            "Toimiku jääk": 120,
            "Staatus baasis": 140,
            "Toimikute arv tööbaasis": 180,
            "Toimikute jääkide summa tööbaasis": 220,
            "Vahe": 100,
            "Elatus-miinimumid": 140,
            "Laekumiste arv": 120,
            "Laekumised kokku": 140,
            "Tagastamised": 120,
            "S/V": 80,
            "Summa": 120,
            "Viitenumber": 140,
            "Arhiveerimistunnus": 160,
            "Makse selgitus": 150,
            "Valuuta": 100,
            "Isiku- või registrikood": 180,
            "Isiku- või registrikood baasist": 200,
            "Laekusmise tunnus": 140,
            "Laekusmise kood deposiidis": 180,
            "Kliendi konto": 140,
            "EM märkus": 150,
            "Toimiku märkused": 200
        };

        // Use special width if defined
        if (specialWidths[field]) {
            return specialWidths[field];
        }

        // Check data for dynamic width calculation
        if (data && data.length > 0) {
            // Check first 20 rows for performance
            for (let i = 0; i < Math.min(data.length, 20); i++) {
                const value = data[i][field];
                if (value !== null && value !== undefined) {
                    maxLength = Math.max(maxLength, String(value).length);
                }
            }
        }

        // Convert to pixels (8px per character + padding)
        return Math.min(Math.max(maxLength * 8 + 30, 120), 350);
    },

    // AG-Grid options
    getGridOptions() {
        return {
            columnDefs: [],
            rowData: [],

            defaultColDef: {
                resizable: true,
                sortable: true,
                filter: true,
                floatingFilter: false, // Disable initially for performance
                minWidth: 100,
                suppressMovable: false
            },

            // Excel-like features
            enableRangeSelection: true,
            enableCellTextSelection: true,
            suppressMovableColumns: false,

            // Row selection
            rowSelection: 'multiple',

            // Pagination
            pagination: true,
            paginationPageSize: 50,
            paginationAutoPageSize: false,

            // Performance
            animateRows: false, // Disable for better performance
            suppressColumnVirtualisation: false,
            suppressRowVirtualisation: false,

            // Sizing
            domLayout: 'normal',

            // Event handlers
            onGridReady: (params) => {
                console.log('=== AG-Grid Ready ===');
                this.state.gridApi = params.api;
                this.state.columnApi = params.columnApi;
                this.state.gridReady = true;

                // Force initial sizing
                setTimeout(() => {
                    this.state.gridApi.sizeColumnsToFit();
                }, 100);

                // If we have data waiting, load it now
                if (this.state.currentData.length > 0) {
                    console.log('Loading waiting data into grid');
                    this.forceGridUpdate();
                }
            },

            onFirstDataRendered: (params) => {
                console.log('=== First Data Rendered ===');
                this.autoSizeAllColumns();
            },

            onColumnMoved: () => this.saveGridState(),
            onColumnResized: () => this.saveGridState(),
            onSortChanged: () => this.saveGridState(),
            onFilterChanged: () => this.updateRowCount(),

            // Context menu
            getContextMenuItems: (params) => this.getContextMenuItems(params)
        };
    },

    /**
     * Initialize the module
     */
    init() {
        console.log("Initializing Final Fixed AG-Grid Deposit module...");
        this.bindEvents();
        this.addTableControls();
        console.log("Final Fixed AG-Grid Deposit module initialized");
    },

    /**
     * Bind events
     */
    bindEvents() {
        $(document).off('.deposit-module');

        $(document).on('click.deposit-module', '#deposit-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.show();
        });

        this.bindModalEvents();
        this.bindCSVBrowserEvents();

        $(document).on('click.deposit-module', '.modal-content', (e) => {
            e.stopPropagation();
        });

        $(document).on('keydown.deposit-module', (e) => {
            if (this.state.isVisible && e.key === 'Escape') {
                if (this.state.isBrowserVisible) {
                    e.preventDefault();
                    this.hideCSVBrowser();
                } else {
                    e.preventDefault();
                    this.hide();
                }
            }
        });
    },

    bindModalEvents() {
        $('#close-deposit-modal, #deposit-backdrop, #back-to-normal-view-btn, #import-deposit-csv-btn').off('.deposit-modal');

        $('#close-deposit-modal').on('click.deposit-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        $('#deposit-backdrop').on('click.deposit-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        $('#back-to-normal-view-btn').on('click.deposit-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        $('#import-deposit-csv-btn').on('click.deposit-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showCSVBrowser();
        });
    },

    bindCSVBrowserEvents() {
        $('#close-csv-browser-modal, #csv-browser-backdrop, #csv-cancel-btn, #csv-select-btn').off('.csv-browser');

        $('#close-csv-browser-modal').on('click.csv-browser', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideCSVBrowser();
        });

        $('#csv-browser-backdrop').on('click.csv-browser', (e) => {
            if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
                this.hideCSVBrowser();
            }
        });

        $('#csv-cancel-btn').on('click.csv-browser', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideCSVBrowser();
        });

        $('#csv-select-btn').on('click.csv-browser', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectCSVFile();
        });
    },

    /**
     * Initialize AG-Grid with explicit sizing
     */
    initializeGrid() {
        const gridDiv = document.querySelector('#deposit-ag-grid');
        if (!gridDiv) {
            console.error('AG-Grid container not found');
            return;
        }

        console.log('Initializing AG-Grid for maximum height...');

        // Calculate available height dynamically
        const modal = document.querySelector('#deposit-modal .modal-content');
        const header = document.querySelector('#deposit-modal .flex.justify-between');
        const toolbar = document.querySelector('#deposit-toolbar');
        const contentPadding = 16; // p-2 = 8px top + 8px bottom
        const toolbarMargin = 8; // mb-2 = 8px
        const borderSpace = 2; // border thickness

        if (modal && header && toolbar) {
            const modalHeight = modal.offsetHeight;
            const headerHeight = header.offsetHeight;
            const toolbarHeight = toolbar.offsetHeight;
            const availableHeight = modalHeight - headerHeight - toolbarHeight - contentPadding - toolbarMargin - borderSpace;

            console.log(`Calculated grid height: ${availableHeight}px`);
            gridDiv.style.height = `${availableHeight}px`;
        } else {
            // Fallback to calculated height
            gridDiv.style.height = 'calc(95vh - 140px)';
        }

        gridDiv.style.width = '100%';

        // Create the grid
        const gridOptions = this.getGridOptions();
        this.gridInstance = new agGrid.Grid(gridDiv, gridOptions);

        console.log('AG-Grid instance created with maximum height');
    },

    addTableControls() {
        const toolbar = $("#deposit-toolbar");

        if (toolbar.find('.table-controls').length > 0) {
            return; // Already added
        }

        const tableControls = $(`
            <div class="table-controls flex gap-1 ml-2">
                <button id="auto-size-columns-btn" class="compact-btn btn-outline text-xs" title="Auto-size columns">
                    <i class="fas fa-expand-arrows-alt"></i>
                </button>
                <button id="fit-columns-btn" class="compact-btn btn-outline text-xs" title="Fit to width">
                    <i class="fas fa-compress-arrows-alt"></i>
                </button>
                <button id="refresh-grid-btn" class="compact-btn btn-outline text-xs" title="Refresh grid">
                    <i class="fas fa-sync"></i>
                </button>
                <button id="export-csv-btn" class="compact-btn btn-outline text-xs" title="Export CSV">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `);

        toolbar.find('.ml-auto').before(tableControls);

        // Bind events
        $('#auto-size-columns-btn').on('click', () => this.autoSizeAllColumns());
        $('#fit-columns-btn').on('click', () => this.fitColumnsToWidth());
        $('#refresh-grid-btn').on('click', () => this.forceGridUpdate());
        $('#export-csv-btn').on('click', () => this.exportCSV());
    },

    /**
     * Show deposit modal
     */
    async show() {
        try {
            console.log("Showing deposit modal...");
            this.state.isVisible = true;

            $("#deposit-modal").removeClass("hidden");
            $("body").addClass("overflow-hidden");

            // Wait for modal to be fully rendered before initializing grid
            setTimeout(() => {
                this.initializeGrid();
                this.bindModalEvents();

                // Force resize after initialization
                setTimeout(() => {
                    if (this.state.gridApi) {
                        this.state.gridApi.sizeColumnsToFit();
                        console.log('Grid resized to fit modal');
                    }
                }, 100);

            }, 300); // Increased timeout to ensure modal is fully rendered

            // Load initial empty data
            await this.loadDepositData();

            setTimeout(() => {
                $("#close-deposit-modal").focus();
            }, 400);

        } catch (error) {
            console.error("Error showing deposit modal:", error);
            this.showError("Viga deposiidivaate avamisel: " + error.message);
        }
    },

    hide() {
        console.log("Hiding deposit modal...");
        this.state.isVisible = false;

        if (this.state.isBrowserVisible) {
            this.hideCSVBrowser();
        }

        $("body").removeClass("overflow-hidden csv-browser-open");
        $("#deposit-modal").addClass("hidden");

        // Destroy grid
        if (this.state.gridApi) {
            this.state.gridApi.destroy();
            this.state.gridApi = null;
            this.state.columnApi = null;
            this.state.gridReady = false;
        }

        setTimeout(() => {
            $("#deposit-btn").focus();
        }, 100);
    },

    async loadDepositData() {
        try {
            this.setLoading(true);

            const response = await this.makeAPICall('/api/v1/table/deposit-data', {
                method: 'GET'
            });

            if (response.success) {
                this.state.currentData = response.data || [];

                // Store predefined column order from API
                if (response.columns && response.columns.length > 0) {
                    this.state.predefinedColumns = response.columns;
                    console.log(`Stored ${this.state.predefinedColumns.length} predefined columns:`, this.state.predefinedColumns);
                }

                this.updateRowCount();
                console.log(`Loaded ${this.state.currentData.length} initial deposit rows`);

                // Show empty state initially
                if (this.state.currentData.length === 0) {
                    $("#deposit-empty-state").show();
                    $("#deposit-ag-grid").hide();
                }
            }

        } catch (error) {
            console.error("Error loading deposit data:", error);
            this.showError("Viga andmete laadimisel: " + error.message);
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Force grid update with comprehensive refresh
     */
    forceGridUpdate() {
        if (!this.state.gridApi || !this.state.gridReady) {
            console.warn("Grid not ready for update");
            return;
        }

        console.log(`=== FORCING GRID UPDATE ===`);
        console.log(`Data length: ${this.state.currentData.length}`);
        console.log(`First row:`, this.state.currentData[0]);

        // Hide empty state, show grid
        $("#deposit-empty-state").hide();
        $("#deposit-ag-grid").show();

        // Create fresh column definitions
        const columnDefs = this.createColumnDefsFromData(this.state.currentData);

        // Set columns first
        this.state.gridApi.setColumnDefs(columnDefs);

        // Then set data
        this.state.gridApi.setRowData(this.state.currentData);

        // Force refresh
        setTimeout(() => {
            this.state.gridApi.refreshCells({force: true});
            this.state.gridApi.redrawRows();
            this.autoSizeAllColumns();
            this.updateRowCount();
            console.log("Grid forced update complete");
        }, 100);
    },

    autoSizeAllColumns() {
        if (this.state.columnApi && this.state.gridReady) {
            this.state.columnApi.autoSizeAllColumns();
            console.log("Auto-sized all columns");
        }
    },

    fitColumnsToWidth() {
        if (this.state.gridApi && this.state.gridReady) {
            this.state.gridApi.sizeColumnsToFit();
            console.log("Fitted columns to width");
        }
    },

    exportCSV() {
        if (this.state.gridApi) {
            const params = {
                fileName: `deposiit_andmed_${new Date().toISOString().split('T')[0]}.csv`,
                columnSeparator: ';'
            };
            this.state.gridApi.exportDataAsCsv(params);
            this.showSuccess("CSV fail eksportitud");
        }
    },

    saveGridState() {
        if (this.state.columnApi && this.state.gridApi && this.state.gridReady) {
            try {
                const gridState = {
                    columns: this.state.columnApi.getColumnState(),
                    filter: this.state.gridApi.getFilterModel(),
                    sort: this.state.gridApi.getSortModel(),
                    timestamp: Date.now()
                };
                localStorage.setItem('deposit-grid-state', JSON.stringify(gridState));
            } catch (error) {
                console.warn("Could not save grid state:", error);
            }
        }
    },

    getContextMenuItems(params) {
        return [
            {
                name: 'Auto-size veerg',
                action: () => this.state.columnApi.autoSizeColumn(params.column.getColId())
            },
            {
                name: 'Auto-size kõik veerud',
                action: () => this.autoSizeAllColumns()
            },
            'separator',
            'copy',
            'copyWithHeaders',
            'export'
        ];
    },

    updateRowCount() {
        if (this.state.gridApi && this.state.gridReady) {
            const displayedRows = this.state.gridApi.getDisplayedRowCount();
            const totalRows = this.state.currentData.length;

            let countText = `${totalRows} rida`;
            if (displayedRows !== totalRows) {
                countText += ` (${displayedRows} nähtav)`;
            }

            $("#deposit-row-count").text(countText);
        } else {
            $("#deposit-row-count").text(`${this.state.currentData.length} rida`);
        }
    },

    // CSV Browser methods (same as before)
    async showCSVBrowser() {
        try {
            this.state.isBrowserVisible = true;
            $("body").addClass("csv-browser-open");
            $("#csv-browser-modal").removeClass("hidden").addClass("show");

            this.state.currentPath = "";
            this.state.selectedFile = null;
            $("#csv-select-btn").prop('disabled', true);

            setTimeout(() => {
                this.bindCSVBrowserEvents();
            }, 100);

            await this.loadCSVBrowserContent();

            setTimeout(() => {
                $("#close-csv-browser-modal").focus();
            }, 200);

        } catch (error) {
            console.error("Error showing CSV browser:", error);
            this.showError("Viga failisirvija avamisel: " + error.message);
        }
    },

    hideCSVBrowser() {
        this.state.isBrowserVisible = false;
        $("body").removeClass("csv-browser-open");
        $("#csv-browser-modal").removeClass("show").addClass("hidden");
        this.state.selectedFile = null;
        $("#csv-select-btn").prop('disabled', true);

        setTimeout(() => {
            $("#import-deposit-csv-btn").focus();
        }, 100);
    },

    async loadCSVBrowserContent(path = "") {
        try {
            this.setCSVBrowserLoading(true);

            const url = `/api/v1/table/browse-deposit-folder${path ? `?path=${encodeURIComponent(path)}` : ''}`;
            const response = await this.makeAPICall(url, {method: 'GET'});

            if (response && response.success) {
                this.state.currentPath = response.current_path || "";
                this.renderCSVBrowserTable(response.items || []);
                this.updateCSVBreadcrumb(response.current_path || "");
            } else {
                throw new Error(response?.error || "Failed to browse folder");
            }

        } catch (error) {
            console.error("Error loading CSV browser content:", error);
            this.showCSVBrowserError(error.message || "Tundmatu viga");
        } finally {
            setTimeout(() => {
                this.setCSVBrowserLoading(false);
            }, 100);
        }
    },

    renderCSVBrowserTable(items) {
        const tbody = $("#csv-files-table-body");
        tbody.empty();
        $("#csv-browser-error").addClass("hidden");

        if (this.state.currentPath) {
            const backRow = $(`
                <tr class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 csv-folder-row" data-path="..">
                    <td class="px-3 py-2 text-center"><i class="fas fa-level-up-alt text-blue-500"></i></td>
                    <td class="px-3 py-2 font-medium text-blue-600">.. (Tagasi)</td>
                    <td class="px-3 py-2">Kaust</td>
                    <td class="px-3 py-2">-</td>
                    <td class="px-3 py-2">-</td>
                </tr>
            `);
            tbody.append(backRow);
        }

        items.forEach(item => {
            const isFolder = item.type === 'folder';
            const isCSV = item.type === 'file' && item.name.toLowerCase().endsWith('.csv');

            const row = $(`
                <tr class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isFolder ? 'csv-folder-row' : isCSV ? 'csv-file-row' : 'csv-disabled-row'}" 
                    data-path="${this.escapeHtml(item.path)}" 
                    data-name="${this.escapeHtml(item.name)}">
                    <td class="px-3 py-2 text-center">
                        <i class="fas ${isFolder ? 'fa-folder text-blue-500' : isCSV ? 'fa-file-csv text-green-500' : 'fa-file text-gray-400'}"></i>
                    </td>
                    <td class="px-3 py-2 font-medium ${isCSV ? 'text-green-600' : ''}">
                        ${this.escapeHtml(item.name)}
                    </td>
                    <td class="px-3 py-2">${isFolder ? 'Kaust' : 'CSV fail'}</td>
                    <td class="px-3 py-2">${item.size ? this.formatFileSize(item.size) : '-'}</td>
                    <td class="px-3 py-2">${item.modified || '-'}</td>
                </tr>
            `);
            tbody.append(row);
        });

        // Bind events
        tbody.find('.csv-folder-row').off('click').on('click', (e) => {
            const path = $(e.currentTarget).data('path');
            if (path === '..') {
                const pathParts = this.state.currentPath.split('/').filter(p => p);
                pathParts.pop();
                this.loadCSVBrowserContent(pathParts.join('/'));
            } else {
                this.loadCSVBrowserContent(path);
            }
        });

        tbody.find('.csv-file-row').off('click').on('click', (e) => {
            const path = $(e.currentTarget).data('path');
            const name = $(e.currentTarget).data('name');
            this.selectCSVFileRow(path, name, e.currentTarget);
        });
    },

    selectCSVFileRow(path, name, rowElement) {
        if (!path || !name) {
            this.showError("Vigane faili valik");
            return;
        }

        $(".csv-file-row").removeClass("bg-blue-50 dark:bg-blue-900");
        $(rowElement).addClass("bg-blue-50 dark:bg-blue-900");

        this.state.selectedFile = {path: path, name: name};
        $("#csv-select-btn").prop('disabled', false);
    },

    updateCSVBreadcrumb(currentPath) {
        const basePath = "C:\\TAITEMENETLUS\\ÜLESANDED\\Tööriistad\\ROCKI";
        const fullPath = currentPath ? `${basePath}\\${currentPath.replace(/\//g, '\\')}` : basePath;
        $("#csv-current-path").text(fullPath);
    },

    /**
     * Import CSV file - FINAL FIXED VERSION
     */
    async selectCSVFile() {
        if (!this.state.selectedFile?.path) {
            this.showError("Palun valige CSV fail");
            return;
        }

        const selectedFile = {
            path: this.state.selectedFile.path,
            name: this.state.selectedFile.name
        };

        try {
            console.log(`=== IMPORTING CSV: ${selectedFile.name} ===`);
            this.setLoading(true);
            this.hideCSVBrowser();

            const response = await this.makeAPICall('/api/v1/table/import-deposit-csv', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({file_path: selectedFile.path})
            });

            console.log("=== IMPORT RESPONSE ===");
            console.log("Success:", response?.success);
            console.log("Data length:", response?.data?.length);

            if (response?.data?.length > 0) {
                console.log("First row keys:", Object.keys(response.data[0]));
                console.log("Predefined column order will be used:", this.state.predefinedColumns);
            }

            if (response?.success && response?.data) {
                this.state.currentData = response.data;
                console.log(`=== DATA LOADED: ${this.state.currentData.length} rows ===`);

                // Force grid update immediately with predefined column order
                this.forceGridUpdate();

                this.showSuccess(response.message || 'CSV fail edukalt imporditud');
            } else {
                throw new Error(response?.detail || response?.error || "No data received");
            }

        } catch (error) {
            console.error("Error importing CSV:", error);
            this.showError("Viga CSV importimisel: " + error.message);
        } finally {
            this.setLoading(false);
        }
    },

    // Utility methods
    async makeAPICall(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {'Content-Type': 'application/json', ...options.headers}
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    },

    setLoading(loading) {
        this.state.isLoading = loading;
        const toolbar = $("#deposit-toolbar");
        if (loading) {
            toolbar.addClass("opacity-50 pointer-events-none");
        } else {
            toolbar.removeClass("opacity-50 pointer-events-none");
        }
    },

    setCSVBrowserLoading(loading) {
        const tableContainer = $("#csv-files-table-container");
        const errorContainer = $("#csv-browser-error");
        const loadingContainer = $("#csv-browser-loading");

        if (loading) {
            tableContainer.addClass("hidden");
            errorContainer.addClass("hidden");
            loadingContainer.removeClass("hidden");
        } else {
            loadingContainer.addClass("hidden");
            errorContainer.addClass("hidden");
            tableContainer.removeClass("hidden");
        }
    },

    showCSVBrowserError(message) {
        $("#csv-files-table-container").addClass("hidden");
        $("#csv-browser-loading").addClass("hidden");
        $("#csv-browser-error").removeClass("hidden");
        $("#csv-browser-error-message").text(message);
    },

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    showSuccess(message) {
        console.log("Success:", message);
        if (typeof showToast === 'function') {
            showToast("Edukas", message, "success");
        } else {
            alert("Edukas: " + message);
        }
    },

    showError(message) {
        console.error("Error:", message);
        if (typeof showToast === 'function') {
            showToast("Viga", message, "error");
        } else {
            alert("Viga: " + message);
        }
    }
};

// Initialize when DOM is ready
$(document).ready(() => {
    console.log("DOM ready, initializing Final Fixed AG-Grid Deposit module...");

    setTimeout(() => {
        try {
            DepositModule.init();

            // Debug helper - add to window for console access
            window.DepositDebug = {
                checkData: () => {
                    console.log("=== DEBUG INFO ===");
                    console.log("Current data length:", DepositModule.state.currentData.length);
                    console.log("Grid ready:", DepositModule.state.gridReady);
                    console.log("Grid API:", !!DepositModule.state.gridApi);
                    console.log("Sample data:", DepositModule.state.currentData.slice(0, 2));
                },
                forceRefresh: () => {
                    DepositModule.forceGridUpdate();
                }
            };

        } catch (error) {
            console.error("Error initializing Final Fixed AG-Grid Deposit module:", error);
        }
    }, 500);
});

// Export for global access
window.DepositModule = DepositModule;