// app/static/js/modules/theme.js
// Theme management functions

// Update theme (light/dark mode)
function updateTheme() {
    // Apply dark mode to HTML element for CSS selector support
    if (AppState.isDarkMode) {
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
        $(".card, .dropdown-menu, .loading-card, .filter-panel")
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

        // Apply remaining dark mode classes
        applyDarkModeClasses();
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
        $(".card, .dropdown-menu, .loading-card, .filter-panel")
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

        // Apply remaining light mode classes
        applyLightModeClasses();
    }

    // Handle modals and dynamically added content
    updateDynamicElements();

    // Refresh AG Grid to apply theme changes
    if (AppState.gridApi) {
        AppState.gridApi.refreshCells({force: true});
    }
}

// Apply dark mode specific classes
function applyDarkModeClasses() {
    // Dropdown items
    $(".dropdown-item")
        .addClass("text-gray-200 hover:bg-gray-700")
        .removeClass("text-gray-700 hover:bg-gray-100");

    // Modal content
    $("#column-modal .modal-content")
        .addClass("bg-gray-800 border-gray-700")
        .removeClass("bg-white border-gray-200");

    // Column checkboxes
    $(".column-checkbox-item")
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

    // General text colors
    $(".text-gray-700, .text-gray-800, .text-gray-900").not(".dark\\:text-gray-200, .dark\\:text-gray-300")
        .addClass("text-gray-200")
        .removeClass("text-gray-700 text-gray-800 text-gray-900");
}

// Apply light mode specific classes
function applyLightModeClasses() {
    // Dropdown items
    $(".dropdown-item")
        .removeClass("text-gray-200 hover:bg-gray-700")
        .addClass("text-gray-700 hover:bg-gray-100");

    // Modal content
    $("#column-modal .modal-content")
        .removeClass("bg-gray-800 border-gray-700")
        .addClass("bg-white border-gray-200");

    // Column checkboxes
    $(".column-checkbox-item")
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

    // General text colors
    $(".text-gray-200").not(".dark\\:text-gray-200")
        .removeClass("text-gray-200")
        .addClass("text-gray-700");
}

// Update dynamic elements that might be added after initial theme application
function updateDynamicElements() {
    // Get the current mode
    const isDark = document.body.classList.contains('dark-mode');

    // Find dynamically created notifications/toasts
    if (isDark) {
        $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
            .addClass("bg-gray-800 text-gray-200 border-gray-700")
            .removeClass("bg-white text-gray-700 border-gray-200");
    } else {
        $(".toast-notification:not(.bg-red-100):not(.bg-green-100):not(.bg-blue-100):not(.bg-yellow-100)")
            .removeClass("bg-gray-800 text-gray-200 border-gray-700")
            .addClass("bg-white text-gray-700 border-gray-200");
    }
}

// Set up observer for dark mode changes on dynamically added elements
function setupDarkModeObserver() {
    // Create an observer instance
    const observer = new MutationObserver(function(mutations) {
        if (AppState.isDarkMode) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    // Apply dark mode to newly added elements
                    $(mutation.addedNodes).find('.btn-secondary:not(.bg-yellow-500):not(.bg-red-500):not(.bg-green-500)').addClass('bg-gray-700 text-gray-200 border-gray-600').removeClass('bg-white text-gray-700 border-gray-200');
                    $(mutation.addedNodes).find('input, select').addClass('bg-gray-700 text-gray-200 border-gray-600').removeClass('bg-white text-gray-700 border-gray-200');
                    $(mutation.addedNodes).find('.card, .dropdown-menu').addClass('bg-gray-800 border-gray-700').removeClass('bg-white border-gray-200');

                    // Handle status chips
                    $(mutation.addedNodes).find('.status-chip:not([class*="bg-red-"]):not([class*="bg-green-"]):not([class*="bg-blue-"]):not([class*="bg-yellow-"])').addClass('bg-gray-700 text-gray-200').removeClass('bg-gray-100 text-gray-700');

                    // Handle dark mode for toast notifications
                    if ($(mutation.addedNodes).hasClass('toast-notification')) {
                        updateDynamicElements();
                    }
                }
            });
        }
    });

    // Observe changes to the DOM
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return observer;
}

// Update toast notifications style
function updateToastStyles() {
    // Updates any existing toast notifications to use the current theme
    const isDark = document.documentElement.classList.contains('dark');

    // Get all toast notifications
    $(".toast-notification").each(function() {
        const $toast = $(this);

        // Get the notification type (info, success, error, warning)
        let type = "info";
        if ($toast.hasClass("bg-green-100") || $toast.hasClass("bg-green-900")) type = "success";
        if ($toast.hasClass("bg-red-100") || $toast.hasClass("bg-red-900")) type = "error";
        if ($toast.hasClass("bg-yellow-100") || $toast.hasClass("bg-yellow-900")) type = "warning";

        // Remove all possible color classes
        $toast.removeClass(
            "bg-blue-100 bg-green-100 bg-red-100 bg-yellow-100 " +
            "bg-blue-900 bg-green-900 bg-red-900 bg-yellow-900 " +
            "text-blue-100 text-green-100 text-red-100 text-yellow-100 " +
            "text-blue-800 text-green-800 text-red-800 text-yellow-800"
        );

        // Apply appropriate classes for current theme
        let colors = {
            "success": isDark ? "bg-green-900 text-green-100" : "bg-green-100 text-green-800",
            "error": isDark ? "bg-red-900 text-red-100" : "bg-red-100 text-red-800",
            "info": isDark ? "bg-blue-900 text-blue-100" : "bg-blue-100 text-blue-800",
            "warning": isDark ? "bg-yellow-900 text-yellow-100" : "bg-yellow-100 text-yellow-800"
        };

        // Add the colors
        $toast.addClass(colors[type]);
    });
}

// Toggle UI elements visibility
function toggleUIElements() {
    AppState.uiHidden = !AppState.uiHidden;

    // Save state to localStorage
    localStorage.setItem('bigtable_ui_hidden', AppState.uiHidden ? 'true' : 'false');

    // Update button icon
    if (AppState.uiHidden) {
        $("#toggle-ui-btn i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
        $("#toggle-ui-btn").attr("title", "Show UI elements");
    } else {
        $("#toggle-ui-btn i").removeClass("fa-expand-alt").addClass("fa-compress-alt");
        $("#toggle-ui-btn").attr("title", "Hide UI elements");
    }

    if (AppState.uiHidden) {
        // Hide toolbar but keep header
        $("#toolbar-container").slideUp(300, function() {
            resizeTableContainer();
        });
    } else {
        // Show toolbar
        $("#toolbar-container").slideDown(300, function() {
            resizeTableContainer();
        });
    }
}

// Export functions for other modules
window.updateTheme = updateTheme;
window.updateDynamicElements = updateDynamicElements;
window.updateToastStyles = updateToastStyles;
window.toggleUIElements = toggleUIElements;