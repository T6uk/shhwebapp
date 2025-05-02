// app/static/js/global-bridge.js
// Bridge to ensure global functions are accessible between modules

// Ensure window.gridApi is available
if (typeof window.gridApi === 'undefined') {
    window.gridApi = null;
}

// Ensure window.columnDefs is available
if (typeof window.columnDefs === 'undefined') {
    window.columnDefs = [];
}

// Ensure window.columnVisibility is available
if (typeof window.columnVisibility === 'undefined') {
    window.columnVisibility = {};
}

// Ensure window.isDarkMode is available
if (typeof window.isDarkMode === 'undefined') {
    window.isDarkMode = localStorage.getItem('darkMode') === 'true';
}

// Common toast notification function
if (typeof window.showToast !== 'function') {
    window.showToast = function(title, message, type = "info", duration = 3000) {
        const toast = $(`
            <div class="notification ${type} mb-2">
                <div class="flex items-center">
                    <div class="notification-icon">
                        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium">${title}</h3>
                        <div class="mt-1 text-xs">${message}</div>
                    </div>
                    <div class="ml-auto pl-3">
                        <button class="notification-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).appendTo("#notification-container");

        // Add animation class
        setTimeout(() => toast.addClass('show'), 10);

        // Set up close button
        toast.find('.notification-close').on('click', function() {
            closeToast(toast);
        });

        // Auto-close after duration (if not -1)
        let timeoutId = null;
        if (duration !== -1) {
            timeoutId = setTimeout(() => closeToast(toast), duration);
        }

        // Store the timeout ID for possible cancellation
        toast.data('timeout-id', timeoutId);

        // Add hide method to the toast
        toast.hide = function() {
            closeToast(toast);
        };

        return toast;

        function closeToast(toast) {
            // Clear any existing timeout
            const timeoutId = toast.data('timeout-id');
            if (timeoutId) clearTimeout(timeoutId);

            // Hide with animation
            toast.removeClass('show');
            setTimeout(() => toast.remove(), 300);
        }
    };
}

// Make filter functions available if they're not already
if (typeof window.addEnhancedFilterRow !== 'function') {
    window.addEnhancedFilterRow = function() {
        if (typeof window.addFilterRow === 'function') {
            window.addFilterRow();
        }
    };
}

if (typeof window.applyEnhancedFilters !== 'function') {
    window.applyEnhancedFilters = function() {
        if (typeof window.applyFilters === 'function') {
            window.applyFilters();
        }
    };
}

// Debounce utility function
if (typeof window.debounce !== 'function') {
    window.debounce = function(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    };
}

// Ensure core initialization functions work
document.addEventListener('DOMContentLoaded', function() {
    console.log('Global bridge initialized');

    // Initialize dropdowns after a short delay
    setTimeout(function() {
        if (typeof window.setupDropdowns === 'function') {
            window.setupDropdowns();
        }
    }, 500);

    // Fix the resize table container function
    if (typeof window.resizeTableContainer === 'function') {
        // Make sure it runs after all scripts load
        setTimeout(window.resizeTableContainer, 1000);

        // Also attach to window resize
        $(window).on('resize', window.resizeTableContainer);
    }
});