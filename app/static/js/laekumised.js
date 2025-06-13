/**
 * Laekumised Module
 * Handles payment processing modal for Koondaja data
 * File: /static/js/laekumised.js
 * Dependencies: koondaja-shared.js
 */

(function (window) {
    'use strict';

    // Check if shared module is loaded
    if (!window.KoondajaShared) {
        console.error('KoondajaShared module must be loaded before Laekumised');
        return;
    }

    const {StateManager, Utils} = window.KoondajaShared;

    // ===========================
    // STATE MANAGEMENT
    // ===========================

    const LaekumisedState = {
        validRows: [],           // Rows with valid toimiku numbers
        currentIndex: 0,         // Current row being processed
        isProcessing: false,     // Processing state
        databaseCache: {},       // Cache for database lookups
        distributionMethod: 'proportional', // Default distribution method
        elatusMinimum: 0,        // Elatus minimum amount
        ulalpeetavad: 0          // Number of dependents
    };

    // ===========================
    // MODAL MANAGEMENT
    // ===========================

    const ModalManager = {
        /**
         * Initialize the Laekumised modal
         */
        init() {
            this.setupEventHandlers();
        },

        /**
         * Setup event handlers
         */
        setupEventHandlers() {
            // Button handlers
            $('#laekumised-btn').click(() => this.openModal());
            $('#close-laekumised-modal, #laekumised-backdrop').click(() => this.closeModal());

            // Navigation handlers
            $('#laekumised-ok-btn').click(() => this.nextPerson());
            $('#laekumised-skip-btn').click(() => this.nextPerson());

            // Form handlers
            $('input[name="distribution-method"]').change((e) => {
                LaekumisedState.distributionMethod = e.target.value;
                this.updateDistributionMethod();
            });

            $('#elatus-miinimum-select').change((e) => {
                LaekumisedState.elatusMinimum = parseInt(e.target.value) || 0;
                this.updateRemainingAmount();
            });

            $('#ulalpeetavad-select').change((e) => {
                LaekumisedState.ulalpeetavad = parseInt(e.target.value) || 0;
                this.updateRemainingAmount();
            });

            $('#koik-tagasi-btn').click(() => this.resetToOriginalAmount());

            // ESC key to close modal
            $(document).keydown((e) => {
                if (e.key === 'Escape' && !$('#laekumised-modal').hasClass('hidden')) {
                    this.closeModal();
                }
            });
        },

        /**
         * Open the Laekumised modal - ENHANCED
         */
        async openModal() {
            console.log('Opening Laekumised modal...');

            const koondajaData = StateManager.getKoondajaData();
            console.log('Koondaja data:', koondajaData);

            if (!koondajaData || koondajaData.length === 0) {
                Utils.showNotification('Andmeid pole laetud - lae esmalt koondaja andmed', 'warning');
                return;
            }

            // Filter rows with valid toimiku numbers - ENHANCED LOGGING
            LaekumisedState.validRows = koondajaData.filter(row => {
                const hasValidToimiku = row.toimiku_nr_loplik && row.toimiku_nr_loplik.trim() !== '';
                if (!hasValidToimiku) {
                    console.log('Row without valid toimiku:', {
                        toimiku_nr_loplik: row.toimiku_nr_loplik,
                        toimiku_nr_selgituses: row.toimiku_nr_selgituses,
                        viitenumber: row.viitenumber,
                        nimi_baasis: row.nimi_baasis
                    });
                }
                return hasValidToimiku;
            });

            console.log(`Found ${LaekumisedState.validRows.length} valid rows out of ${koondajaData.length} total rows`);

            if (LaekumisedState.validRows.length === 0) {
                console.warn('No valid rows found');

                // Show debug info about why no rows are valid
                const debugInfo = koondajaData.slice(0, 5).map(row => ({
                    toimiku_nr_loplik: row.toimiku_nr_loplik,
                    toimiku_nr_selgituses: row.toimiku_nr_selgituses,
                    has_valid_toimiku: row.has_valid_toimiku,
                    match_source: row.match_source
                }));

                console.log('Sample rows debug info:', debugInfo);

                Utils.showNotification(
                    `Ei leitud ridu kehtivate toimiku numbritega. Laetud ${koondajaData.length} rida, kuid ükski ei oma kehtivat toimiku numbrit.`,
                    'warning'
                );
                return;
            }

            LaekumisedState.currentIndex = 0;
            LaekumisedState.isProcessing = true;

            // Show modal
            $('#laekumised-modal').removeClass('hidden');
            $('body').addClass('overflow-hidden');

            // Load data for the first person
            await this.loadPersonData();
        },

        /**
         * Close the modal
         */
        closeModal() {
            $('#laekumised-modal').addClass('hidden');
            $('body').removeClass('overflow-hidden');
            LaekumisedState.isProcessing = false;
        },

        /**
         * Navigate to next person
         */
        async nextPerson() {
            if (LaekumisedState.currentIndex < LaekumisedState.validRows.length - 1) {
                LaekumisedState.currentIndex++;
                await this.loadPersonData();
            } else {
                // All persons processed
                Utils.showNotification('Kõik isikud töödeldud', 'success');
                this.closeModal();
            }
        },

        /**
         * Load person data for current index - ENHANCED
         */
        async loadPersonData() {
            if (LaekumisedState.currentIndex >= LaekumisedState.validRows.length) {
                console.error('Current index exceeds valid rows length');
                return;
            }

            const currentRow = LaekumisedState.validRows[LaekumisedState.currentIndex];
            const totalCount = LaekumisedState.validRows.length;
            const currentPosition = LaekumisedState.currentIndex + 1;

            console.log(`Loading person data for index ${LaekumisedState.currentIndex}:`, {
                toimiku_nr_loplik: currentRow.toimiku_nr_loplik,
                nimi_baasis: currentRow.nimi_baasis,
                position: `${currentPosition}/${totalCount}`
            });

            // Update counter in header
            $('#laekumised-person-counter').text(`${currentPosition} / ${totalCount}`);

            // Show loading
            $('#laekumised-loading').removeClass('hidden');
            $('#laekumised-content').addClass('opacity-50');

            try {
                // Get additional database info
                const dbData = await DataManager.fetchPersonData(currentRow.toimiku_nr_loplik);
                console.log('Database data received:', dbData);

                // Update UI with person data
                this.updatePersonDisplay(currentRow, dbData);

                // Reset form to defaults
                this.resetForm();

            } catch (error) {
                console.error('Error loading person data:', error);
                Utils.showNotification(`Viga isiku andmete laadimisel: ${error.message || error}`, 'error');

                // Show basic data even if database lookup fails
                this.updatePersonDisplay(currentRow, {});
            } finally {
                $('#laekumised-loading').addClass('hidden');
                $('#laekumised-content').removeClass('opacity-50');
            }
        },

        /**
         * Update person display with data
         */
        updatePersonDisplay(koondajaRow, dbData) {
            // Section 1: Basic info
            $('#laekumised-toimik').text(koondajaRow.toimiku_nr_loplik || '');
            $('#laekumised-volgnik').text(koondajaRow.nimi_baasis || '');

            // Combine sissenõudja name from database
            const sissenoudjaName = this.buildSissenoudjaName(dbData);
            $('#laekumised-sissenoudja').text(sissenoudjaName);

            $('#laekumised-asja-liik').text(dbData.asjas_sonades || '');
            $('#laekumised-noude-sisu').text(dbData.noude_sisu || koondajaRow.noude_sisu || '');
            $('#laekumised-staatus').text(dbData.staatus || koondajaRow.staatus_baasis || '');
            $('#laekumised-markused').text(dbData.markused || koondajaRow.toimiku_markused || '');

            // Section 2: Financial breakdown
            this.updateFinancialBreakdown(koondajaRow, dbData);

            // Section 4: Payment total
            const laekumisedKokku = koondajaRow.laekumised_kokku || koondajaRow.summa || '0,00';
            $('#laekumised-kokku-summa').text(this.formatEstonianCurrency(laekumisedKokku));

            // Section 6: Case details
            $('#laekumised-case-noude-sisu').text(dbData.noude_sisu || koondajaRow.noude_sisu || '');

            const menetluseKpv = dbData.menetluse_alg_kpv ?
                this.formatEstonianDate(dbData.menetluse_alg_kpv) : '';
            $('#laekumised-case-menetluse-kpv').text(menetluseKpv);

            // Update remaining amount calculation
            this.updateRemainingAmount();
        },

        /**
         * Update financial breakdown section
         */
        updateFinancialBreakdown(koondajaRow, dbData) {
            // Get values from database
            const noudeSuurus = this.parseEstonianNumber(dbData.noude_suurus || 0);
            const volaJaak = this.parseEstonianNumber(dbData.vola_jaak || 0);
            const tmAlustTasu = this.parseEstonianNumber(dbData.tm_alust_tasu_koos_km || 0);
            const lisatasu = this.parseEstonianNumber(dbData.lisatasu_koos_km || 0);
            const taituritasu = this.parseEstonianNumber(dbData.taituritasu_suurus || 0);
            const tasuJaTaitekulu = this.parseEstonianNumber(dbData.tasu_ja_taitekulu_jaak || 0);

            // Get payment amount from koondaja
            const laekumisedKokku = this.parseEstonianNumber(koondajaRow.laekumised_kokku || koondajaRow.summa || 0);

            // Calculate Põhinõue (Principal claim)
            const pohiNoueAlgne = noudeSuurus;
            const pohiNoueJaak = volaJaak;
            const pohiNoueLaekumine = laekumisedKokku; // This would be calculated based on distribution
            const pohiNouePercent = pohiNoueAlgne > 0 ? ((pohiNoueLaekumine / pohiNoueAlgne) * 100).toFixed(1) : '0.0';

            // Calculate Tasu ja täitekulu (Fee and execution costs)
            const tasuAlgne = tmAlustTasu + lisatasu + taituritasu;
            const tasuJaak = tasuJaTaitekulu;
            const tasuLaekumine = 0; // This would be calculated based on distribution
            const tasuPercent = tasuAlgne > 0 ? ((tasuLaekumine / tasuAlgne) * 100).toFixed(1) : '0.0';

            // Calculate Kokku (Total)
            const kokkuAlgne = pohiNoueAlgne + tasuAlgne;
            const kokkuLaekumine = pohiNoueLaekumine + tasuLaekumine;
            const kokkuJaak = kokkuAlgne - kokkuLaekumine;
            const kokkuPercent = kokkuAlgne > 0 ? ((kokkuLaekumine / kokkuAlgne) * 100).toFixed(1) : '0.0';

            // Update Põhinõue section
            $('#pohi-noue-algne').text(this.formatEstonianCurrency(pohiNoueAlgne));
            $('#pohi-noue-laekumine').text(`${this.formatEstonianCurrency(pohiNoueLaekumine)} (${pohiNouePercent}%)`);
            $('#pohi-noue-jaak').text(this.formatEstonianCurrency(pohiNoueJaak));

            // Update Tasu ja täitekulu section
            $('#tasu-algne').text(this.formatEstonianCurrency(tasuAlgne));
            $('#tasu-alustamistasu').text(this.formatEstonianCurrency(tmAlustTasu));
            $('#tasu-laekumine').text(`${this.formatEstonianCurrency(tasuLaekumine)} (${tasuPercent}%)`);
            $('#tasu-jaak').text(this.formatEstonianCurrency(tasuJaak));

            // Update Kokku section
            $('#kokku-algne').text(this.formatEstonianCurrency(kokkuAlgne));
            $('#kokku-laekumine').text(`${this.formatEstonianCurrency(kokkuLaekumine)} (${kokkuPercent}%)`);
            $('#kokku-jaak').text(this.formatEstonianCurrency(kokkuJaak));

            // Update additional date fields
            $('#avalduse-laekumise-kpv').text(this.formatEstonianDate(dbData.avalduse_laekumise_kpv));
            $('#menetluse-alg-kpv').text(this.formatEstonianDate(dbData.menetluse_alg_kpv));
            $('#vanem-laps-18').text(this.formatEstonianDate(dbData.vanem_laps_18_kpv));
            $('#vabatahtlik-taitmise-aeg').text(this.formatEstonianDate(dbData.vabatahtlikku_taimise_lopp_kpv));
            $('#pool-tasust').text(this.formatEstonianCurrency(dbData.pool_tasust));
            $('#kpv-laekunud-summa').text(this.formatEstonianCurrency(laekumisedKokku));
        },

        /**
         * Build sissenõudja display name
         */
        buildSissenoudjaName(dbData) {
            const parts = [];

            if (dbData.sissenoudja_eesnimi) {
                parts.push(dbData.sissenoudja_eesnimi);
            }
            if (dbData.sissenoudja_perenimi) {
                parts.push(dbData.sissenoudja_perenimi);
            }
            if (dbData.sissenoudja_kood) {
                parts.push(`(${dbData.sissenoudja_kood})`);
            }

            return parts.join(' ') || '';
        },

        /**
         * Reset form to default values
         */
        resetForm() {
            // Reset radio buttons to proportional
            $('input[name="distribution-method"][value="proportional"]').prop('checked', true);
            LaekumisedState.distributionMethod = 'proportional';

            // Reset dropdowns
            $('#elatus-miinimum-select').val('0');
            $('#ulalpeetavad-select').val('0');
            LaekumisedState.elatusMinimum = 0;
            LaekumisedState.ulalpeetavad = 0;

            this.updateRemainingAmount();
        },

        /**
         * Update distribution method handling
         */
        updateDistributionMethod() {
            // Add visual feedback for selected method
            const selectedMethod = LaekumisedState.distributionMethod;
            console.log(`Distribution method changed to: ${selectedMethod}`);

            // Future implementation: enable/disable other controls based on method
        },

        /**
         * Reset to original payment amount
         */
        resetToOriginalAmount() {
            $('#elatus-miinimum-select').val('0');
            $('#ulalpeetavad-select').val('0');
            LaekumisedState.elatusMinimum = 0;
            LaekumisedState.ulalpeetavad = 0;

            this.updateRemainingAmount();
            Utils.showNotification('Tagasi algse summa juurde', 'info');
        },

        /**
         * Update remaining amount calculation
         */
        updateRemainingAmount() {
            if (LaekumisedState.currentIndex >= LaekumisedState.validRows.length) {
                return;
            }

            const currentRow = LaekumisedState.validRows[LaekumisedState.currentIndex];
            const originalAmount = this.parseEstonianNumber(currentRow.laekumised_kokku || currentRow.summa || '0');

            // Calculate protected amount
            const baseProtection = LaekumisedState.elatusMinimum;
            const dependentProtection = LaekumisedState.ulalpeetavad * (LaekumisedState.elatusMinimum * 0.3); // 30% per dependent
            const totalProtection = baseProtection + dependentProtection;

            // Calculate remaining amount
            const remainingAmount = Math.max(0, originalAmount - totalProtection);

            $('#remaining-amount').text(this.formatEstonianCurrency(remainingAmount));
        },

        /**
         * Parse Estonian number format
         */
        parseEstonianNumber(value) {
            if (!value) return 0;

            try {
                // Handle Estonian format: "1 234,56" -> 1234.56
                const cleaned = String(value)
                    .replace(/\s+/g, '')  // Remove spaces
                    .replace(',', '.');   // Replace comma with dot

                return parseFloat(cleaned) || 0;
            } catch (error) {
                return 0;
            }
        },

        /**
         * Format currency for Estonian locale (compact version)
         */
        formatEstonianCurrency(value, compact = false) {
            const num = typeof value === 'number' ? value : this.parseEstonianNumber(value);
            const formatted = num.toFixed(2).replace('.', ',');
            return compact ? formatted + '€' : formatted + ' €';
        },

        /**
         * Format date for Estonian locale
         */
        formatEstonianDate(dateStr) {
            if (!dateStr) return '';

            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('et-EE');
            } catch (error) {
                return dateStr;
            }
        }
    };

    // ===========================
    // DATA MANAGEMENT
    // ===========================

    const DataManager = {
        /**
         * Fetch additional person data from database
         */
        async fetchPersonData(toimikuNr) {
            if (!toimikuNr) {
                return {};
            }

            // Check cache first
            if (LaekumisedState.databaseCache[toimikuNr]) {
                return LaekumisedState.databaseCache[toimikuNr];
            }

            try {
                const response = await $.ajax({
                    url: '/api/v1/koondaja/fetch-person-data',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        toimiku_nr: toimikuNr
                    })
                });

                if (response.success && response.data) {
                    // Cache the result
                    LaekumisedState.databaseCache[toimikuNr] = response.data;
                    return response.data;
                }

                return {};

            } catch (error) {
                console.error('Error fetching person data:', error);
                return {};
            }
        }
    };

    // ===========================
    // BUTTON STATE MANAGEMENT
    // ===========================

    const ButtonManager = {
        /**
         * Update button state based on data availability
         */
        updateButtonState() {
            const koondajaData = StateManager.getKoondajaData();
            const hasValidRows = koondajaData && koondajaData.some(row =>
                row.toimiku_nr_loplik && row.toimiku_nr_loplik.trim() !== ''
            );

            const button = $('#laekumised-btn');

            if (hasValidRows) {
                button.prop('disabled', false)
                    .removeClass('opacity-50')
                    .attr('title', 'Ava laekumiste töötlus');
            } else {
                button.prop('disabled', true)
                    .addClass('opacity-50')
                    .attr('title', 'Lae esmalt andmed või kontrolli toimiku numbreid');
            }
        }
    };

    // ===========================
    // INITIALIZATION
    // ===========================

    const Laekumised = {
        /**
         * Initialize the Laekumised module
         */
        init() {
            ModalManager.init();

            // Update button state when data changes
            $(document).on('koondajaDataChanged', () => {
                ButtonManager.updateButtonState();
            });

            // Initial button state update
            ButtonManager.updateButtonState();
        }
    };

    // ===========================
    // EXPORTS
    // ===========================

    // Initialize when DOM is ready
    $(document).ready(() => {
        Laekumised.init();
    });

    // Export to window
    window.Laekumised = Laekumised;

})(window);