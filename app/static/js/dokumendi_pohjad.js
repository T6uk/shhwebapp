// Document templates and drafts functionality
$(document).ready(function () {
    // Clean up any template status displays from other modals
    $("#virtuaaltoimik-modal #template-status-display, #column-modal #template-status-display, #save-filter-modal #template-status-display").remove();

    // Track current view mode - default to templates
    let viewingDrafts = false;
    // Track current view mode - default to templates
    let selectedTemplate = null;
    let selectedTemplateInfo = null;

    // Document directories
    const templatesDir = "C:\\Taitemenetlus\\uksikdokumendid\\dokumendipohjad";
    const draftsDir = "C:\\Taitemenetlus\\uksikdokumendid\\mustandid";

    // Set up click handler for the "Mustandid" button - implement toggle
    $("#drafts-btn").off('click').on('click', function () {
        console.log("Drafts button clicked, current state:", viewingDrafts);

        // Toggle between drafts and templates
        viewingDrafts = !viewingDrafts;

        // Retrieve stored toimiku info
        const toimikuInfo = $("#document-templates-modal").data("toimiku-info") || "";

        // Set base title and add toimiku info if available
        let titleBase = viewingDrafts ? "Dokumendi mustandid" : "Dokumendipõhjad";
        let fullTitle = titleBase;

        if (toimikuInfo) {
            fullTitle += ` - ${toimikuInfo}`;
        }

        // Update button text and title
        if (viewingDrafts) {
            $(this).html('<i class="fas fa-file-alt text-xs mr-1"></i><span>Põhjad</span>');
            $("#doc-pohjad-title").text(fullTitle);
        } else {
            $(this).html('<i class="fas fa-file-signature text-xs mr-1"></i><span>Mustandid</span>');
            $("#doc-pohjad-title").text(fullTitle);
        }

        // Load the appropriate content
        if (viewingDrafts) {
            loadDocumentDrafts();
        } else {
            loadDocumentTemplates();
        }
    });

    // Handler for "Koosta PDF" button
    $("#create-pdf-btn").off('click').on('click', function () {
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
            success: function (response) {
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
            error: function (xhr, status, error) {
                // Hide loading notification
                loadingToast.hide();

                console.error("Error creating PDF:", error);
                showToast("Viga", xhr.responseJSON?.message || "PDF loomine ebaõnnestus", "error");
            }
        });
    });

    // Handler for "Redigeeri dokumenti" button
    $("#edit-doc-btn").off('click').on('click', function () {
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
            success: function (response) {
                console.log("Open for editing response:", response);

                if (response.success) {
                    showToast("Dokument avatud", "Dokument avatud redigeerimiseks", "success");
                } else {
                    showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error opening document:", error);
                showToast("Viga", xhr.responseJSON?.message || "Dokumendi avamine ebaõnnestus", "error");
            }
        });
    });

    // Handler for "Open templates folder" button
    $("#open-templates-folder-btn").off('click').on('click', function () {
        // Determine which folder to open based on current view
        const folderPath = viewingDrafts ? draftsDir : templatesDir;

        // Call API to open the folder
        $.ajax({
            url: `/api/v1/table/open-folder/${encodeURIComponent(folderPath)}`,
            method: "GET",
            success: function (response) {
                console.log("Open folder response:", response);
                if (response.success) {
                    showToast("Kaust avatud", `${viewingDrafts ? "Mustandite" : "Mallide"} kaust avati edukalt`, "success");
                } else {
                    showToast("Viga", response.message || "Kausta avamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
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
        selectedTemplateInfo = null;

        // Update status display
        updateTemplateStatusDisplay();

        // Disable the create document button until a template is selected
        $("#create-doc-btn").addClass("opacity-50 cursor-not-allowed")
            .removeClass("bg-green-500 hover:bg-green-600")
            .prop("disabled", true);

        // Call API to get document templates
        $.ajax({
            url: "/api/v1/table/document-templates",
            method: "GET",
            success: function (response) {
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
            error: function (xhr, status, error) {
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
        selectedTemplateInfo = null;

        // Update status display
        updateTemplateStatusDisplay();

        // Disable the create document button until a template is selected
        $("#create-doc-btn").addClass("opacity-50 cursor-not-allowed")
            .removeClass("bg-green-500 hover:bg-green-600")
            .prop("disabled", true);

        // Call API to get document drafts
        $.ajax({
            url: "/api/v1/table/document-drafts",
            method: "GET",
            success: function (response) {
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
            error: function (xhr, status, error) {
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

        // Filter out any temporary files
        items = items.filter(item => {
            // Filter out any files that look like temporary (~ or ~ prefix, tmp extension, etc.)
            return !item.name.startsWith('~') &&
                !item.name.endsWith('.tmp') &&
                !item.name.includes('~') &&
                !item.name.match(/^\~\$/);
        });

        items.forEach(item => {
            // Determine icon based on file extension
            let icon = getFileIcon(item.extension);

            // Determine type display name
            let typeDisplay = getFileTypeDisplay(item.extension);

            // Apply a specific class if this item is selected
            const isSelected = selectedTemplate === item.path;
            const rowClass = isSelected ?
                "bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800" :
                "hover:bg-gray-50 dark:hover:bg-gray-800";

            tableHtml += `
            <tr class="cursor-pointer template-row ${rowClass}" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}">
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">
                    ${icon}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm font-medium ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"}">
                    ${escapeHtml(item.name)}
                    ${isSelected ? '<i class="fas fa-check text-green-500 ml-2"></i>' : ''}
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
                        <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 use-template-btn" title="Kasuta" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}">
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
        $(".template-row").on('click', function () {
            const path = $(this).data('path');
            const name = $(this).data('name');
            selectTemplate(path, name);
        });

        // Set up action button click handlers
        $(".use-template-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            const name = $(this).data('name');
            selectTemplate(path, name);
        });

        $(".preview-template-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            previewTemplate(path);
        });

        // Add status display at the footer of the modal
        updateTemplateStatusDisplay();
    }

    // Function to update the template status display
    function updateTemplateStatusDisplay() {
        // Add or update the status display - target only the document templates modal
        if (!$("#document-templates-modal #template-status-display").length) {
            $("#document-templates-modal .modal-content").append(`
            <div id="template-status-display" class="bg-gray-100 dark:bg-gray-800 p-2 rounded mt-2 text-xs">
                <div class="selected-template-info"></div>
            </div>
        `);
        }

        // Update the content
        if (selectedTemplateInfo) {
            $("#document-templates-modal #template-status-display .selected-template-info").html(`
            <div class="flex items-center">
                <span class="font-semibold">Valitud mall:</span>
                <span class="ml-2">${escapeHtml(selectedTemplateInfo.name)}</span>
            </div>
        `);
            $("#document-templates-modal #template-status-display").removeClass("hidden");
        } else {
            $("#document-templates-modal #template-status-display .selected-template-info").html(`
            <div class="flex items-center text-gray-500">
                <i class="fas fa-info-circle mr-1"></i>
                <span>Palun valige dokumendimall</span>
            </div>
        `);
            $("#document-templates-modal #template-status-display").removeClass("hidden");
        }
    }

    // Function to select a template
    function selectTemplate(path, name) {
        // Highlight the selected template row
        $(".template-row").removeClass("bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800")
            .addClass("hover:bg-gray-50 dark:hover:bg-gray-800");
        $(".template-row td:nth-child(2)").removeClass("text-blue-600 dark:text-blue-400")
            .addClass("text-gray-900 dark:text-gray-100");
        $(".template-row td:nth-child(2) i.fa-check").remove();

        // Add highlighting to the selected row
        const selectedRow = $(`.template-row[data-path="${escapeHtmlAttr(path)}"]`);
        selectedRow.removeClass("hover:bg-gray-50 dark:hover:bg-gray-800")
            .addClass("bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800");
        selectedRow.find("td:nth-child(2)")
            .removeClass("text-gray-900 dark:text-gray-100")
            .addClass("text-blue-600 dark:text-blue-400")
            .append('<i class="fas fa-check text-green-500 ml-2"></i>');

        // Store selected template path and name for use with action buttons
        selectedTemplate = path;
        selectedTemplateInfo = {
            path: path,
            name: name
        };

        console.log("Selected template:", path, name);

        // Update status display
        updateTemplateStatusDisplay();

        // Enable the create document button
        $("#create-doc-btn").removeClass("opacity-50 cursor-not-allowed")
            .addClass("bg-green-500 hover:bg-green-600")
            .prop("disabled", false);
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
                success: function (response) {
                    console.log("Preview document response:", response);

                    if (response.success) {
                        showToast("Dokument avatud", "Dokument avatud eelvaateks", "success");
                    } else {
                        showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                    }
                },
                error: function (xhr, status, error) {
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
        window.showToast = function (title, message, type, duration = 3000) {
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
            toast.find('.notification-close').on('click', function () {
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
            toast.hide = function () {
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

    // Document templates modal close handlers
    $("#close-document-templates-modal, #exit-templates-btn").on('click', function () {
        // Clear the stored toimiku info when closing
        $("#document-templates-modal").removeData("toimiku-info");
        $("#document-templates-modal").addClass("hidden");
    });

    // Close modal when clicking backdrop
    $("#document-templates-backdrop").on('click', function () {
        $("#document-templates-modal").addClass("hidden");
    });

    // Prevent closing when clicking modal content
    $("#document-templates-modal .modal-content").on('click', function (e) {
        e.stopPropagation();
    });

    // Handler for "Koosta dokument" button
    $("#create-doc-btn").off('click').on('click', function () {
        console.log("Create document button clicked");

        // Check if a template is selected
        if (!selectedTemplate) {
            showToast("Viga", "Palun valige dokumendipõhi enne dokumendi koostamist", "error");
            return;
        }

        // Get selected row from the main grid
        let selectedRows = [];
        try {
            // Check if gridApi is accessible
            if (typeof gridApi !== 'undefined' && gridApi) {
                selectedRows = gridApi.getSelectedRows();
            } else {
                console.error("gridApi is not accessible");
            }
        } catch (e) {
            console.error("Error accessing gridApi:", e);
        }

        if (!selectedRows || selectedRows.length === 0) {
            showToast("Viga", "Palun valige andmete tabelist rida enne dokumendi koostamist", "error");
            return;
        }

        // Get the first selected row data
        const rowData = selectedRows[0];
        console.log("Selected row data for document:", rowData);

        // Check if 'võlgnik' column exists in any form
        let hasVolgnik = rowData.hasOwnProperty('võlgnik') ||
            rowData.hasOwnProperty('Võlgnik') ||
            rowData.hasOwnProperty('VÕLGNIK');

        if (!hasVolgnik) {
            console.warn("Warning: No 'võlgnik' column found in selected row. Generated filename might be generic.");
        }

        // Show loading notification
        const loadingToast = showToast("Dokumendi loomine", "Koostan dokumenti...", "info", -1);

        // Call API to generate document
        $.ajax({
            url: "/api/v1/table/generate-document",
            method: "POST",
            data: {
                template_path: selectedTemplate,
                row_data_json: JSON.stringify(rowData)
            },
            success: function (response) {
                // Hide loading notification
                loadingToast.hide();

                console.log("Document generation response:", response);

                if (response.success) {
                    showToast("Dokument loodud", `Dokument "${response.file_name}" on edukalt loodud mustandite kausta`, "success");

                    // If viewing drafts, refresh to show the new document
                    if (viewingDrafts) {
                        loadDocumentDrafts();
                    }

                    // Ask if user wants to open the document right away
                    setTimeout(() => {
                        if (confirm("Kas soovite loodud dokumenti kohe avada?")) {
                            openCreatedDocument(response.file_path);
                        }
                    }, 500);
                } else {
                    showToast("Viga", response.message || "Dokumendi loomine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                // Hide loading notification
                loadingToast.hide();

                console.error("Error creating document:", error);
                showToast("Viga", xhr.responseJSON?.message || "Dokumendi loomine ebaõnnestus", "error");
            }
        });
    });

    // Initialize the button state
    $("#create-doc-btn").addClass("opacity-50 cursor-not-allowed").prop("disabled", true);

    // Function to open the newly created document
    function openCreatedDocument(filePath) {
        $.ajax({
            url: "/api/v1/table/open-for-editing",
            method: "POST",
            data: {
                file_path: filePath
            },
            success: function (response) {
                console.log("Open document response:", response);
                if (!response.success) {
                    showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error opening document:", error);
                showToast("Viga", xhr.responseJSON?.message || "Dokumendi avamine ebaõnnestus", "error");
            }
        });
    }

    // Run on page load
    updateTemplateStatusDisplay();
});

// Add this error handling enhancement to the end of your dokumendi_pohjad.js file

// Enhanced error handling and debugging for document generation
$(document).ready(function() {
    console.log("Adding enhanced error handling for document generation");

    // Create a more robust click handler for the create-doc-btn
    $("#create-doc-btn").off('click').on('click', function() {
        console.log("Create document button clicked with enhanced error handling");

        try {
            // Step 1: Validate template selection
            if (!selectedTemplate) {
                console.error("No template selected");
                showToast("Viga", "Palun valige dokumendipõhi enne dokumendi koostamist", "error");
                return;
            }

            console.log("Selected template:", selectedTemplate);

            // Step 2: Get selected row data with better error handling
            let selectedRows = [];
            let gridApi = null;

            // Try multiple approaches to get the grid API
            if (typeof window.gridApi !== 'undefined') {
                console.log("Using window.gridApi");
                gridApi = window.gridApi;
            } else if (typeof window.appState !== 'undefined' && window.appState.gridApi) {
                console.log("Using window.appState.gridApi");
                gridApi = window.appState.gridApi;
            } else {
                console.error("gridApi not found in expected locations");
            }

            // Get selected rows if grid API is available
            if (gridApi && typeof gridApi.getSelectedRows === 'function') {
                selectedRows = gridApi.getSelectedRows();
                console.log("Found selected rows:", selectedRows.length);
            } else {
                console.error("gridApi or getSelectedRows is not available");
            }

            if (!selectedRows || selectedRows.length === 0) {
                console.error("No rows selected");
                showToast("Viga", "Palun valige andmete tabelist rida enne dokumendi koostamist", "error");
                return;
            }

            // Get the first selected row data
            const rowData = selectedRows[0];
            console.log("Selected row data:", rowData);

            // Step 3: Validate row data
            if (!rowData || typeof rowData !== 'object') {
                console.error("Invalid row data:", rowData);
                showToast("Viga", "Valitud rea andmed on vigased või puudulikud", "error");
                return;
            }

            // Step 4: Show loading notification with error handling
            let loadingToast = null;
            try {
                loadingToast = showToast("Dokumendi loomine", "Koostan dokumenti...", "info", -1);
            } catch (toastError) {
                console.error("Error showing toast:", toastError);
                // Continue without toast if it fails
            }

            // Step 5: Prepare request data with better serialization error handling
            let rowDataJson = null;
            try {
                rowDataJson = JSON.stringify(rowData);
                console.log("Row data serialized successfully, length:", rowDataJson.length);
            } catch (jsonError) {
                console.error("JSON serialization error:", jsonError);

                // Try to clean up row data by removing circular references and functions
                const cleanRowData = {};
                for (const key in rowData) {
                    if (typeof rowData[key] !== 'function' && key !== '__proto__') {
                        try {
                            // Test if value can be serialized
                            JSON.stringify(rowData[key]);
                            cleanRowData[key] = rowData[key];
                        } catch (e) {
                            console.log("Removed non-serializable property:", key);
                            cleanRowData[key] = String(rowData[key]);
                        }
                    }
                }

                try {
                    rowDataJson = JSON.stringify(cleanRowData);
                    console.log("Cleaned row data serialized successfully");
                } catch (secondJsonError) {
                    console.error("Failed to serialize even cleaned data:", secondJsonError);
                    if (loadingToast && loadingToast.hide) loadingToast.hide();
                    showToast("Viga", "Rea andmete töötlemisel tekkis viga", "error");
                    return;
                }
            }

            // Step 6: Send AJAX request with robust error handling
            $.ajax({
                url: "/api/v1/table/generate-document",
                method: "POST",
                data: {
                    template_path: selectedTemplate,
                    row_data_json: rowDataJson
                },
                timeout: 60000, // 1-minute timeout
                success: function(response) {
                    console.log("Document generation response:", response);

                    // Hide loading toast if it exists
                    if (loadingToast && typeof loadingToast.hide === 'function') {
                        try {
                            loadingToast.hide();
                        } catch (e) {
                            console.error("Error hiding toast:", e);
                        }
                    }

                    // Check for a valid response
                    if (response && response.success) {
                        showToast("Dokument loodud", `Dokument "${response.file_name || 'dokument'}" on edukalt loodud mustandite kausta`, "success");

                        // If viewing drafts, refresh to show the new document
                        if (typeof viewingDrafts !== 'undefined' && viewingDrafts && typeof loadDocumentDrafts === 'function') {
                            loadDocumentDrafts();
                        }

                        // Ask if user wants to open the document right away
                        setTimeout(function() {
                            if (confirm("Kas soovite loodud dokumenti kohe avada?")) {
                                openCreatedDocument(response.file_path);
                            }
                        }, 500);
                    } else {
                        // Handle success response with error status
                        const errorMsg = response && response.message ? response.message : "Dokumendi loomine ebaõnnestus tundmatul põhjusel";
                        console.error("Server returned error:", errorMsg);
                        showToast("Viga", errorMsg, "error");
                    }
                },
                error: function(xhr, status, error) {
                    // Hide loading toast if it exists
                    if (loadingToast && typeof loadingToast.hide === 'function') {
                        try {
                            loadingToast.hide();
                        } catch (e) {
                            console.error("Error hiding toast:", e);
                        }
                    }

                    // Log detailed error information
                    console.error("AJAX error:", {
                        status: status,
                        error: error,
                        responseText: xhr.responseText,
                        statusCode: xhr.status
                    });

                    // Try to parse error response
                    let errorMessage = "Dokumendi loomine ebaõnnestus";
                    try {
                        if (xhr.responseJSON && xhr.responseJSON.message) {
                            errorMessage = xhr.responseJSON.message;
                        } else if (xhr.responseText) {
                            const errorData = JSON.parse(xhr.responseText);
                            if (errorData.message) {
                                errorMessage = errorData.message;
                            } else if (errorData.detail) {
                                errorMessage = errorData.detail;
                            }
                        }
                    } catch (e) {
                        console.error("Error parsing error response:", e);
                        // Use status text as fallback
                        if (xhr.statusText) {
                            errorMessage += ": " + xhr.statusText;
                        }
                    }

                    // Show error message
                    showToast("Viga", errorMessage, "error");
                },
                complete: function() {
                    console.log("Document generation request completed");
                }
            });
        } catch (error) {
            // Global error handler for the entire function
            console.error("Unexpected error in document creation process:", error);
            showToast("Viga", "Dokumendi loomisel tekkis ootamatu viga: " + error.message, "error");
        }
    });

    // Enhanced function to open created document with better error handling
    window.openCreatedDocument = function(filePath) {
        if (!filePath) {
            console.error("No file path provided to openCreatedDocument");
            return;
        }

        console.log("Opening document:", filePath);

        $.ajax({
            url: "/api/v1/table/open-for-editing",
            method: "POST",
            data: {
                file_path: filePath
            },
            timeout: 30000, // 30-second timeout
            success: function(response) {
                console.log("Open document response:", response);
                if (!response.success) {
                    showToast("Viga", response.message || "Dokumendi avamine ebaõnnestus", "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error opening document:", {
                    status: status,
                    error: error,
                    responseText: xhr.responseText
                });
                showToast("Viga", xhr.responseJSON?.message || "Dokumendi avamine ebaõnnestus", "error");
            }
        });
    };

    // More robust implementation of template selection
    $("#templates-table-body").off("click", ".template-row").on("click", ".template-row", function() {
        try {
            // Remove highlighting from all rows
            $("#templates-table-body tr").removeClass("bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800")
                .addClass("hover:bg-gray-50 dark:hover:bg-gray-800");
            $("#templates-table-body tr td:nth-child(2)").removeClass("text-blue-600 dark:text-blue-400")
                .addClass("text-gray-900 dark:text-gray-100");
            $("#templates-table-body tr td:nth-child(2) i.fa-check").remove();

            // Add highlighting to the selected row
            $(this).removeClass("hover:bg-gray-50 dark:hover:bg-gray-800")
                .addClass("bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800");
            $(this).find("td:nth-child(2)")
                .removeClass("text-gray-900 dark:text-gray-100")
                .addClass("text-blue-600 dark:text-blue-400")
                .append('<i class="fas fa-check text-green-500 ml-2"></i>');

            // Store selected template path and name
            const templatePath = $(this).data('path');
            const templateName = $(this).find("td:nth-child(2)").text().trim();

            console.log("Setting selectedTemplate to:", templatePath);
            console.log("Setting selectedTemplateInfo to:", { path: templatePath, name: templateName });

            // Ensure these variables are set at global scope or properly accessible
            window.selectedTemplate = templatePath;
            window.selectedTemplateInfo = {
                path: templatePath,
                name: templateName
            };

            // Also set them at current scope level if they exist
            if (typeof selectedTemplate !== 'undefined') {
                selectedTemplate = templatePath;
            }
            if (typeof selectedTemplateInfo !== 'undefined') {
                selectedTemplateInfo = {
                    path: templatePath,
                    name: templateName
                };
            }

            // Ensure the create button is enabled
            $("#create-doc-btn").removeClass("opacity-50 cursor-not-allowed")
                .addClass("bg-green-500 hover:bg-green-600")
                .prop("disabled", false);

            // Update status display
            updateTemplateStatusDisplay();

            console.log("Template selection complete");
        } catch (error) {
            console.error("Error in template selection:", error);
        }
    });

    console.log("Enhanced error handling for document generation initialized");
});

// Fallback showToast implementation if it doesn't exist
if (typeof window.showToast !== 'function') {
    window.showToast = function(title, message, type = "info", duration = 3000) {
        console.log(`TOAST (${type}): ${title} - ${message}`);

        // Create a simple toast element
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