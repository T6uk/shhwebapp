// app/static/js/modules/ui.js
// UI utilities

// Set up dropdown toggles
function setupDropdowns() {
    const dropdowns = [
        {toggle: "#tools-dropdown-toggle", menu: "#tools-dropdown-menu"},
        {toggle: "#widgets-dropdown-toggle", menu: "#widgets-dropdown-menu"},
        {toggle: "#settings-dropdown-toggle", menu: "#settings-dropdown-menu"},
        {toggle: "#links-dropdown-toggle", menu: "#links-dropdown-menu"},
        {toggle: "#filters-dropdown-toggle", menu: "#filters-dropdown-menu"}
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

// Show a toast notification
function showToast(title, message, type = "info") {
    const toast = $(`
        <div class="toast-notification flex items-center p-3 mb-3 rounded-lg shadow-md">
            <div class="mr-3">
                ${getToastIcon(type)}
            </div>
            <div class="flex-1">
                <div class="font-medium">${title}</div>
                <div class="text-sm opacity-90">${message}</div>
            </div>
            <button class="ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `);

    // Add appropriate color classes
    const isDark = document.documentElement.classList.contains('dark');
    let colors = {
        "success": isDark ? "bg-green-900 text-green-100" : "bg-green-100 text-green-800",
        "error": isDark ? "bg-red-900 text-red-100" : "bg-red-100 text-red-800",
        "info": isDark ? "bg-blue-900 text-blue-100" : "bg-blue-100 text-blue-800",
        "warning": isDark ? "bg-yellow-900 text-yellow-100" : "bg-yellow-100 text-yellow-800"
    };
    toast.addClass(colors[type]);

    // Add close button functionality
    toast.find("button").click(function() {
        toast.fadeOut(300, function() {
            toast.remove();
        });
    });

    // Add to notification container
    $("#notification-container").append(toast);

    // Auto-hide after 5 seconds
    setTimeout(function() {
        toast.fadeOut(300, function() {
            toast.remove();
        });
    }, 5000);
}

// Get toast icon based on type
function getToastIcon(type) {
    switch (type) {
        case "success":
            return '<i class="fas fa-check-circle text-green-500 dark:text-green-400"></i>';
        case "error":
            return '<i class="fas fa-exclamation-circle text-red-500 dark:text-red-400"></i>';
        case "warning":
            return '<i class="fas fa-exclamation-triangle text-yellow-500 dark:text-yellow-400"></i>';
        case "info":
        default:
            return '<i class="fas fa-info-circle text-blue-500 dark:text-blue-400"></i>';
    }
}

// Check for database changes
function checkForDatabaseChanges() {
    $.ajax({
        url: "/api/v1/table/check-for-changes",
        method: "GET",
        data: {
            last_checked: AppState.lastChangeCheck || new Date().toISOString()
        },
        dataType: "json",
        success: function(response) {
            // Update the last check timestamp
            AppState.lastChangeCheck = response.timestamp;

            // If there are changes, highlight the refresh button
            if (response.has_changes) {
                highlightRefreshButton(response.changes);
            }
        },
        error: function(xhr, status, error) {
            console.error("Error checking for changes:", error);
        }
    });
}

// Set up periodic data refresh
function setupDataRefreshTimer() {
    // Initialize refresh state - no automatic refresh
    console.log("Data refresh will only happen on user action");

    // Check for changes every 30 seconds, but only notify, don't refresh
    setInterval(function() {
        checkForDatabaseChanges();
    }, 30000); // 30 seconds
}

// Function to highlight the refresh button when changes are detected
function highlightRefreshButton(changes) {
    // Add pulsing animation and change color
    $("#refresh-button")
        .addClass("animate-pulse bg-yellow-500 hover:bg-yellow-600")
        .removeClass("btn-secondary");

    // Add counter badge if there are multiple changes
    if (changes && changes.length > 0) {
        const badge = $(`<span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${changes.length}</span>`);
        $("#refresh-button .badge-container").html(badge);
    }
}

// Function to reset refresh button to normal state
function resetRefreshButton() {
    $("#refresh-button")
        .removeClass("animate-pulse bg-yellow-500 hover:bg-yellow-600")
        .addClass("btn-secondary");

    $("#refresh-button .badge-container").empty();
}

// Export functions for other modules
window.setupDropdowns = setupDropdowns;
window.showToast = showToast;
window.checkForDatabaseChanges = checkForDatabaseChanges;
window.setupDataRefreshTimer = setupDataRefreshTimer;
window.highlightRefreshButton = highlightRefreshButton;
window.resetRefreshButton = resetRefreshButton;