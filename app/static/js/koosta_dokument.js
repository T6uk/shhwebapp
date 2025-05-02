// Document generation functionality
window.DocumentGenerator = (function() {
    // Keep track of the currently selected template and row
    let selectedTemplatePath = null;
    let selectedRowData = null;

    // Initialize the document generator
    function init() {
        console.log("Initializing DocumentGenerator");
        // Set up event listeners
        setupEventListeners();
    }

    // Set up all event listeners
    function setupEventListeners() {
        // Handle template selection
        $('#templates-table-body').on('click', 'tr', function() {
            $('#templates-table-body tr').removeClass('bg-blue-100 dark:bg-blue-900');
            $(this).addClass('bg-blue-100 dark:bg-blue-900');

            selectedTemplatePath = $(this).data('path');
            console.log("Selected template path:", selectedTemplatePath);
        });

        // Handle create document button click
        $('#create-doc-btn').on('click', function() {
            if (!selectedTemplatePath) {
                showNotification('error', 'Viga', 'Palun valige mall');
                return;
            }

            if (!selectedRowData) {
                // Get the selected row data from the grid
                const gridApi = window.gridApi;
                if (!gridApi) {
                    showNotification('error', 'Viga', 'Andmeruudustikku ei leitud');
                    return;
                }

                const selectedRows = gridApi.getSelectedRows();
                if (!selectedRows || selectedRows.length === 0) {
                    showNotification('error', 'Viga', 'Palun valige rida tabelist');
                    return;
                }

                selectedRowData = selectedRows[0];
            }

            // Show loading indicator
            showLoading('Dokumendi genereerimine...');

            // Generate a default output name
            const templateName = selectedTemplatePath.split('\\').pop();
            const baseName = templateName.substring(0, templateName.lastIndexOf('.'));
            const extension = templateName.substring(templateName.lastIndexOf('.'));
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15);
            const outputName = `${baseName}_${timestamp}${extension}`;

            // Prepare form data
            const formData = new FormData();
            formData.append('template_path', selectedTemplatePath);
            formData.append('row_data_json', JSON.stringify(selectedRowData));
            formData.append('output_name', outputName);

            // Send request to generate document
            fetch('/api/v1/table/generate-document', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                hideLoading();

                if (data.success) {
                    showNotification('success', 'Dokument genereeritud', data.message);

                    // Ask if user wants to open the document
                    if (confirm('Dokument edukalt genereeritud. Kas soovite avada dokumendi?')) {
                        openDocument(data.file_path);
                    }

                    // Close the templates modal
                    $('#document-templates-modal').addClass('hidden');

                    // Refresh the drafts list if the drafts modal is open
                    if ($('#document-drafts-modal').is(':visible')) {
                        if (typeof loadDrafts === 'function') {
                            loadDrafts();
                        }
                    }
                } else {
                    showNotification('error', 'Viga', data.message);
                }
            })
            .catch(error => {
                hideLoading();
                showNotification('error', 'Viga', 'Dokumendi genereerimisel tekkis viga: ' + error);
                console.error('Error generating document:', error);
            });
        });
    }

    // Set the selected row data
    function setRowData(rowData) {
        selectedRowData = rowData;
    }

    // Open a document with the default application
    function openDocument(path) {
        const formData = new FormData();
        formData.append('file_path', path);

        fetch('/api/v1/table/open-for-editing', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                showNotification('error', 'Viga', data.message);
            }
        })
        .catch(error => {
            showNotification('error', 'Viga', 'Dokumendi avamisel tekkis viga: ' + error);
            console.error('Error opening document:', error);
        });
    }

    // Show loading indicator
    function showLoading(message) {
        if (!$('#loading-overlay').length) {
            $('body').append(`
                <div id="loading-overlay" class="loading-overlay fixed inset-0 flex items-center justify-center z-50">
                    <div class="loading-card rounded-lg shadow-xl">
                        <div class="spinner mb-3"></div>
                        <p class="text-base font-medium mb-1">${message || 'Laadimine...'}</p>
                        <p class="text-xs text-secondary-color dark:text-gray-400">Palun oodake</p>
                    </div>
                </div>
            `);
        } else {
            $('#loading-overlay').removeClass('hidden');
            $('#loading-overlay .text-base').text(message || 'Laadimine...');
        }
    }

    // Hide loading indicator
    function hideLoading() {
        $('#loading-overlay').addClass('hidden');
    }

    // Show a notification
    function showNotification(type, title, message) {
        // Use global showToast if available
        if (typeof window.showToast === 'function') {
            window.showToast(title, message, type);
            return;
        }

        // Fallback implementation
        const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        const bgClass = type === 'success' ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700';

        const notification = $(`
            <div class="notification ${bgClass} border-l-4 p-3 mb-2 rounded shadow-sm" style="opacity: 0; transform: translateX(-20px);">
                <div class="flex items-center">
                    <i class="fas ${iconClass} mr-2"></i>
                    <div>
                        <div class="font-bold text-sm">${title}</div>
                        <p class="text-xs">${message}</p>
                    </div>
                    <button class="ml-auto text-gray-500 hover:text-gray-700 close-notification">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);

        $('#notification-container').append(notification);

        // Animate in
        notification.animate({
            opacity: 1,
            transform: 'translateX(0)'
        }, 300);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.animate({
                opacity: 0,
                transform: 'translateX(-20px)'
            }, 300, function() {
                $(this).remove();
            });
        }, 5000);

        // Handle close button
        notification.find('.close-notification').on('click', function() {
            notification.animate({
                opacity: 0,
                transform: 'translateX(-20px)'
            }, 300, function() {
                $(this).remove();
            });
        });
    }

    // Public API
    return {
        init: init,
        setRowData: setRowData,
        openDocument: openDocument
    };
})();

// Initialize when the document is ready
$(document).ready(function() {
    window.DocumentGenerator.init();
});