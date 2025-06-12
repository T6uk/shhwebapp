/**
 * Toimikuleidja Module
 * Handles search functionality for finding cases (toimikud)
 * File: /static/js/toimikuleidja.js
 * Dependencies: koondaja-shared.js
 */

(function(window) {
    'use strict';

    // Check if shared module is loaded
    if (!window.KoondajaShared) {
        console.error('KoondajaShared module must be loaded before Toimikuleidja');
        return;
    }

    const { StateManager, Utils } = window.KoondajaShared;

    // ===========================
    // MODULE STATE
    // ===========================

    const ToimikuleidjaState = {
        toimikuleidjaData: [],
        selectedKoondajaRow: null,
        selectedKoondajaRowIndex: -1
    };

    // ===========================
    // MODAL MANAGEMENT
    // ===========================

    const ModalManager = {
        /**
         * Open Toimikuleidja modal
         */
        openModal() {
            const gridApi = StateManager.getGridApi();
            const koondajaData = StateManager.getKoondajaData();

            if (!gridApi || !koondajaData || koondajaData.length === 0) {
                Utils.showNotification('Koondaja andmeid pole laetud', 'warning');
                return;
            }

            const selectedRows = gridApi.getSelectedRows();
            ToimikuleidjaState.selectedKoondajaRow = selectedRows.length > 0 ? selectedRows[0] : null;

            // Store the row index for easier updating later
            if (ToimikuleidjaState.selectedKoondajaRow) {
                ToimikuleidjaState.selectedKoondajaRowIndex = Utils.findRowIndex(
                    ToimikuleidjaState.selectedKoondajaRow,
                    koondajaData
                );
            } else {
                ToimikuleidjaState.selectedKoondajaRowIndex = -1;
            }

            // Show modal
            $('#toimikuleidja-modal').removeClass('hidden');

            // Prefill fields
            this.prefillSearchFields();

            // Reset states
            this.resetModalStates();

            // Auto-search if we have selection with valid registrikood
            if (ToimikuleidjaState.selectedKoondajaRow && ToimikuleidjaState.selectedKoondajaRow.isiku_registrikood) {
                setTimeout(() => SearchManager.searchToimikud(), 300);
            }
        },

        /**
         * Close Toimikuleidja modal
         */
        closeModal() {
            $('#toimikuleidja-modal').addClass('hidden');
            SearchManager.clearSearchResults();
            ToimikuleidjaState.selectedKoondajaRow = null;
            ToimikuleidjaState.selectedKoondajaRowIndex = -1;
        },

        /**
         * Prefill search fields based on selected row
         */
        prefillSearchFields() {
            let otsingValue = '';
            let selgitusValue = '';

            if (ToimikuleidjaState.selectedKoondajaRow) {
                // Prefill "Otsing" with "Isiku- või registrikood" - this is what we search by
                otsingValue = ToimikuleidjaState.selectedKoondajaRow.isiku_registrikood || '';

                // Prefill "Selgitus" with "Toimiku nr selgituses" - just for reference/display
                selgitusValue = ToimikuleidjaState.selectedKoondajaRow.toimiku_nr_selgituses || '';

                // Show which row is selected
                const identifier = ToimikuleidjaState.selectedKoondajaRow.toimiku_nr_loplik ||
                    ToimikuleidjaState.selectedKoondajaRow.dokumendi_nr ||
                    `Rida ${ToimikuleidjaState.selectedKoondajaRowIndex + 1}`;

                console.log(`Toimikuleidja opened for row: ${identifier}`);
            }

            $('#toimikuleidja-otsing').val(otsingValue);
            $('#toimikuleidja-selgitus').val(selgitusValue);
        },

        /**
         * Reset modal states
         */
        resetModalStates() {
            $('#toimikuleidja-loading').addClass('hidden');
            $('#toimikuleidja-empty').addClass('hidden');
            $('#toimikuleidja-initial').removeClass('hidden');
            $('#toimikuleidja-table-container').removeClass('hidden');
            $('#toimikuleidja-result-count').text('0 tulemust');
        }
    };

    // ===========================
    // SEARCH MANAGEMENT
    // ===========================

    const SearchManager = {
        /**
         * Search for toimikud
         */
        searchToimikud() {
            const searchValue = $('#toimikuleidja-otsing').val().trim(); // võlgniku_kood
            // Note: selgitus field is just for display/reference, not used in search

            if (!searchValue) {
                Utils.showNotification('Sisestage isiku- või registrikood', 'warning');
                return;
            }

            // Show loading state
            this.showLoadingState();

            // Make API call - only send search_value (võlgniku_kood)
            $.ajax({
                url: '/api/v1/koondaja/search-toimikud',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    search_value: searchValue
                    // selgitus_value is not sent - it's just for reference
                }),
                success: (response) => {
                    this.hideLoadingState();

                    if (response.success && response.data) {
                        ToimikuleidjaState.toimikuleidjaData = response.data;
                        ResultsManager.displaySearchResults();

                        const count = response.data.length;
                        $('#toimikuleidja-result-count').text(`${count} tulemust`);

                        if (count === 0) {
                            this.showEmptyState();
                        } else {
                            // Update message to show what we searched for
                            const searchInfo = `Leitud ${count} toimikut isiku/ettevõtte koodile: ${searchValue}`;
                            console.log(searchInfo);
                        }
                    } else {
                        this.showEmptyState();
                        Utils.showNotification('Toimikuid ei leitud', 'info');
                    }
                },
                error: (xhr) => {
                    this.hideLoadingState();
                    this.showEmptyState();

                    const errorMsg = xhr.responseJSON?.detail || 'Otsingu viga';
                    Utils.showNotification(errorMsg, 'error');
                    console.error('Toimikuleidja search error:', xhr);
                }
            });
        },

        /**
         * Show loading state
         */
        showLoadingState() {
            $('#toimikuleidja-initial').addClass('hidden');
            $('#toimikuleidja-empty').addClass('hidden');
            $('#toimikuleidja-loading').removeClass('hidden');
            $('#toimikuleidja-table-container').addClass('hidden');
        },

        /**
         * Hide loading state
         */
        hideLoadingState() {
            $('#toimikuleidja-loading').addClass('hidden');
            $('#toimikuleidja-table-container').removeClass('hidden');
        },

        /**
         * Show empty state
         */
        showEmptyState() {
            $('#toimikuleidja-initial').addClass('hidden');
            $('#toimikuleidja-empty').removeClass('hidden');
            $('#toimikuleidja-table-container').addClass('hidden');
        },

        /**
         * Clear search results
         */
        clearSearchResults() {
            $('#toimikuleidja-table-body').empty();
            ToimikuleidjaState.toimikuleidjaData = [];
            ModalManager.resetModalStates();
        }
    };

    // ===========================
    // RESULTS MANAGEMENT
    // ===========================

    const ResultsManager = {
        /**
         * Display search results in table
         */
        displaySearchResults() {
            const tbody = $('#toimikuleidja-table-body');
            tbody.empty();

            if (!ToimikuleidjaState.toimikuleidjaData || ToimikuleidjaState.toimikuleidjaData.length === 0) {
                SearchManager.showEmptyState();
                return;
            }

            ToimikuleidjaState.toimikuleidjaData.forEach((row, index) => {
                const tr = this.createTableRow(row, index);
                tbody.append(tr);
            });

            $('#toimikuleidja-initial').addClass('hidden');
            $('#toimikuleidja-empty').addClass('hidden');
        },

        /**
         * Create table row for search result
         */
        createTableRow(rowData, index) {
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
                        ${Utils.escapeHtml(rowData.toimiku_nr || '')}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        ${Utils.escapeHtml(rowData.võlgnik || '')}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        ${Utils.escapeHtml(sissenõudja)}
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
            tr.find('.toimiku-select-btn').click((e) => {
                e.stopPropagation();
                SelectionManager.selectToimik(index);
            });

            // Double-click on row also selects
            tr.dblclick(() => {
                SelectionManager.selectToimik(index);
            });

            // Single click highlights row
            tr.click(function() {
                // Remove highlight from other rows
                $('#toimikuleidja-table-body tr').removeClass('bg-blue-50 dark:bg-blue-900');
                // Highlight this row
                $(this).addClass('bg-blue-50 dark:bg-blue-900');
            });

            return tr;
        }
    };

    // ===========================
    // SELECTION MANAGEMENT
    // ===========================

    const SelectionManager = {
        /**
         * Select a toimik and update the Koondaja row
         */
        selectToimik(index) {
            if (!ToimikuleidjaState.toimikuleidjaData[index]) {
                Utils.showNotification('Valitud toimikut ei leitud', 'error');
                return;
            }

            const selectedToimik = ToimikuleidjaState.toimikuleidjaData[index];

            // Update the Koondaja row if we have a selected row
            if (ToimikuleidjaState.selectedKoondajaRow && StateManager.getGridApi() && ToimikuleidjaState.selectedKoondajaRowIndex >= 0) {
                this.updateKoondajaRow(selectedToimik);
            } else {
                // No selected row, just show info
                Utils.showNotification(`Toimik ${selectedToimik.toimiku_nr} valitud`, 'info');
                console.log('No Koondaja row selected for update');
            }

            // Close modal
            ModalManager.closeModal();
        },

        /**
         * Update the selected Koondaja row with toimik data
         */
        updateKoondajaRow(selectedToimik) {
            const koondajaData = StateManager.getKoondajaData();
            const gridApi = StateManager.getGridApi();

            // Verify the row still exists
            if (ToimikuleidjaState.selectedKoondajaRowIndex >= koondajaData.length) {
                Utils.showNotification('Valitud rida pole enam olemas', 'error');
                ModalManager.closeModal();
                return;
            }

            // Update the row data with new toimik information
            const updatedRow = koondajaData[ToimikuleidjaState.selectedKoondajaRowIndex];

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
            koondajaData[ToimikuleidjaState.selectedKoondajaRowIndex] = updatedRow;
            StateManager.setKoondajaData(koondajaData);

            // Refresh the grid to show changes
            this.updateGridAndHighlightRow();

            // Show success message
            const changeMessage = originalToimikuNr !== selectedToimik.toimiku_nr
                ? `Toimik muudetud: ${originalToimikuNr || 'tühi'} → ${selectedToimik.toimiku_nr}`
                : `Toimik ${selectedToimik.toimiku_nr} valitud ja andmed uuendatud`;

            Utils.showNotification(changeMessage, 'success');

            // Log the update for debugging
            console.log(`Koondaja row ${ToimikuleidjaState.selectedKoondajaRowIndex + 1} updated with toimik:`, {
                toimiku_nr: selectedToimik.toimiku_nr,
                võlgnik: selectedToimik.võlgnik,
                võla_jääk: selectedToimik.võla_jääk
            });
        },

        /**
         * Update grid and highlight the updated row
         */
        updateGridAndHighlightRow() {
            const gridApi = StateManager.getGridApi();

            // Update the grid data
            gridApi.setRowData(StateManager.getKoondajaData());

            // Highlight the updated row
            setTimeout(() => {
                if (gridApi) {
                    const rowNode = gridApi.getRowNode(ToimikuleidjaState.selectedKoondajaRowIndex);
                    if (rowNode) {
                        // Flash the updated row
                        gridApi.flashCells({
                            rowNodes: [rowNode],
                            fadeDelay: 1500
                        });

                        // Ensure the row is visible
                        gridApi.ensureIndexVisible(ToimikuleidjaState.selectedKoondajaRowIndex);

                        // Keep the row selected
                        gridApi.deselectAll();
                        rowNode.setSelected(true);
                    }
                }
            }, 100);

            // Trigger data change events
            StateManager.triggerDataChanged();
        }
    };

    // ===========================
    // BUTTON STATE MANAGEMENT
    // ===========================

    const ButtonStateManager = {
        /**
         * Update Toimikuleidja button state based on selection
         */
        updateButtonState() {
            const gridApi = StateManager.getGridApi();
            if (!gridApi) {
                $('#toimikuleidja-btn').prop('disabled', true);
                return;
            }

            const selectedRows = gridApi.getSelectedRows();
            const hasSelection = selectedRows.length > 0;
            const hasData = StateManager.getKoondajaData() && StateManager.getKoondajaData().length > 0;

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
    };

    // ===========================
    // INITIALIZATION
    // ===========================

    const Toimikuleidja = {
        /**
         * Initialize the Toimikuleidja module
         */
        init() {
            this.setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        setupEventHandlers() {
            // Modal handlers
            $('#toimikuleidja-btn').click(() => ModalManager.openModal());
            $('#close-toimikuleidja-modal, #toimikuleidja-backdrop, #close-toimikuleidja-btn').click(() => ModalManager.closeModal());
            $('#toimikuleidja-search-btn').click(() => SearchManager.searchToimikud());

            // Enter key support for search fields
            $('#toimikuleidja-otsing, #toimikuleidja-selgitus').keypress((e) => {
                if (e.which === 13) { // Enter key
                    SearchManager.searchToimikud();
                }
            });

            // Update button state based on Koondaja selection
            $(document).on('koondajaSelectionChanged', () => {
                ButtonStateManager.updateButtonState();
            });

            // Update button states when data changes
            $(document).on('koondajaDataChanged', () => {
                ButtonStateManager.updateButtonState();
            });

            // Initial button state setup
            ButtonStateManager.updateButtonState();
        },

        // Public API
        open: () => ModalManager.openModal(),
        close: () => ModalManager.closeModal(),
        search: () => SearchManager.searchToimikud(),
        getSelectedRow: () => ({
            row: ToimikuleidjaState.selectedKoondajaRow,
            index: ToimikuleidjaState.selectedKoondajaRowIndex
        }),
        updateSelectedRow: (toimikData) => {
            if (ToimikuleidjaState.selectedKoondajaRowIndex >= 0 && toimikData) {
                const index = ToimikuleidjaState.toimikuleidjaData.findIndex(row =>
                    row.toimiku_nr === toimikData.toimiku_nr
                );
                if (index >= 0) {
                    SelectionManager.selectToimik(index);
                }
            }
        }
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Initialize when DOM is ready
    $(document).ready(() => {
        Toimikuleidja.init();
    });

    // Export to window
    window.Toimikuleidja = Toimikuleidja;

})(window);