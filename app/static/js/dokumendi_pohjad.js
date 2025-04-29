// Document templates and drafts functionality
$(document).ready(function() {
    // Track current view mode - default to templates
    let viewingDrafts = false;
    let selectedTemplate = null;

    // Document directories
    const templatesDir = "C:\\Taitemenetlus\\uksikdokumendid\\dokumendipohjad";
    const draftsDir = "C:\\Taitemenetlus\\uksikdokumendid\\mustandid";

    // Set up click handler for the "Mustandid" button - implement toggle
    $("#drafts-btn").off('click').on('click', function() {
        console.log("Drafts button clicked, current state:", viewingDrafts);

        // Toggle between drafts and templates
        viewingDrafts = !viewingDrafts;

        // Update button text
        if (viewingDrafts) {
            $(this).html('<i class="fas fa-file-alt text-xs mr-1"></i><span>Põhjad</span>');
            $("#document-templates-modal h3 span").text("Dokumendimustandid");
        } else {
            $(this).html('<i class="fas fa-file-signature text-xs mr-1"></i><span>Mustandid</span>');
            $("#document-templates-modal h3 span").text("Dokumendipohjad");
        }

        // Load the appropriate content
        if (viewingDrafts) {
            loadDocumentDrafts();
        } else {
            loadDocumentTemplates();
        }
    });

    // Handler for "Koosta PDF" button
    $("#create-pdf-btn").off('click').on('click', function() {
        console.log("Create PDF button clicked");

        // Check if a template is selected
        if (!selectedTemplate) {
            showToast("Viga", "Palun valige dokument enne PDF koostamist", "error");
            return;
        }

        // Check if it's a Word document
        const ext = selectedTemplate.toLowerCase();
        if (!ext.endsWith('.doc') && !ext.endsWith('.docx') && !ext.endsWith('.rtf')) {
            showToast("Viga", "PDF-i saab koostada ainult Word dokumentidest", "error");
            return;
        }

        // Show loading notification
        const loadingToast = showToast("PDF loomine", "PDF-i loomine...", "info", -1);

        // Call API to convert the document to PDF
        $.ajax({
            url: "/api/v1/table/convert-to-pdf",
            method: "POST",
            data: {
                source_path: selectedTemplate
            },
            success: function(response) {
                // Hide loading notification
                loadingToast.hide();

                console.log("PDF conversion response:", response);

                if (response.success) {
                    showToast("PDF loodud", "PDF dokument edukalt loodud", "success");

                    // Refresh the list to show the new PDF
                    if (viewingDrafts) {
                        loadDocumentDrafts();
                    } else {
                        loadDocumentTemplates();
                    }
                } else {
                    showToast("Viga", response.message || "PDF loomine ebaõnnestus", "error");
                }
            },
            error: function(xhr, status, error) {
                // Hide loading notification
                loadingToast.hide();

                console.error("Error creating PDF:", error);
                showToast("Viga", xhr.responseJSON?.message || "PDF loomine ebaõnnestus", "error");
            }
        });
    });

    // Handler for "Redigeeri dokumenti" button
    $("#edit-doc-btn").off('click').on('click', function() {
        console.log("Edit document button clicked");

        // Check if a template is selected
        if (!selectedTemplate) {
            showToast("Viga", "Palun valige dokument enne redigeerimist", "error");
            return;
        }

        // Call API to open the document for editing
        $.ajax({
            url: "/api/v1/table/open-for-editing",
            method: "POST",
            data: {
                file_path: selectedTemplate
            },
            success: function(response) {
                console.log("Open for editing response:", response);

                if (response.success) {
                    showToast("Dokument avatud", "Dokument avatud redigeerimiseks", "success");
                } else {
                    showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error opening document:", error);
                showToast("Viga", xhr.responseJSON?.message || "Dokumendi avamine ebaõnnestus", "error");
            }
        });
    });

    // Handler for "Open templates folder" button
    $("#open-templates-folder-btn").off('click').on('click', function() {
        // Determine which folder to open based on current view
        const folderPath = viewingDrafts ? draftsDir : templatesDir;

        // Call API to open the folder
        $.ajax({
            url: `/api/v1/table/open-folder/${encodeURIComponent(folderPath)}`,
            method: "GET",
            success: function(response) {
                console.log("Open folder response:", response);
                if (response.success) {
                    showToast("Kaust avatud", `${viewingDrafts ? "Mustandite" : "Mallide"} kaust avati edukalt`, "success");
                } else {
                    showToast("Viga", response.message || "Kausta avamine ebaõnnestus", "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error opening folder:", error);
                showToast("Viga", "Kausta avamine ebaõnnestus", "error");
            }
        });
    });

    // Function to load document templates
    function loadDocumentTemplates() {
        // Show loading state
        $("#templates-table-body").html(`
            <tr>
                <td colspan="6" class="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    <div class="flex justify-center items-center space-x-2">
                        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Laadin dokumendipohjad...</span>
                    </div>
                </td>
            </tr>
        `);

        // Hide empty and error states
        $("#templates-empty-state").addClass("hidden");
        $("#templates-error-state").addClass("hidden");

        // Reset selected template
        selectedTemplate = null;

        // Call API to get document templates
        $.ajax({
            url: "/api/v1/table/document-templates",
            method: "GET",
            success: function(response) {
                console.log("Document templates response:", response);

                if (response.success) {
                    // Check if there are templates
                    if (response.templates && response.templates.length > 0) {
                        // Render templates table
                        renderTemplatesTable(response.templates);
                    } else {
                        // Show empty state
                        $("#templates-table-body").empty();
                        $("#templates-empty-state").removeClass("hidden");
                    }
                } else {
                    // Show error state
                    $("#templates-table-body").empty();
                    $("#templates-error-state").removeClass("hidden");
                    $("#templates-error-message").text(response.error || "Proovige lehte värskendada");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error loading document templates:", error);

                // Show error state
                $("#templates-table-body").empty();
                $("#templates-error-state").removeClass("hidden");
                $("#templates-error-message").text(error || "Võrgu viga");
            }
        });
    }

    // Function to load document drafts
    function loadDocumentDrafts() {
        // Show loading state
        $("#templates-table-body").html(`
            <tr>
                <td colspan="6" class="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    <div class="flex justify-center items-center space-x-2">
                        <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Laadin dokumendimustandid...</span>
                    </div>
                </td>
            </tr>
        `);

        // Hide empty and error states
        $("#templates-empty-state").addClass("hidden");
        $("#templates-error-state").addClass("hidden");

        // Reset selected template
        selectedTemplate = null;

        // Call API to get document drafts
        $.ajax({
            url: "/api/v1/table/document-drafts",
            method: "GET",
            success: function(response) {
                console.log("Document drafts response:", response);

                if (response.success) {
                    // Check if there are drafts
                    if (response.drafts && response.drafts.length > 0) {
                        // Render drafts table
                        renderTemplatesTable(response.drafts);
                    } else {
                        // Show empty state
                        $("#templates-table-body").empty();
                        $("#templates-empty-state").removeClass("hidden");
                        $("#templates-empty-state h3").text("Dokumendimustandid puuduvad");
                        $("#templates-empty-state p").text("Lisa mustandid kausta C:/Taitemenetlus/uksikdokumendid/mustandid");
                    }
                } else {
                    // Show error state
                    $("#templates-table-body").empty();
                    $("#templates-error-state").removeClass("hidden");
                    $("#templates-error-message").text(response.error || "Proovige lehte värskendada");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error loading document drafts:", error);

                // Show error state
                $("#templates-table-body").empty();
                $("#templates-error-state").removeClass("hidden");
                $("#templates-error-message").text(error || "Võrgu viga");
            }
        });
    }

    // Function to render templates/drafts table
    function renderTemplatesTable(items) {
        let tableHtml = '';

        items.forEach(item => {
            // Determine icon based on file extension
            let icon = getFileIcon(item.extension);

            // Determine type display name
            let typeDisplay = getFileTypeDisplay(item.extension);

            tableHtml += `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer template-row" data-path="${escapeHtml(item.path)}">
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">
                        ${icon}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        ${escapeHtml(item.name)}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${escapeHtml(typeDisplay)}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${escapeHtml(item.formatted_size)}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${escapeHtml(item.modified)}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        <div class="flex space-x-2">
                            <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 use-template-btn" title="Kasuta" data-path="${escapeHtml(item.path)}">
                                <i class="fas fa-file-alt"></i>
                            </button>
                            <button class="text-green-500 hover:text-green-700 dark:text-green-400 preview-template-btn" title="Eelvaade" data-path="${escapeHtml(item.path)}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        // Update table body
        $("#templates-table-body").html(tableHtml);

        // Set up click handlers for template rows
        $(".template-row").on('click', function() {
            const path = $(this).data('path');
            selectTemplate(path);
        });

        // Set up action button click handlers
        $(".use-template-btn").on('click', function(e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            selectTemplate(path);
        });

        $(".preview-template-btn").on('click', function(e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            previewTemplate(path);
        });
    }

    // Function to select a template
    function selectTemplate(path) {
        // Highlight the selected template row
        $(".template-row").removeClass("bg-blue-50 dark:bg-blue-900");
        $(`.template-row[data-path="${escapeHtmlAttr(path)}"]`).addClass("bg-blue-50 dark:bg-blue-900");

        // Store selected template path for use with action buttons
        selectedTemplate = path;

        console.log("Selected template:", path);
    }

    // Function to preview a template
    function previewTemplate(path) {
        try {
            // Call API to open the document for viewing
            $.ajax({
                url: "/api/v1/table/open-for-editing", // We'll reuse this endpoint
                method: "POST",
                data: {
                    file_path: path
                },
                success: function(response) {
                    console.log("Preview document response:", response);

                    if (response.success) {
                        showToast("Dokument avatud", "Dokument avatud eelvaateks", "success");
                    } else {
                        showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                    }
                },
                error: function(xhr, status, error) {
                    console.error("Error previewing document:", error);
                    showToast("Viga", xhr.responseJSON?.message || "Dokumendi avamine ebaõnnestus", "error");
                }
            });
        } catch (e) {
            console.error("Error opening template:", e);
            showToast("Viga", "Malli eelvaate avamine ebaõnnestus", "error");
        }
    }

    // Helper function to get file icon based on extension
    function getFileIcon(extension) {
        const iconMap = {
            '.pdf': '<i class="fas fa-file-pdf text-red-500"></i>',
            '.doc': '<i class="fas fa-file-word text-blue-500"></i>',
            '.docx': '<i class="fas fa-file-word text-blue-500"></i>',
            '.xls': '<i class="fas fa-file-excel text-green-500"></i>',
            '.xlsx': '<i class="fas fa-file-excel text-green-500"></i>',
            '.ppt': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
            '.pptx': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
            '.txt': '<i class="fas fa-file-alt text-gray-500"></i>',
            '.rtf': '<i class="fas fa-file-alt text-blue-400"></i>',
        };

        return iconMap[extension.toLowerCase()] || '<i class="fas fa-file text-gray-500"></i>';
    }

    // Helper function to get file type display name
    function getFileTypeDisplay(extension) {
        const typeMap = {
            '.pdf': 'PDF dokument',
            '.doc': 'Word dokument',
            '.docx': 'Word dokument',
            '.xls': 'Excel tabel',
            '.xlsx': 'Excel tabel',
            '.ppt': 'PowerPoint',
            '.pptx': 'PowerPoint',
            '.txt': 'Tekstifail',
            '.rtf': 'RTF dokument',
        };

        return typeMap[extension.toLowerCase()] || (extension ? extension.substring(1).toUpperCase() + ' fail' : 'Tundmatu fail');
    }

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Helper function to escape HTML attribute values
    function escapeHtmlAttr(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Enhanced showToast function with duration control if it doesn't exist already
    if (typeof showToast !== 'function') {
        window.showToast = function(title, message, type, duration = 3000) {
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

    // Hook into the create-document-btn from the Virtuaaltoimik modal
    $("#create-document-btn").off('click').on('click', function() {
        console.log("Create document button clicked from virtuaaltoimik");

        // Show document templates modal and load templates
        $("#document-templates-modal").removeClass("hidden");

        // Reset to templates view if previously showing drafts
        if (viewingDrafts) {
            viewingDrafts = false;
            $("#drafts-btn").html('<i class="fas fa-file-signature text-xs mr-1"></i><span>Mustandid</span>');
            $("#document-templates-modal h3 span").text("Dokumendipohjad");
        }

        // Load templates
        loadDocumentTemplates();
    });

    // Document templates modal close handlers
    $("#close-document-templates-modal, #exit-templates-btn").on('click', function() {
        $("#document-templates-modal").addClass("hidden");
    });

    // Close modal when clicking backdrop
    $("#document-templates-backdrop").on('click', function() {
        $("#document-templates-modal").addClass("hidden");
    });

    // Prevent closing when clicking modal content
    $("#document-templates-modal .modal-content").on('click', function(e) {
        e.stopPropagation();
    });
});