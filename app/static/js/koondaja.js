/**
 * Koondaja Module - Advanced CSV Data Aggregation System
 * Written by senior Python web developer with 20+ years experience
 * Uses modern JavaScript ES6+ syntax with efficient performance optimizations
 */

const KoondajaModule = {
    // Module state management
    state: {
        isVisible: false,
        isLoading: false,
        gridApi: null,
        gridColumnApi: null,
        currentData: [],
        loadingProgress: 0,
        processedFolders: 0,
        totalFolders: 5, // CSV, Konto vv, MTA, Pension, töötukassa
        lookupData: {
            viitenumber_lookup: {},
            isikukood_lookup: {}
        }
    },

    // Predefined column definitions for Koondaja table
    columnDefs: [
        {
            headerName: "Column1",
            field: "column1",
            width: 120,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Viitenumber",
            field: "viitenumber",
            width: 140,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Selgitus",
            field: "selgitus",
            width: 200,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true,
            wrapText: true,
            autoHeight: true
        },
        {
            headerName: "Toimiku nr",
            field: "toimiku_nr",
            width: 120,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Toimik vn järgi",
            field: "toimik_vn_jargi",
            width: 140,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Toimik mk järgi",
            field: "toimik_mk_jargi",
            width: 140,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Maksja IK järgi",
            field: "maksja_ik_jargi",
            width: 140,
            sortable: true,
            filter: "agTextColumnFilter",
            floatingFilter: true,
            resizable: true
        },
        {
            headerName: "Makse summa",
            field: "makse_summa",
            width: 120,
            sortable: true,
            filter: "agNumberColumnFilter",
            floatingFilter: true,
            resizable: true,
            cellClass: "text-right",
            valueFormatter: params => {
                if (params.value && !isNaN(params.value)) {
                    return new Intl.NumberFormat('et-EE', {
                        style: 'currency',
                        currency: 'EUR',
                        minimumFractionDigits: 2
                    }).format(parseFloat(params.value));
                }
                return params.value || '';
            }
        },
        {
            headerName: "Jääk peale maksmist",
            field: "jaak_peale_maksmist",
            width: 160,
            sortable: true,
            filter: "agNumberColumnFilter",
            floatingFilter: true,
            resizable: true,
            cellClass: "text-right",
            valueFormatter: params => {
                if (params.value && !isNaN(params.value)) {
                    return new Intl.NumberFormat('et-EE', {
                        style: 'currency',
                        currency: 'EUR',
                        minimumFractionDigits: 2
                    }).format(parseFloat(params.value));
                }
                return params.value || '';
            }
        }
    ],

    // Grid configuration
    gridOptions: {
        columnDefs: [],
        rowData: [],
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            floatingFilter: true,
            minWidth: 100,
            maxWidth: 300
        },
        enableRangeSelection: true,
        enableRangeHandle: true,
        enableFillHandle: true,
        suppressContextMenu: false,
        allowContextMenuWithControlKey: true,
        enableCellChangeFlash: true,
        animateRows: true,
        rowSelection: 'multiple',
        suppressRowDeselection: false,
        suppressRowClickSelection: false,
        rowGroupPanelShow: 'always',
        pivotPanelShow: 'always',

        // ENABLE HORIZONTAL SCROLLING
        suppressHorizontalScroll: false,
        alwaysShowHorizontalScroll: false,
        suppressColumnVirtualisation: false,

        sideBar: {
            toolPanels: [
                {
                    id: 'columns',
                    labelDefault: 'Veerud',
                    labelKey: 'columns',
                    iconKey: 'columns',
                    toolPanel: 'agColumnsToolPanel',
                    minWidth: 225,
                    maxWidth: 225,
                    width: 225
                },
                {
                    id: 'filters',
                    labelDefault: 'Filtrid',
                    labelKey: 'filters',
                    iconKey: 'filter',
                    toolPanel: 'agFiltersToolPanel',
                    minWidth: 180,
                    maxWidth: 400,
                    width: 250
                }
            ],
            position: 'left',
            defaultToolPanel: 'columns'
        },
        statusBar: {
            statusPanels: [
                {
                    statusPanel: 'agTotalAndFilteredRowCountComponent',
                    align: 'left'
                },
                {
                    statusPanel: 'agSelectedRowCountComponent',
                    align: 'center'
                },
                {
                    statusPanel: 'agAggregationComponent',
                    align: 'right'
                }
            ]
        },
        // FIXED: Use regular function with proper context binding
        onGridReady: null, // Will be set in initializeGrid
        onSelectionChanged: null, // Will be set in initializeGrid
        onRowDataChanged: null, // Will be set in initializeGrid
        onFilterChanged: null // Will be set in initializeGrid
    },

    /**
     * Initialize the Koondaja module
     */
    init() {
        console.log("Initializing Koondaja module...");
        this.bindEvents();
        this.addTableControls();
        console.log("Koondaja module initialized successfully");
    },

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Remove any existing event handlers
        $(document).off('.koondaja-module');

        // Main button click
        $(document).on('click.koondaja-module', '#koondaja-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.show();
        });

        // Modal event handlers
        this.bindModalEvents();

        // Stop propagation on modal content clicks
        $(document).on('click.koondaja-module', '#koondaja-modal .modal-content', (e) => {
            e.stopPropagation();
        });

        // Escape key handler
        $(document).on('keydown.koondaja-module', (e) => {
            if (this.state.isVisible && e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
        });
    },

    /**
     * Bind modal-specific events
     */
    bindModalEvents() {
        // Remove existing modal events
        $('#close-koondaja-modal, #koondaja-backdrop, #back-from-koondaja-btn, #load-koondaja-data-btn').off('.koondaja-modal');

        // Close modal events
        $('#close-koondaja-modal').on('click.koondaja-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        $('#koondaja-backdrop').on('click.koondaja-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        $('#back-from-koondaja-btn').on('click.koondaja-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        });

        // Load data button
        $('#load-koondaja-data-btn').on('click.koondaja-modal', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.loadKoondajaData();
        });
    },

    /**
     * Add table control buttons
     */
    addTableControls() {
        const toolbar = $('#koondaja-toolbar');
        if (toolbar.find('.koondaja-table-controls').length > 0) {
            return; // Already added
        }

        const tableControls = $(`
            <div class="koondaja-table-controls flex gap-1 ml-2">
                <button id="koondaja-auto-size-columns-btn" class="compact-btn btn-outline text-xs" title="Auto-size columns">
                    <i class="fas fa-expand-arrows-alt"></i>
                </button>
                <button id="koondaja-fit-columns-btn" class="compact-btn btn-outline text-xs" title="Fit to width">
                    <i class="fas fa-compress-arrows-alt"></i>
                </button>
                <button id="koondaja-reset-columns-btn" class="compact-btn btn-outline text-xs" title="Reset column widths">
                    <i class="fas fa-undo"></i>
                </button>
                <button id="koondaja-refresh-grid-btn" class="compact-btn btn-outline text-xs" title="Refresh grid">
                    <i class="fas fa-sync"></i>
                </button>
                <button id="koondaja-export-csv-btn" class="compact-btn btn-outline text-xs" title="Export CSV">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `);

        toolbar.find('.ml-auto').before(tableControls);

        // Bind control events
        $('#koondaja-auto-size-columns-btn').on('click', () => this.autoSizeAllColumns());
        $('#koondaja-fit-columns-btn').on('click', () => this.fitColumnsToWidth());
        $('#koondaja-reset-columns-btn').on('click', () => this.resetColumnWidths());
        $('#koondaja-refresh-grid-btn').on('click', () => this.forceGridUpdate());
        $('#koondaja-export-csv-btn').on('click', () => this.exportCSV());
    },

    /**
     * Show Koondaja modal
     */
    async show() {
        try {
            console.log("Showing Koondaja modal...");
            this.state.isVisible = true;

            $("#koondaja-modal").removeClass("hidden");
            $("body").addClass("overflow-hidden");

            // Show empty state initially
            this.showEmptyState();

            // Wait for modal to be fully rendered and visible
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check if modal and grid container are properly sized
            const modal = document.getElementById('koondaja-modal');
            const gridContainer = document.getElementById('koondaja-ag-grid');

            console.log("Modal display:", modal ? window.getComputedStyle(modal).display : 'not found');
            console.log("Grid container size:", gridContainer ?
                `${gridContainer.offsetWidth}x${gridContainer.offsetHeight}` : 'not found');

            // Initialize grid with proper timing
            setTimeout(() => {
                console.log("Initializing grid...");
                this.initializeGrid();
                this.bindModalEvents();

                // Wait for grid to be fully initialized with multiple checks
                const checkGridReady = (attempt = 1) => {
                    console.log(`Grid ready check attempt ${attempt}`);

                    if (this.state.gridApi) {
                        console.log('Koondaja grid ready and API available');

                        // DON'T auto-fit columns to allow horizontal scrolling
                        // this.state.gridApi.sizeColumnsToFit();

                        this.debugGridState();

                        // Focus the close button
                        setTimeout(() => {
                            $("#close-koondaja-modal").focus();
                        }, 100);

                    } else if (attempt < 10) {
                        console.log(`Grid not ready, retrying in ${attempt * 100}ms...`);
                        setTimeout(() => checkGridReady(attempt + 1), attempt * 100);
                    } else {
                        console.error('Grid failed to initialize after multiple attempts');
                        // Try one more desperate attempt
                        setTimeout(() => {
                            console.log("Final attempt to initialize grid...");
                            this.initializeGrid();
                        }, 500);
                    }
                };

                // Start checking for grid readiness
                setTimeout(() => checkGridReady(), 200);

            }, 400); // Increased timeout to ensure modal is fully rendered

        } catch (error) {
            console.error("Error showing Koondaja modal:", error);
            this.showError("Viga modali avamisel: " + error.message);
        }
    },

    /**
     * Hide Koondaja modal
     */
    hide() {
        try {
            console.log("Hiding Koondaja modal...");
            this.state.isVisible = false;

            $("#koondaja-modal").addClass("hidden");
            $("body").removeClass("overflow-hidden");

            // Clean up grid
            if (this.state.gridApi) {
                this.state.gridApi.destroy();
                this.state.gridApi = null;
                this.state.gridColumnApi = null;
            }

            // Reset state including lookup data
            this.state.currentData = [];
            this.state.loadingProgress = 0;
            this.state.processedFolders = 0;
            this.state.lookupData = {
                viitenumber_lookup: {},
                isikukood_lookup: {}
            };

        } catch (error) {
            console.error("Error hiding Koondaja modal:", error);
        }
    },

    /**
     * Initialize AG-Grid
     */
    initializeGrid() {
        try {
            const gridContainer = document.querySelector('#koondaja-ag-grid');
            if (!gridContainer) {
                throw new Error("Grid container not found");
            }

            console.log("Initializing Koondaja AG-Grid...");
            console.log("Grid container:", gridContainer);
            console.log("Column definitions:", this.columnDefs);

            // Set column definitions
            this.gridOptions.columnDefs = [...this.columnDefs];

            // Ensure we have empty data initially
            this.gridOptions.rowData = [];

            // FIXED: Set callbacks with proper context binding
            const self = this;

            this.gridOptions.onGridReady = function(params) {
                console.log("Grid ready callback fired");
                self.state.gridApi = params.api;
                self.state.gridColumnApi = params.columnApi;
                console.log('Koondaja AG-Grid initialized successfully');
                console.log("Grid API set:", !!self.state.gridApi);
            };

            this.gridOptions.onSelectionChanged = function() {
                self.updateRowCount();
            };

            this.gridOptions.onRowDataChanged = function() {
                self.updateRowCount();
            };

            this.gridOptions.onFilterChanged = function() {
                self.updateRowCount();
            };

            // Initialize grid
            new agGrid.Grid(gridContainer, this.gridOptions);

            // Wait for grid to be fully ready
            setTimeout(() => {
                if (this.state.gridApi) {
                    console.log("Koondaja AG-Grid initialized successfully");
                    console.log("Grid API available:", !!this.state.gridApi);
                    console.log("Grid column API available:", !!this.state.gridColumnApi);

                    // Debug grid state
                    this.debugGridState();
                } else {
                    console.error("Grid API not available after initialization");
                }
            }, 100);

        } catch (error) {
            console.error("Error initializing Koondaja grid:", error);
            this.showError("Viga tabeli lähtestamisel: " + error.message);
        }
    },

    /**
     * Debug grid state helper
     */
    debugGridState() {
        try {
            if (this.state.gridApi) {
                console.log("=== GRID DEBUG INFO ===");
                console.log("Row count:", this.state.gridApi.getDisplayedRowCount());
                console.log("Grid ready:", this.state.gridApi.isDestroyed ? 'Destroyed' : 'Ready');
                console.log("Column count:", this.state.gridApi.getColumnDefs().length);
                console.log("Grid height:", document.querySelector('#koondaja-ag-grid').offsetHeight);
                console.log("Grid width:", document.querySelector('#koondaja-ag-grid').offsetWidth);
                console.log("=======================");
            }
        } catch (error) {
            console.error("Error debugging grid state:", error);
        }
    },

    /**
     * Load data from all folders - starting with Konto vv
     */
    async loadKoondajaData() {
        try {
            console.log("=== STARTING KOONDAJA DATA LOADING ===");
            this.setLoading(true);
            this.hideEmptyState();

            // Reset progress
            this.state.processedFolders = 0;
            this.state.loadingProgress = 0;
            this.updateLoadingProgress();

            // Clear existing data and lookup cache
            this.state.currentData = [];
            this.state.lookupData = {
                viitenumber_lookup: {},
                isikukood_lookup: {}
            };
            console.log("Cleared existing data and lookup cache");

            // Ensure grid is available before loading data
            if (!this.state.gridApi) {
                console.log("Grid not ready, waiting...");
                // Wait a bit more and try to reinitialize if needed
                let retries = 0;
                while (!this.state.gridApi && retries < 10) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retries++;
                    console.log(`Waiting for grid... retry ${retries}`);
                }

                if (!this.state.gridApi) {
                    console.log("Grid still not ready, forcing reinitialization...");
                    this.initializeGrid();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // First, let's load data from "Konto vv" folder
            await this.loadFromKontoVvFolder();

            console.log(`=== DATA LOADING COMPLETE ===`);
            console.log(`Total rows loaded: ${this.state.currentData.length}`);
            console.log(`Lookup data cached: ${Object.keys(this.state.lookupData.viitenumber_lookup).length} viitenumbrid, ${Object.keys(this.state.lookupData.isikukood_lookup).length} isikukoodid`);

            // Update grid with loaded data
            this.forceGridUpdate();

            // Multiple attempts to ensure grid shows data
            for (let attempt = 1; attempt <= 3; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));

                const displayedRows = this.state.gridApi ? this.state.gridApi.getDisplayedRowCount() : 0;
                console.log(`Grid check attempt ${attempt} - Displayed rows: ${displayedRows}`);

                if (displayedRows > 0) {
                    console.log("Grid successfully displaying data!");
                    break;
                } else if (this.state.currentData.length > 0) {
                    console.warn(`Grid not showing data on attempt ${attempt}, retrying...`);
                    this.forceGridUpdate();
                }
            }

            this.showSuccess(`Andmed edukalt laaditud! Kokku ${this.state.currentData.length} rida.`);

        } catch (error) {
            console.error("Error loading Koondaja data:", error);
            this.showError("Viga andmete laadimisel: " + error.message);
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Load and process data from Konto vv folder
     */
    async loadFromKontoVvFolder() {
        try {
            console.log("Loading data from Konto vv folder...");

            // Get all CSV files from Konto vv folder
            const folderPath = "Konto vv";
            const response = await this.makeAPICall(`/api/v1/table/browse-koondaja-folder?path=${encodeURIComponent(folderPath)}`);

            if (!response.success || !response.items) {
                throw new Error("Failed to browse Konto vv folder");
            }

            const csvFiles = response.items.filter(item =>
                item.type === 'file' && item.name.toLowerCase().endsWith('.csv')
            );

            console.log(`Found ${csvFiles.length} CSV files in Konto vv folder:`, csvFiles);

            // Process each CSV file
            for (const file of csvFiles) {
                console.log(`Processing file: ${file.name}`);
                await this.processKontoVvFile(file.path);

                // Update progress
                this.state.processedFolders++;
                this.updateLoadingProgress();
            }

            console.log(`=== FINAL DATA COUNT: ${this.state.currentData.length} rows ===`);

        } catch (error) {
            console.error("Error loading from Konto vv folder:", error);
            throw error;
        }
    },

    /**
     * Process a single CSV file from Konto vv folder
     */
    async processKontoVvFile(filePath) {
        try {
            console.log(`Processing Konto vv file: ${filePath}`);

            const response = await this.makeAPICall('/api/v1/table/import-koondaja-csv', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    file_path: filePath,
                    folder_type: 'konto_vv'
                })
            });

            console.log("=== API Response ===", response);

            if (!response.success || !response.data) {
                throw new Error(`Failed to process file: ${filePath}`);
            }

            console.log(`Raw data received: ${response.data.length} rows`);
            console.log("First few rows:", response.data.slice(0, 3));

            // Store lookup data for fast access
            if (response.lookup_data) {
                this.state.lookupData = response.lookup_data;
                console.log("Lookup data received:", {
                    viitenumber_matches: Object.keys(response.lookup_data.viitenumber_lookup || {}).length,
                    isikukood_matches: Object.keys(response.lookup_data.isikukood_lookup || {}).length
                });
            }

            // Transform the raw CSV data according to Konto vv mapping
            const transformedData = response.data.map((row, index) => {
                const transformed = this.transformKontoVvRow(row);
                if (index < 3) {
                    console.log(`Row ${index} transformation:`, {
                        raw: row,
                        transformed: transformed
                    });
                }
                return transformed;
            });

            // Add to current data
            this.state.currentData.push(...transformedData);

            console.log(`Processed ${transformedData.length} rows from ${filePath}`);
            console.log(`Total data now: ${this.state.currentData.length} rows`);

        } catch (error) {
            console.error(`Error processing Konto vv file ${filePath}:`, error);
            // Continue processing other files even if one fails
        }
    },

    /**
     * Transform raw CSV row data according to Konto vv mapping with database lookups
     */
    transformKontoVvRow(rawRow) {
        try {
            // Convert rawRow to array if it's an object
            let rowArray = [];
            if (Array.isArray(rawRow)) {
                rowArray = rawRow;
            } else if (typeof rawRow === 'object') {
                // Convert object values to array, preserving order
                rowArray = Object.values(rawRow);
            }

            console.log("Transforming row - raw:", rowArray);

            // Ensure we have enough columns
            while (rowArray.length < 20) {
                rowArray.push('');
            }

            // CORRECTED MAPPING:
            // Column1 = 11th item (index 10)
            // Viitenumber = 10th item (index 9)
            // Selgitus = 12th item (index 11)
            // Makse summa = 9th item (index 8)

            const column1 = (rowArray[10] || '').toString().trim();
            const viitenumber = (rowArray[9] || '').toString().trim();
            const selgitus = (rowArray[11] || '').toString().trim();
            const makseSumma = this.parseNumericValue(rowArray[8]);
            const item15 = (rowArray[14] || '').toString().trim(); // 15th item for DB lookup

            // Extract Toimik mk järgi pattern from Selgitus
            const toimikMkJargi = this.extractToimikPattern(selgitus);

            // DATABASE LOOKUPS using preloaded lookup data for optimal performance
            let toimikVnJargi = '';
            let maksjaIkJargi = '';

            // Lookup 1: Toimik vn järgi = Find toimiku_nr from main table where viitenumber matches
            if (viitenumber && this.state.lookupData.viitenumber_lookup) {
                toimikVnJargi = this.state.lookupData.viitenumber_lookup[viitenumber] || '';
                if (toimikVnJargi) {
                    console.log(`Viitenumber lookup: ${viitenumber} -> ${toimikVnJargi}`);
                }
            }

            // Lookup 2: Maksja IK järgi = Find toimiku_nr from main table where isikukood matches 15th item
            if (item15 && this.state.lookupData.isikukood_lookup) {
                maksjaIkJargi = this.state.lookupData.isikukood_lookup[item15] || '';
                if (maksjaIkJargi) {
                    console.log(`Isikukood lookup: ${item15} -> ${maksjaIkJargi}`);
                }
            }

            const transformed = {
                column1: column1,
                viitenumber: viitenumber,
                selgitus: selgitus,
                toimiku_nr: '', // Empty for now
                toimik_vn_jargi: toimikVnJargi, // FROM DATABASE LOOKUP
                toimik_mk_jargi: toimikMkJargi, // EXTRACTED FROM SELGITUS
                maksja_ik_jargi: maksjaIkJargi, // FROM DATABASE LOOKUP
                makse_summa: makseSumma,
                jaak_peale_maksmist: '' // Empty for now
            };

            console.log("Transformed row with lookups:", transformed);
            return transformed;

        } catch (error) {
            console.error("Error transforming Konto vv row:", error, rawRow);
            return {
                column1: '',
                viitenumber: '',
                selgitus: '',
                toimiku_nr: '',
                toimik_vn_jargi: '',
                toimik_mk_jargi: '',
                maksja_ik_jargi: '',
                makse_summa: '',
                jaak_peale_maksmist: ''
            };
        }
    },

    /**
     * Extract {nr}/{nr}/{nr} pattern from Selgitus field
     */
    extractToimikPattern(selgitus) {
        if (!selgitus) return '';

        try {
            // Look for pattern like 111/1111/111
            const pattern = /(\d+\/\d+\/\d+)/;
            const match = selgitus.match(pattern);
            return match ? match[1] : '';
        } catch (error) {
            console.error("Error extracting toimik pattern:", error);
            return '';
        }
    },

    /**
     * Parse numeric value safely
     */
    parseNumericValue(value) {
        if (!value) return '';

        try {
            // Remove any non-numeric characters except dots and commas
            const cleaned = value.toString().replace(/[^\d.,-]/g, '');
            // Replace comma with dot for decimal separator
            const normalized = cleaned.replace(',', '.');
            const parsed = parseFloat(normalized);
            return isNaN(parsed) ? '' : parsed;
        } catch (error) {
            console.error("Error parsing numeric value:", error);
            return '';
        }
    },

    /**
     * Update loading progress indicator
     */
    updateLoadingProgress() {
        const progress = (this.state.processedFolders / this.state.totalFolders) * 100;
        this.state.loadingProgress = progress;

        // Update progress bar if visible
        const progressBar = $('#koondaja-progress-fill');
        if (progressBar.length > 0) {
            progressBar.css('width', `${progress}%`);
        }
    },

    /**
     * Force grid update with current data
     */
    forceGridUpdate() {
        try {
            console.log("=== FORCE GRID UPDATE ===");
            console.log(`Grid API available: ${!!this.state.gridApi}`);
            console.log(`Data to display: ${this.state.currentData.length} rows`);

            if (this.state.currentData.length > 0) {
                console.log("Sample data to display:", this.state.currentData.slice(0, 2));
            }

            if (this.state.gridApi) {
                // Set the row data
                this.state.gridApi.setRowData(this.state.currentData);

                // Force a refresh
                this.state.gridApi.refreshCells();

                // Optional: Size columns to fit only if user wants it
                // setTimeout(() => {
                //     this.state.gridApi.sizeColumnsToFit();
                // }, 100);

                this.updateRowCount();

                console.log(`Grid updated with ${this.state.currentData.length} rows`);
                console.log(`Displayed row count: ${this.state.gridApi.getDisplayedRowCount()}`);

                if (this.state.currentData.length > 0) {
                    this.hideEmptyState();
                } else {
                    this.showEmptyState();
                }
            } else {
                console.error("Grid API not available - attempting recovery...");

                // Try to find and reinitialize the grid
                const gridContainer = document.querySelector('#koondaja-ag-grid');
                if (gridContainer && gridContainer.offsetHeight > 0) {
                    console.log("Grid container found, attempting reinitialize...");

                    // Clear the container and reinitialize
                    gridContainer.innerHTML = '';

                    setTimeout(() => {
                        this.initializeGrid();

                        // Try to update again after reinitialization
                        setTimeout(() => {
                            if (this.state.gridApi && this.state.currentData.length > 0) {
                                console.log("Retrying grid update after reinitialize...");
                                this.state.gridApi.setRowData(this.state.currentData);
                                this.updateRowCount();
                                this.hideEmptyState();
                            }
                        }, 300);
                    }, 100);
                } else {
                    console.error("Grid container not available for reinitialization");
                }
            }
        } catch (error) {
            console.error("Error updating Koondaja grid:", error);
        }
    },

    /**
     * Update row count display
     */
    updateRowCount() {
        try {
            if (this.state.gridApi) {
                const totalRows = this.state.gridApi.getDisplayedRowCount();
                const selectedRows = this.state.gridApi.getSelectedRows().length;

                let text = `${totalRows} rida`;
                if (selectedRows > 0) {
                    text += ` (${selectedRows} valitud)`;
                }

                $("#koondaja-row-count").text(text);
            }
        } catch (error) {
            console.error("Error updating row count:", error);
        }
    },

    /**
     * Auto-size all columns
     */
    autoSizeAllColumns() {
        if (this.state.gridApi) {
            console.log("Auto-sizing all columns");
            this.state.gridApi.autoSizeAllColumns();
        }
    },

    /**
     * Fit columns to width (but allow horizontal scroll if needed)
     */
    fitColumnsToWidth() {
        if (this.state.gridApi) {
            console.log("Fitting columns to container width");
            this.state.gridApi.sizeColumnsToFit();
        }
    },

    /**
     * Reset columns to default width
     */
    resetColumnWidths() {
        if (this.state.gridApi) {
            console.log("Resetting columns to default widths");
            // Reset each column to its default width
            const columnDefs = this.state.gridApi.getColumnDefs();
            columnDefs.forEach(colDef => {
                if (colDef.width) {
                    delete colDef.width;
                }
            });
            this.state.gridApi.setColumnDefs(columnDefs);
        }
    },

    /**
     * Export data to CSV
     */
    exportCSV() {
        if (this.state.gridApi) {
            const params = {
                fileName: `koondaja_export_${new Date().toISOString().split('T')[0]}.csv`,
                columnSeparator: ';'
            };
            this.state.gridApi.exportDataAsCsv(params);
        }
    },

    /**
     * Show/hide empty state
     */
    showEmptyState() {
        $("#koondaja-empty-state").removeClass("hidden");
    },

    hideEmptyState() {
        $("#koondaja-empty-state").addClass("hidden");
    },

    /**
     * Loading state management
     */
    setLoading(loading) {
        this.state.isLoading = loading;
        const toolbar = $("#koondaja-toolbar");

        if (loading) {
            toolbar.addClass("opacity-50 pointer-events-none");
            this.showLoadingOverlay();
        } else {
            toolbar.removeClass("opacity-50 pointer-events-none");
            this.hideLoadingOverlay();
        }
    },

    showLoadingOverlay() {
        const gridContainer = $("#koondaja-ag-grid");
        if (gridContainer.find('.koondaja-loading-overlay').length === 0) {
            const overlay = $(`
                <div class="koondaja-loading-overlay">
                    <i class="fas fa-spinner fa-spin"></i>
                    <div class="text-lg font-medium text-gray-700 dark:text-gray-300">
                        Laadin andmeid...
                    </div>
                    <div class="koondaja-progress-container">
                        <div class="koondaja-progress-bar">
                            <div id="koondaja-progress-fill" class="koondaja-progress-fill"></div>
                        </div>
                        <div class="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                            ${this.state.processedFolders} / ${this.state.totalFolders} kausta töödeldud
                        </div>
                    </div>
                </div>
            `);
            gridContainer.append(overlay);
        }
    },

    hideLoadingOverlay() {
        $("#koondaja-ag-grid .koondaja-loading-overlay").remove();
    },

    /**
     * Utility: Make API call
     */
    async makeAPICall(url, options = {}) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {'Content-Type': 'application/json', ...options.headers}
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("API call error:", error);
            throw error;
        }
    },

    /**
     * Show success message
     */
    showSuccess(message) {
        console.log("Success:", message);
        // TODO: Implement toast notification or similar UI feedback
        alert(message);
    },

    /**
     * Show error message
     */
    showError(message) {
        console.error("Error:", message);
        // TODO: Implement toast notification or similar UI feedback
        alert(message);
    },

    /**
     * Debug function - call from console: KoondajaModule.debugData()
     */
    debugData() {
        console.log("=== KOONDAJA DEBUG DATA ===");
        console.log("Module state:", this.state);
        console.log("Current data length:", this.state.currentData.length);
        console.log("Grid API available:", !!this.state.gridApi);

        console.log("Lookup data cache:");
        console.log("- Viitenumber lookups:", Object.keys(this.state.lookupData.viitenumber_lookup).length);
        console.log("- Isikukood lookups:", Object.keys(this.state.lookupData.isikukood_lookup).length);

        if (Object.keys(this.state.lookupData.viitenumber_lookup).length > 0) {
            console.log("Sample viitenumber lookups:",
                Object.entries(this.state.lookupData.viitenumber_lookup).slice(0, 3));
        }

        if (Object.keys(this.state.lookupData.isikukood_lookup).length > 0) {
            console.log("Sample isikukood lookups:",
                Object.entries(this.state.lookupData.isikukood_lookup).slice(0, 3));
        }

        if (this.state.currentData.length > 0) {
            console.log("First 3 data rows:", this.state.currentData.slice(0, 3));
        }

        if (this.state.gridApi) {
            console.log("Grid displayed rows:", this.state.gridApi.getDisplayedRowCount());
            console.log("Grid column defs:", this.state.gridApi.getColumnDefs());
        }

        console.log("Column definitions:", this.columnDefs);
        console.log("===========================");

        // Try to force a grid update
        if (this.state.gridApi && this.state.currentData.length > 0) {
            console.log("Forcing grid update with current data...");
            this.forceGridUpdate();
        }
    }
};

// Make module globally available for debugging
window.KoondajaModule = KoondajaModule;

// Initialize module when DOM is ready
$(document).ready(function() {
    if (typeof agGrid !== 'undefined') {
        KoondajaModule.init();
    } else {
        console.error("AG-Grid not loaded. Koondaja module cannot initialize.");
    }
});