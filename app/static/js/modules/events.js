// app/static/js/modules/events.js
// Event handlers

// Set up event handlers
function setupEventHandlers() {
    // Search with debounce
    const debouncedSearch = debounce(performSearch, 300);

    $("#search-button").click(performSearch);
    $("#search-input").on('input', debouncedSearch);

    // Reset search
    $("#reset-button").click(resetSearch);

    // Enter key in search input
    $("#search-input").keypress(function(e) {
        if (e.which == 13) { // Enter key
            performSearch();
        }
    });

    setupKeyboardShortcuts();
    setupDropdownHandlers();
    setupFilterHandlers();
    setupModalHandlers();
    setupThemeHandlers();
    setupMiscHandlers();
}

function setupKeyboardShortcuts() {
    $("#keyboard-shortcuts").click(function() {
        alert(
            "Keyboard Shortcuts:\n\n" +
            "Alt + H: Toggle UI elements (hide/show app bar and toolbar)\n" +
            "Ctrl + F: Focus search box\n" +
            "Esc: Close any open dropdown\n" +
            "F5 or Ctrl + R: Refresh data"
        );
        $("#settings-dropdown-menu").removeClass("show");
    });

    // Keyboard shortcut (Alt+H) to toggle UI
    $(document).keydown(function(e) {
        // Alt + H to toggle UI
        if (e.altKey && e.keyCode === 72) {
            toggleUIElements();
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
        }

        // F5 or Ctrl + R to refresh data
        if (e.keyCode === 116 || (e.ctrlKey && e.keyCode === 82)) {
            refreshData();
            e.preventDefault();
        }
    });
}

function setupDropdownHandlers() {
    $(document).on('DOMNodeInserted', function(e) {
        if ($(e.target).hasClass('toast-notification') ||
            $(e.target).hasClass('dropdown-menu') ||
            $(e.target).hasClass('filter-row')) {
            updateDynamicElements();
        }
    });

    // Export functionality
    $("#export-excel").click(function() {
        exportToExcel();
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#export-pdf").click(function() {
        exportToPDF();
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#virtual-file").click(function() {
        alert("Funktsioon 'Virtuaaltoimik' on arendamisel.");
        $("#tools-dropdown-menu").removeClass("show");
    });

    $("#receipts-report").click(function() {
        alert("Funktsioon 'Laekumiste aruanne' on arendamisel.");
        $("#tools-dropdown-menu").removeClass("show");
    });

    // Widget buttons
    $("#save-view").click(function() {
        alert("Funktsioon 'Salvesta vaade' on arendamisel.");
        $("#widgets-dropdown-menu").removeClass("show");
    });

    $("#load-view").click(function() {
        alert("Funktsioon 'Lae vaade' on arendamisel.");
        $("#widgets-dropdown-menu").removeClass("show");
    });

    // Settings buttons
    $("#toggle-columns").click(function() {
        showColumnVisibilityModal();
        $("#settings-dropdown-menu").removeClass("show");
    });

    $("#save-column-layout").click(function() {
        alert("Veergude paigutuse salvestamine on arendamisel.");
        $("#settings-dropdown-menu").removeClass("show");
    });
}

function setupFilterHandlers() {
    $("#filter-toggle").click(function() {
        $("#filter-panel").toggleClass("show");

        // If showing, update filter field dropdowns with column options
        if ($("#filter-panel").hasClass("show")) {
            updateFilterFields();

            // Load saved filters
            loadSavedFiltersList();
        }

        // Adjust table container height after toggling filter panel
        setTimeout(resizeTableContainer, 100);
    });

    // Replace the old add filter row handler with the enhanced one
    $("#add-filter-row").click(function() {
        addEnhancedFilterRow();
    });

    // Replace the old apply filters handler with the enhanced one
    $("#apply-filters").click(function() {
        applyEnhancedFilters();
    });

    // Handle clear filters button
    $("#clear-filters").click(function() {
        clearFilters();
    });

    // Handle save filter button
    $("#save-filter").click(function() {
        showSaveFilterModal();
    });

    $("#open-filter-panel").click(function() {
        $("#filter-panel").addClass("show");
        $("#filters-dropdown-menu").removeClass("show");

        // If showing, update filter field dropdowns with column options
        updateFilterFields();

        // Load saved filters
        loadSavedFiltersList();

        // Adjust table container height after toggling filter panel
        setTimeout(resizeTableContainer, 100);
    });
}

function setupModalHandlers() {
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

    // Column visibility modal
    $("#close-column-modal, #column-modal-backdrop, #cancel-column-changes").click(function() {
        $("#column-modal").addClass("hidden");
    });

    $("#apply-column-changes").click(function() {
        applyColumnVisibility();
        $("#column-modal").addClass("hidden");
    });
}

function setupThemeHandlers() {
    // Toggle dark mode
    $("#toggle-dark-mode").click(function() {
        // Toggle state
        AppState.isDarkMode = !AppState.isDarkMode;

        // Apply theme change
        updateTheme();

        // Close dropdown
        $("#settings-dropdown-menu").removeClass("show");

        // Show confirmation with appropriate icon/colors
        const modeText = AppState.isDarkMode ? "Tume režiim" : "Hele režiim";
        const modeIcon = AppState.isDarkMode ? "fa-moon" : "fa-sun";

        showToast(
            `${modeText} aktiveeritud`,
            `Rakendus on nüüd ${AppState.isDarkMode ? "tume" : "hele"} režiimis`,
            AppState.isDarkMode ? "info" : "success"
        );
    });
}

function setupMiscHandlers() {
    $("#toggle-ui-btn").click(function() {
        toggleUIElements();
    });
}

// Export functions for other modules
window.setupEventHandlers = setupEventHandlers;