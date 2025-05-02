// app/static/js/modules/helpers.js
// Common helper functions for the application

window.AppHelpers = {
    // Show a toast notification
    showToast: function(title, message, type = "info", duration = 3000) {
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
    },

    // Debounce function for event handlers
    debounce: function(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    },

    // Get file icon based on extension
    getFileIcon: function(extension) {
        if (!extension) return '<i class="fas fa-file text-gray-500"></i>';

        const iconMap = {
            '.pdf': '<i class="fas fa-file-pdf text-red-500"></i>',
            '.doc': '<i class="fas fa-file-word text-blue-500"></i>',
            '.docx': '<i class="fas fa-file-word text-blue-500"></i>',
            '.xls': '<i class="fas fa-file-excel text-green-500"></i>',
            '.xlsx': '<i class="fas fa-file-excel text-green-500"></i>',
            '.ppt': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
            '.pptx': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
            '.txt': '<i class="fas fa-file-alt text-gray-500"></i>',
            '.csv': '<i class="fas fa-file-csv text-green-400"></i>',
            '.jpg': '<i class="fas fa-file-image text-purple-500"></i>',
            '.jpeg': '<i class="fas fa-file-image text-purple-500"></i>',
            '.png': '<i class="fas fa-file-image text-purple-500"></i>',
            '.gif': '<i class="fas fa-file-image text-purple-500"></i>',
            '.zip': '<i class="fas fa-file-archive text-yellow-500"></i>',
            '.rar': '<i class="fas fa-file-archive text-yellow-500"></i>',
            '.html': '<i class="fas fa-file-code text-indigo-500"></i>',
            '.css': '<i class="fas fa-file-code text-blue-400"></i>',
            '.js': '<i class="fas fa-file-code text-yellow-400"></i>',
        };

        return iconMap[extension.toLowerCase()] || '<i class="fas fa-file text-gray-500"></i>';
    },

    // Format file size
    formatFileSize: function(sizeBytes) {
        if (!sizeBytes || isNaN(parseInt(sizeBytes))) return '0 B';

        const size = parseInt(sizeBytes);
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    },

    // Escape HTML for safe insertion
    escapeHtml: function(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

// Expose helper functions globally for backwards compatibility
window.showToast = window.AppHelpers.showToast;
window.debounce = window.AppHelpers.debounce;
window.getFileIcon = window.AppHelpers.getFileIcon;
window.formatFileSize = window.AppHelpers.formatFileSize;
window.escapeHtml = window.AppHelpers.escapeHtml;

console.log("Helpers module loaded");