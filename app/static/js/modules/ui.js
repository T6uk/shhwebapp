// app/static/js/modules/ui.js
// UI interactions and utilities

(function() {
    // Local references to global state
    const state = window.appState;
    const funcs = window.appFunctions;

    // Set up dropdown toggles
    function setupDropdowns() {
        const dropdowns = [
            {toggle: "#tools-dropdown-toggle", menu: "#tools-dropdown-menu"},
            {toggle: "#widgets-dropdown-toggle", menu: "#widgets-dropdown-menu"},
            {toggle: "#settings-dropdown-toggle", menu: "#settings-dropdown-menu"},
            {toggle: "#links-dropdown-toggle", menu: "#links-dropdown-menu"},
            {toggle: "#filters-dropdown-toggle", menu: "#filters-dropdown-menu"},
            {toggle: "#user-dropdown-toggle", menu: "#user-dropdown-menu"}
        ];

        // Set up each dropdown with toggle behavior
        dropdowns.forEach(dropdown => {
            $(dropdown.toggle).click(function(e) {
                e.stopPropagation();
                $(dropdown.menu).toggleClass("show");

                // Hide other dropdowns
                dropdowns.forEach(other => {
                    if (other.menu !== dropdown.menu) {
                        $(other.menu).removeClass("show");
                    }
                });
            });
        });

        // Close dropdowns when clicking outside
        $(document).click(function() {
            $(".dropdown-menu").removeClass("show");
        });

        // Prevent dropdown closing when clicking inside dropdown
        $(".dropdown-menu").click(function(e) {
            e.stopPropagation();
        });
    }

    // Function to resize the table container
    function resizeTableContainer() {
        const windowHeight = $(window).height();
        const headerHeight = $("#compact-header").outerHeight(true) || 0;
        const toolbarHeight = $("#toolbar-container").is(":visible") ? $("#toolbar-container").outerHeight(true) : 0;
        const filterPanelHeight = $("#filter-panel").hasClass("show") ? $("#filter-panel").outerHeight(true) : 0;

        // Add some breathing room on smaller screens
        const padding = window.innerWidth < 640 ? 16 : 24;

        // Make sure we have a minimum height on larger screens
        let tableHeight = windowHeight - headerHeight - toolbarHeight - filterPanelHeight - padding;

        // Ensure minimum height on mobile
        tableHeight = Math.max(tableHeight, 300);

        // Maximum height for very large screens to prevent excessive space
        if (window.innerHeight > 1200) {
            tableHeight = Math.min(tableHeight, window.innerHeight * 0.7);
        }

        $("#table-container").css("height", tableHeight + "px");

        if ($("#edit-history-panel").is(":visible")) {
            // Adjust based on screen size
            const historyPanelOffset = window.innerWidth < 640 ? 80 : 40;
            $("#table-container").css("height", (tableHeight - historyPanelOffset) + "px");
        }

        // If grid API exists, resize columns to fit
        if (state.gridApi) {
            setTimeout(() => {
                state.gridApi.sizeColumnsToFit();
            }, 50);
        }
    }

    // Show toast notification
    function showToast(title, message, type = "info") {
        // Create toast element
        const toast = $(`
            <div class="toast-notification fixed bottom-4 right-4 p-3 rounded-lg shadow-lg max-w-sm z-50 transform transition-all duration-300 translate-y-20 opacity-0">
                <div class="flex items-start">
                    <div class="toast-icon mr-3 text-lg">
                        ${getToastIcon(type)}
                    </div>
                    <div class="toast-content flex-grow">
                        <h4 class="font-semibold mb-1">${title}</h4>
                        <p class="text-sm">${message}</p>
                    </div>
                    <button class="toast-close p-1 ml-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);

        // Set colors based on type and theme
        applyToastStyle(toast, type);

        // Add to document
        $("body").append(toast);

        // Show with animation
        setTimeout(() => {
            toast.removeClass("translate-y-20 opacity-0");
        }, 10);

        // Set up auto-dismiss
        const dismissTime = type === "error" ? 8000 : 5000;
        const dismissTimeout = setTimeout(() => {
            dismissToast(toast);
        }, dismissTime);

        // Handle close button
        toast.find(".toast-close").click(() => {
            clearTimeout(dismissTimeout);
            dismissToast(toast);
        });

        // Pause dismiss on hover
        toast.hover(
            () => clearTimeout(dismissTimeout),
            () => {
                const newTimeout = setTimeout(() => dismissToast(toast), 2000);
                toast.data('dismiss-timeout', newTimeout);
            }
        );
    }

    // Helper to apply toast styling
    function applyToastStyle(toast, type) {
        const isDark = state.isDarkMode;

        // Reset classes first
        toast.removeClass(
            "bg-blue-100 bg-green-100 bg-red-100 bg-yellow-100 " +
            "bg-blue-900 bg-green-900 bg-red-900 bg-yellow-900 " +
            "text-blue-800 text-green-800 text-red-800 text-yellow-800 " +
            "text-blue-100 text-green-100 text-red-100 text-yellow-100"
        );

        // Apply appropriate classes based on type and theme
        if (type === "info") {
            if (isDark) {
                toast.addClass("bg-blue-900 text-blue-100");
            } else {
                toast.addClass("bg-blue-100 text-blue-800");
            }
        } else if (type === "success") {
            if (isDark) {
                toast.addClass("bg-green-900 text-green-100");
            } else {
                toast.addClass("bg-green-100 text-green-800");
            }
        } else if (type === "error") {
            if (isDark) {
                toast.addClass("bg-red-900 text-red-100");
            } else {
                toast.addClass("bg-red-100 text-red-800");
            }
        } else if (type === "warning") {
            if (isDark) {
                toast.addClass("bg-yellow-900 text-yellow-100");
            } else {
                toast.addClass("bg-yellow-100 text-yellow-800");
            }
        }
    }

    // Helper to dismiss toast with animation
    function dismissToast(toast) {
        toast.addClass("translate-y-20 opacity-0");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    // Helper to get toast icon
    function getToastIcon(type) {
        switch (type) {
            case "info":
                return '<i class="fas fa-info-circle"></i>';
            case "success":
                return '<i class="fas fa-check-circle"></i>';
            case "error":
                return '<i class="fas fa-exclamation-circle"></i>';
            case "warning":
                return '<i class="fas fa-exclamation-triangle"></i>';
            default:
                return '<i class="fas fa-info-circle"></i>';
        }
    }

    // Update toast styles (for dark/light mode changes)
    function updateToastStyles() {
        // Updates any existing toast notifications to use the current theme
        const isDark = state.isDarkMode;

        // Get all toast notifications
        $(".toast-notification").each(function() {
            const $toast = $(this);

            // Get the notification type (info, success, error, warning)
            let type = "info";
            if ($toast.hasClass("bg-green-100") || $toast.hasClass("bg-green-900")) type = "success";
            if ($toast.hasClass("bg-red-100") || $toast.hasClass("bg-red-900")) type = "error";
            if ($toast.hasClass("bg-yellow-100") || $toast.hasClass("bg-yellow-900")) type = "warning";

            // Apply appropriate styling
            applyToastStyle($toast, type);
        });
    }

    // Set up event handlers
    function setupEventHandlers() {
        // Search with debounce
        const debouncedSearch = funcs.debounce(funcs.performSearch, 300);

        $("#search-button").click(funcs.performSearch);
        $("#search-input").on('input', debouncedSearch);

        // Reset search
        $("#reset-button").click(funcs.resetSearch);

        // Enter key in search input
        $("#search-input").keypress(function(e) {
            if (e.which == 13) { // Enter key
                funcs.performSearch();
            }
        });

        $("#keyboard-shortcuts").click(function() {
            showToast("Kiirklahvid",
                "Alt + H: Peida/näita tööriistariba\n" +
                "Ctrl + F: Otsingukast\n" +
                "Esc: Sulge menüüd\n" +
                "F5 või Ctrl + R: Värskenda andmeid",
                "info"
            );
            $("#settings-dropdown-menu").removeClass("show");
        });

        $(document).on('DOMNodeInserted', function(e) {
            if ($(e.target).hasClass('toast-notification') ||
                $(e.target).hasClass('dropdown-menu') ||
                $(e.target).hasClass('filter-row')) {
                updateDynamicElements();
            }
        });

        // Export functionality
        $("#export-excel").click(function() {
            funcs.exportToExcel();
            $("#tools-dropdown-menu").removeClass("show");
        });

        $("#export-pdf").click(function() {
            funcs.exportToPDF();
            $("#tools-dropdown-menu").removeClass("show");
        });

        $("#filter-toggle").click(function() {
            $("#filter-panel").toggleClass("show");

            // If showing, update filter field dropdowns with column options
            if ($("#filter-panel").hasClass("show")) {
                funcs.updateFilterFields();

                // Load saved filters
                funcs.loadSavedFiltersList();
            }

            // Adjust table container height after toggling filter panel
            setTimeout(funcs.resizeTableContainer, 100);
        });

        // Handle add filter row button
        $("#add-filter-row").click(function() {
            funcs.addEnhancedFilterRow();
        });

        // Handle apply filters button
        $("#apply-filters").click(function() {
            funcs.applyEnhancedFilters();
        });

        // Handle clear filters button
        $("#clear-filters").click(function() {
            funcs.clearFilters();
        });

        // Handle save filter button
        $("#save-filter").click(function() {
            showSaveFilterModal();
        });

        // Add save filter modal buttons
        $("#save-filter-button").click(function() {
            processSaveFilter();
        });

        $("#cancel-save-filter").click(function() {
            $("#save-filter-modal").addClass("hidden");
        });

        // Close save filter modal when clicking outside
        $("#save-filter-modal-backdrop").click(function() {
            $("#save-filter-modal").addClass("hidden");
        });

        // Prevent closing when clicking on modal content
        $("#save-filter-modal .modal-content").click(function(e) {
            e.stopPropagation();
        });

        $("#virtual-file").click(function() {
            showToast("Arendamisel", "Funktsioon 'Virtuaaltoimik' on arendamisel.", "info");
            $("#tools-dropdown-menu").removeClass("show");
        });

        $("#receipts-report").click(function() {
            showToast("Arendamisel", "Funktsioon 'Laekumiste aruanne' on arendamisel.", "info");
            $("#tools-dropdown-menu").removeClass("show");
        });

        // Settings buttons
        $("#toggle-columns").click(function() {
            showColumnVisibilityModal();
            $("#settings-dropdown-menu").removeClass("show");
        });

        $("#save-column-layout").click(function() {
            showToast("Arendamisel", "Veergude paigutuse salvestamine on arendamisel.", "info");
            $("#settings-dropdown-menu").removeClass("show");
        });

        // Toggle dark mode
        $("#toggle-dark-mode").click(function() {
            // Toggle state
            state.isDarkMode = !state.isDarkMode;

            // Apply theme change
            funcs.updateTheme();

            // Close dropdown
            $("#settings-dropdown-menu").removeClass("show");

            // Show confirmation with appropriate icon/colors
            const modeText = state.isDarkMode ? "Tume režiim" : "Hele režiim";
            const modeIcon = state.isDarkMode ? "fa-moon" : "fa-sun";

            showToast(
                `${modeText} aktiveeritud`,
                `Rakendus on nüüd ${state.isDarkMode ? "tume" : "hele"} režiimis`,
                state.isDarkMode ? "info" : "success"
            );
        });

        // Widget buttons
        $("#save-view").click(function() {
            showToast("Arendamisel", "Funktsioon 'Salvesta vaade' on arendamisel.", "info");
            $("#widgets-dropdown-menu").removeClass("show");
        });

        $("#load-view").click(function() {
            showToast("Arendamisel", "Funktsioon 'Lae vaade' on arendamisel.", "info");
            $("#widgets-dropdown-menu").removeClass("show");
        });

        // Column visibility modal
        $("#close-column-modal, #column-modal-backdrop, #cancel-column-changes").click(function() {
            $("#column-modal").addClass("hidden");
        });

        $("#apply-column-changes").click(function() {
            funcs.applyColumnVisibility();
            $("#column-modal").addClass("hidden");
        });

        $("#toggle-ui-btn").click(function() {
            funcs.toggleUIElements();
        });

        $("#refresh-button").click(function() {
            funcs.refreshData();
        });

        // Keyboard shortcut (Alt+H) to toggle UI
        $(document).keydown(function(e) {
            // Alt + H to toggle UI
            if (e.altKey && e.keyCode === 72) {
                funcs.toggleUIElements();
                e.preventDefault();
            }

            // Ctrl + F to focus search
            if (e.ctrlKey && e.keyCode === 70) {
                $("#search-input").focus();
                e.preventDefault();
            }

            // Esc to close dropdowns
            if (e.keyCode === 27) {
                $(".dropdown-menu").removeClass("show");
                $("#column-modal").addClass("hidden");
                $("#save-filter-modal").addClass("hidden");
            }

            // F5 or Ctrl + R to refresh data
            if (e.keyCode === 116 || (e.ctrlKey && e.keyCode === 82)) {
                funcs.refreshData();
                e.preventDefault();
            }
        });
    }

    // Show column visibility modal
    function showColumnVisibilityModal() {
        if (!state.columnDefs || state.columnDefs.length === 0) return;

        // Build checkboxes for all columns
        const container = $("#column-checkboxes");
        container.empty();

        state.columnDefs.forEach(function(col) {
            const isVisible = state.columnVisibility[col.field];

            const checkbox = $(`
                <div class="compact-checkbox-item flex items-center p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <input type="checkbox" id="col-${col.field}"
                        data-field="${col.field}"
                        class="column-toggle mr-2"
                        ${isVisible ? 'checked' : ''}>
                    <label for="col-${col.field}" class="text-xs">${col.headerName}</label>
                </div>
            `);

            container.append(checkbox);
        });

        // Show the modal
        $("#column-modal").removeClass("hidden");
    }

    // Show save filter modal
    function showSaveFilterModal() {
        // Check if we have active filters
        if (!state.gridApi) return;

        const filterModel = state.gridApi.getFilterModel();
        if (!filterModel || Object.keys(filterModel).length === 0) {
            showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
            return;
        }

        // Clear form
        $("#filter-name").val("");
        $("#filter-description").val("");
        $("#filter-public").prop("checked", false);

        // Show modal
        $("#save-filter-modal").removeClass("hidden");
    }

    // Process saving a filter
    function processSaveFilter() {
        const name = $("#filter-name").val().trim();
        const description = $("#filter-description").val().trim();
        const isPublic = $("#filter-public").prop("checked");

        // Validate inputs
        if (!name) {
            showToast("Nõutud väli puudub", "Palun sisestage filtri nimi", "error");
            return;
        }

        if (!state.gridApi) return;

        // Get current filter model
        const filterModel = state.gridApi.getFilterModel();
        if (!filterModel || Object.keys(filterModel).length === 0) {
            showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
            return;
        }

        // Show loading indicator
        $("#save-filter-button").html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvestamine...');
        $("#save-filter-button").prop("disabled", true);

        // Call API to save filter
        saveFilter(name, description, filterModel, isPublic)
            .then(response => {
                // Hide modal
                $("#save-filter-modal").addClass("hidden");

                // Show success message
                showToast("Filter salvestatud", `Filter "${name}" edukalt salvestatud`, "success");

                // Refresh filters list
                funcs.loadSavedFiltersList();
            })
            .catch(error => {
                console.error("Error saving filter:", error);
                showToast("Viga filtri salvestamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
            })
            .finally(() => {
                // Reset button
                $("#save-filter-button").html('<i class="fas fa-save mr-2"></i> Salvesta filter');
                $("#save-filter-button").prop("disabled", false);
            });
    }

    function saveFilter(name, description, filterModel, isPublic) {
        const formData = new FormData();
        formData.append('name', name);
        if (description) formData.append('description', description);
        formData.append('filter_model', JSON.stringify(filterModel));
        formData.append('is_public', isPublic);

        return $.ajax({
            url: "/api/v1/table/save-filter",
            method: "POST",
            data: formData,
            processData: false,
            contentType: false
        });
    }

    // Add a function to handle dynamic elements that might be added after initial theme application
    function updateDynamicElements() {
        // Get the current mode
        const isDark = state.isDarkMode;

        // Find dynamically created notifications/toasts
        if (isDark) {
            $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
                .addClass("bg-gray-800 text-gray-200 border-gray-700")
                .removeClass("bg-white text-gray-700 border-gray-200");

            // Update active filters
            $(".filter-badge").addClass("bg-blue-900 text-blue-100").removeClass("bg-blue-100 text-blue-800");
        } else {
            $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
                .removeClass("bg-gray-800 text-gray-200 border-gray-700")
                .addClass("bg-white text-gray-700 border-gray-200");

            // Update active filters
            $(".filter-badge").removeClass("bg-blue-900 text-blue-100").addClass("bg-blue-100 text-blue-800");
        }

        // Update toast styles
        updateToastStyles();
    }

    // Expose functions to the global bridge
    funcs.showToast = showToast;
    funcs.resizeTableContainer = resizeTableContainer;
    funcs.setupDropdowns = setupDropdowns;
    funcs.setupEventHandlers = setupEventHandlers;
    funcs.updateDynamicElements = updateDynamicElements;

})();