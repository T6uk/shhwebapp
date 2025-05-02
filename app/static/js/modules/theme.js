// app/static/js/modules/theme.js
// Theme and UI appearance

(function() {
    // Local references to global state
    const state = window.appState;
    const funcs = window.appFunctions;

    // Update theme (light/dark mode)
    function updateTheme() {
        // Apply dark mode to HTML element for CSS selector support
        if (state.isDarkMode) {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark-mode');
            localStorage.setItem('darkMode', 'true');

            // Apply theme to AG Grid container
            $(".ag-theme-alpine").addClass("ag-theme-alpine-dark");

            // Core element styling
            $("body").addClass("bg-gray-900").removeClass("bg-gray-50");
            $(".app-title").addClass("text-white").removeClass("text-gray-900");
            $(".app-title-container .text-xs").addClass("text-gray-400").removeClass("text-gray-500");

            // Cards and containers
            $(".card, .dropdown-menu, .loading-card, .filter-panel, .modal-content")
                .addClass("bg-gray-800 border-gray-700")
                .removeClass("bg-white border-gray-200");

            // Buttons
            $(".btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)")
                .addClass("bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600")
                .removeClass("bg-white text-gray-700 border-gray-200 hover:bg-gray-50");

            // Inputs and form controls
            $("input, select, .input-control, .filter-select, .filter-input")
                .addClass("bg-gray-700 text-gray-200 border-gray-600")
                .removeClass("bg-white text-gray-700 border-gray-200");

            // Dropdown toggles
            $("[id$='-dropdown-toggle']").each(function() {
                $(this).addClass("bg-gray-700 text-gray-200 border-gray-600")
                    .removeClass("bg-white text-gray-700 border-gray-200");
            });

            // Dropdown items
            $(".dropdown-item")
                .addClass("text-gray-200 hover:bg-gray-700")
                .removeClass("text-gray-700 hover:bg-gray-100");

            // Column checkboxes
            $(".compact-checkbox-item")
                .addClass("hover:bg-gray-700")
                .removeClass("hover:bg-gray-100");

            // Quick links
            $(".quick-link")
                .addClass("bg-gray-700 text-gray-200 border-gray-600")
                .removeClass("bg-gray-100 text-gray-700 border-gray-200");

            // History panel
            $("#edit-history-panel")
                .addClass("bg-gray-800 text-gray-200 border-gray-700")
                .removeClass("bg-white text-gray-700 border-gray-200");

            // Status elements
            $(".status-chip:not([class*='bg-red-']):not([class*='bg-green-']):not([class*='bg-blue-']):not([class*='bg-yellow-'])")
                .addClass("bg-gray-700 text-gray-200")
                .removeClass("bg-gray-100 text-gray-700");

            // Loading overlay
            $(".loading-overlay")
                .addClass("bg-gray-900 bg-opacity-80")
                .removeClass("bg-white bg-opacity-90");

            // Filter badges
            $(".filter-badge")
                .addClass("bg-blue-900 text-blue-100")
                .removeClass("bg-blue-100 text-blue-800");

            // General text colors
            $(".text-gray-700, .text-gray-800, .text-gray-900").not(".dark\\:text-gray-200, .dark\\:text-gray-300")
                .addClass("text-gray-200")
                .removeClass("text-gray-700 text-gray-800 text-gray-900");
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark-mode');
            localStorage.setItem('darkMode', 'false');

            // Restore AG Grid theme
            $(".ag-theme-alpine").removeClass("ag-theme-alpine-dark");

            // Core element styling
            $("body").removeClass("bg-gray-900").addClass("bg-gray-50");
            $(".app-title").removeClass("text-white").addClass("text-gray-900");
            $(".app-title-container .text-xs").removeClass("text-gray-400").addClass("text-gray-500");

            // Cards and containers
            $(".card, .dropdown-menu, .loading-card, .filter-panel, .modal-content")
                .removeClass("bg-gray-800 border-gray-700")
                .addClass("bg-white border-gray-200");

            // Buttons
            $(".btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)")
                .removeClass("bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600")
                .addClass("bg-white text-gray-700 border-gray-200 hover:bg-gray-50");

            // Inputs and form controls
            $("input, select, .input-control, .filter-select, .filter-input")
                .removeClass("bg-gray-700 text-gray-200 border-gray-600")
                .addClass("bg-white text-gray-700 border-gray-200");

            // Dropdown toggles
            $("[id$='-dropdown-toggle']").each(function() {
                $(this).removeClass("bg-gray-700 text-gray-200 border-gray-600")
                    .addClass("bg-white text-gray-700 border-gray-200");
            });

            // Dropdown items
            $(".dropdown-item")
                .removeClass("text-gray-200 hover:bg-gray-700")
                .addClass("text-gray-700 hover:bg-gray-100");

            // Column checkboxes
            $(".compact-checkbox-item")
                .removeClass("hover:bg-gray-700")
                .addClass("hover:bg-gray-100");

            // Quick links
            $(".quick-link")
                .removeClass("bg-gray-700 text-gray-200 border-gray-600")
                .addClass("bg-gray-100 text-gray-700 border-gray-200");

            // History panel
            $("#edit-history-panel")
                .removeClass("bg-gray-800 text-gray-200 border-gray-700")
                .addClass("bg-white text-gray-700 border-gray-200");

            // Status elements
            $(".status-chip:not([class*='bg-red-']):not([class*='bg-green-']):not([class*='bg-blue-']):not([class*='bg-yellow-'])")
                .removeClass("bg-gray-700 text-gray-200")
                .addClass("bg-gray-100 text-gray-700");

            // Loading overlay
            $(".loading-overlay")
                .removeClass("bg-gray-900 bg-opacity-80")
                .addClass("bg-white bg-opacity-90");

            // Filter badges
            $(".filter-badge")
                .removeClass("bg-blue-900 text-blue-100")
                .addClass("bg-blue-100 text-blue-800");

            // General text colors
            $(".text-gray-200").not(".dark\\:text-gray-200")
                .removeClass("text-gray-200")
                .addClass("text-gray-700");
        }

        // Handle modals and dynamically added content
        funcs.updateDynamicElements();

        // Refresh AG Grid to apply theme changes
        if (state.gridApi) {
            state.gridApi.refreshCells({force: true});
        }
    }

    // Update font size
    function updateFontSize(newSize) {
        document.documentElement.style.setProperty('--ag-font-size', newSize + 'px');
        if (state.gridApi) {
            state.gridApi.refreshCells({force: true});
        }
    }

    // Expose functions to the global bridge
    funcs.updateTheme = updateTheme;
    funcs.updateFontSize = updateFontSize;
})();