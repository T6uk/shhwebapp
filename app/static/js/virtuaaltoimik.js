// Virtuaaltoimik functionality
$(document).ready(function () {
    // Current toimiku number
    let currentToimikuNr = null;

    // Set up click handler for the Virtuaaltoimik button
    $("#virtual-file").off('click').on('click', function () {
        console.log("Virtuaaltoimik button clicked");

        // Get selected row(s)
        const selectedRows = gridApi ? gridApi.getSelectedRows() : null;

        if (!selectedRows || selectedRows.length === 0) {
            showToast("Viga", "Palun valige rida enne virtuaaltoimiku avamist", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Get the first selected row
        const selectedRow = selectedRows[0];
        console.log("Selected row data:", selectedRow);

        // Log all column names for debugging
        console.log("All available columns:", Object.keys(selectedRow));

        // Try to find Võlgnik and toimiku_nr separately
        let toimikuNr = null;
        let volgnikName = null;

// Find Võlgnik name
        const volgnikColumns = ['Võlgnik', 'võlgnik'];
        for (const col of volgnikColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                volgnikName = selectedRow[col];
                console.log(`Found võlgnik in column '${col}':`, volgnikName);
                break;
            }
        }

// Find toimiku_nr
        const toimikuColumns = ['toimiku_nr', 'toimikunr', 'toimiku nr'];
        for (const col of toimikuColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                toimikuNr = selectedRow[col];
                console.log(`Found toimiku_nr in column '${col}':`, toimikuNr);
                break;
            }
        }

        if (!volgnikName) {
            showToast("Viga", "Võlgnikku ei leitud valitud real", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        if (!toimikuNr) {
            showToast("Viga", "Toimiku numbrit ei leitud valitud real", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

// Sanitize the toimiku_nr for path usage
        const sanitizedToimikuNr = String(toimikuNr).replace(/[\/\\:*?"<>|]/g, '_');
        console.log("Sanitized toimiku_nr:", sanitizedToimikuNr);

// Save current toimiku number
        currentToimikuNr = sanitizedToimikuNr;

// Set the title with both the toimiku number and võlgnik name
        $("#toimik-title").text(`Virtuaaltoimik: ${sanitizedToimikuNr} (${volgnikName})`);

        // Show modal
        $("#virtuaaltoimik-modal").removeClass("hidden");

        // Close tools dropdown
        $("#tools-dropdown-menu").removeClass("show");

        // Load the files
        loadFolderContents(sanitizedToimikuNr);
    });

    // Close modal handlers
    $("#close-virtuaaltoimik-modal, #exit-virtuaaltoimik-btn").on('click', function () {
        $("#virtuaaltoimik-modal").addClass("hidden");
    });

    // Close modal when clicking backdrop
    $("#virtuaaltoimik-backdrop").on('click', function () {
        $("#virtuaaltoimik-modal").addClass("hidden");
    });

    // Prevent closing when clicking modal content
    $(".modal-content").on('click', function (e) {
        e.stopPropagation();
    });

    // Function to load folder contents
    function loadFolderContents(toimikuNr) {
        // Show loading state
        $("#files-table-body").html(`
        <tr>
          <td colspan="6" class="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            <div class="flex justify-center items-center space-x-2">
              <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Laadin faile...</span>
            </div>
          </td>
        </tr>
      `);

        // Hide empty and error states
        $("#files-empty-state").addClass("hidden");
        $("#files-error-state").addClass("hidden");

        // Call API to get folder contents
        $.ajax({
            url: `/api/v1/table/folder-contents/${encodeURIComponent(toimikuNr)}`,
            method: "GET",
            success: function (response) {
                console.log("Folder contents response:", response);

                if (response.success) {
                    // Check if there are items
                    if (response.items && response.items.length > 0) {
                        // Render files table
                        renderFilesTable(response.items);
                    } else {
                        // Show empty state
                        $("#files-table-body").empty();
                        $("#files-empty-state").removeClass("hidden");
                    }
                } else {
                    // Show error state
                    $("#files-table-body").empty();
                    $("#files-error-state").removeClass("hidden");
                    $("#files-error-message").text(response.error || "Proovige lehte värskendada");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error loading folder contents:", error);

                // Show error state
                $("#files-table-body").empty();
                $("#files-error-state").removeClass("hidden");
                $("#files-error-message").text(error || "Võrgu viga");
            }
        });
    }

    function renderFilesTable(items) {
        let tableHtml = '';

        items.forEach(item => {
            // Determine icon based on item type
            let icon = item.is_directory
                ? '<i class="fas fa-folder text-yellow-400"></i>'
                : getFileIcon(item.extension);

            // Determine type display name
            let typeDisplay = item.is_directory
                ? 'Kaust'
                : getFileTypeDisplay(item.extension, item.mime_type);

            tableHtml += `
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer file-row" data-path="${escapeHtml(item.path)}" data-is-dir="${item.is_directory}">
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
                <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 open-file-btn" title="Ava" data-path="${escapeHtml(item.path)}" data-is-dir="${item.is_directory}">
                  <i class="fas fa-${item.is_directory ? 'folder-open' : 'file-alt'}"></i>
                </button>
                <button class="text-red-500 hover:text-red-700 dark:text-red-400 delete-file-btn" title="Kustuta" data-path="${escapeHtml(item.path)}">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
        });

        // Update table body
        $("#files-table-body").html(tableHtml);

        // Set up click handlers for file rows
        $(".file-row").on('click', function () {
            const path = $(this).data('path');
            const isDir = $(this).data('is-dir');

            // Handle different clicks based on type
            openFileOrFolder(path, isDir);
        });

        // Set up action button click handlers
        $(".open-file-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            const isDir = $(this).data('is-dir');
            openFileOrFolder(path, isDir);
        });

        // Implement delete button functionality
        $(".delete-file-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            const row = $(this).closest("tr");
            const fileName = row.find("td:nth-child(2)").text();

            // Confirm deletion
            if (confirm(`Kas olete kindel, et soovite kustutada faili: ${fileName}?`)) {
                deleteFileOrFolder(path, row);
            }
        });
    }

    function deleteFileOrFolder(path, row) {
        // Show loading indicator
        const loadingToast = showToast("Kustutamine", "Kustutan faili...", "info", -1); // -1 for no auto-hide

        // Call the API to delete the file
        $.ajax({
            url: "/api/v1/table/file-operation",
            method: "POST",
            data: {
                operation: "delete",
                path: path
            },
            success: function (response) {
                console.log("Delete response:", response);

                // Close the loading toast
                if (loadingToast) loadingToast.hide();

                if (response.success) {
                    // Remove the row from the table
                    row.fadeOut(300, function () {
                        $(this).remove();

                        // If no more files, show empty state
                        if ($("#files-table-body tr.file-row").length === 0) {
                            $("#files-empty-state").removeClass("hidden");
                        }
                    });

                    // Show success message
                    showToast("Kustutatud", "Fail edukalt kustutatud", "success");
                } else {
                    // Show error message
                    showToast("Viga", response.message || "Kustutamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error deleting file:", error);

                // Close the loading toast
                if (loadingToast) loadingToast.hide();

                // Show error message
                showToast("Viga", "Kustutamine ebaõnnestus: " + (xhr.responseJSON?.detail || error), "error");
            }
        });
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
    }

    // Helper function to get file type display name
    function getFileTypeDisplay(extension, mimeType) {
        const typeMap = {
            '.pdf': 'PDF dokument',
            '.doc': 'Word dokument',
            '.docx': 'Word dokument',
            '.xls': 'Excel tabel',
            '.xlsx': 'Excel tabel',
            '.ppt': 'PowerPoint',
            '.pptx': 'PowerPoint',
            '.txt': 'Tekstifail',
            '.csv': 'CSV fail',
            '.jpg': 'JPEG pilt',
            '.jpeg': 'JPEG pilt',
            '.png': 'PNG pilt',
            '.gif': 'GIF pilt',
            '.zip': 'ZIP arhiiv',
            '.rar': 'RAR arhiiv',
            '.html': 'HTML fail',
            '.css': 'CSS fail',
            '.js': 'JavaScript fail',
        };

        return typeMap[extension.toLowerCase()] || (extension ? extension.substring(1).toUpperCase() + ' fail' : 'Tundmatu fail');
    }

    // Helper function to open a file or folder
    function openFileOrFolder(path, isDirectory) {
        if (isDirectory) {
            // For folders, we could either navigate inside the modal or open the folder directly
            openFolderDirectly(path);
        } else {
            // For files, attempt to open them
            openFileDirectly(path);
        }
    }

    // Function to open a folder directly
    function openFolderDirectly(path) {
        $.ajax({
            url: `/api/v1/table/open-folder/${encodeURIComponent(path)}`,
            method: "GET",
            success: function (response) {
                console.log("Open folder response:", response);
                if (response.success) {
                    showToast("Kaust avatud", "Kaust avati edukalt", "success");
                } else {
                    showToast("Viga", response.message || "Kausta avamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error opening folder:", error);
                showToast("Viga", "Kausta avamine ebaõnnestus", "error");
            }
        });
    }

    // Function to open a file directly
    function openFileDirectly(path) {
        // Show loading notification
        const loadingToast = showToast("Faili avamine", "Avan faili...", "info", 1000);

        // Call API to open the file
        $.ajax({
            url: "/api/v1/table/open-for-editing",
            method: "POST",
            data: {
                file_path: path
            },
            success: function (response) {
                console.log("Open file response:", response);
                if (response.success) {
                    showToast("Fail avatud", "Fail avati edukalt", "success");
                } else {
                    showToast("Viga", response.message || "Faili avamine ebaõnnestus", "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error opening file:", error);
                showToast("Viga", xhr.responseJSON?.message || "Faili avamine ebaõnnestus", "error");
            }
        });
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

    // Search functionality
    $("#files-search-input").on('input', function () {
        const searchTerm = $(this).val().toLowerCase();

        $(".file-row").each(function () {
            const fileName = $(this).find("td:nth-child(2)").text().toLowerCase();
            if (fileName.includes(searchTerm)) {
                $(this).removeClass("hidden");
            } else {
                $(this).addClass("hidden");
            }
        });
    });

    // Refresh button functionality
    $("#refresh-files-btn").on('click', function () {
        if (currentToimikuNr) {
            loadFolderContents(currentToimikuNr);
        }
    });

    // Folder open button functionality
    $("#folder-open-btn").on('click', function () {
        if (currentToimikuNr) {
            const folderPath = `c:\\virtuaaltoimik\\${currentToimikuNr}`;
            openFolderDirectly(folderPath);
        } else {
            showToast("Viga", "Toimiku number puudub", "error");
        }
    });

    $("#create-document-btn").off('click').on('click', function () {
        console.log("Create document button clicked from virtuaaltoimik");

        // Get the current toimiku info from the title
        const toimikuInfo = $("#toimik-title").text();

        // Show document templates modal
        $("#document-templates-modal").removeClass("hidden");

        // Set the title with toimiku info
        $("#document-templates-modal h3 span").text(`Dokumendipohjad - ${toimikuInfo}`);

        // Reset to templates view if needed (in case it was previously showing drafts)
        if (window.viewingDrafts) {
            window.viewingDrafts = false;
            $("#drafts-btn").html('<i class="fas fa-file-signature text-xs mr-1"></i><span>Mustandid</span>');
        }

        // Load templates if the function exists
        if (typeof loadDocumentTemplates === 'function') {
            loadDocumentTemplates();
        } else {
            console.error("loadDocumentTemplates function not found");
        }
    });

    $("#archive-btn").on('click', function () {
        showToast("Funktsioon arendamisel", "Arhiivi funktsioon on arendamisel", "info");
    });
});

// Improved date toggle filter for Virtuaaltoimik
$(document).ready(function () {
    // Track the current sort state - start with newest first (true)
    let showNewestFirst = true;

    // Set up click handler for the filter button
    $("#filter-files-btn").off('click').on('click', function () {
        console.log("Filter button clicked, current state:", showNewestFirst);

        // Toggle the sort direction
        showNewestFirst = !showNewestFirst;

        // Update the button text and icon to indicate the current sort direction
        if (showNewestFirst) {
            $(this).html('<i class="fas fa-sort-amount-down text-xs mr-1"></i><span>Uuemad ees</span>');
            $(this).addClass("bg-blue-500 text-white").removeClass("btn-secondary");
        } else {
            $(this).html('<i class="fas fa-sort-amount-up text-xs mr-1"></i><span>Vanemad ees</span>');
            $(this).addClass("bg-blue-500 text-white").removeClass("btn-secondary");
        }

        // Re-sort the file list
        sortFilesByDate(showNewestFirst);

        // Show a toast notification of the current sort order
        const message = showNewestFirst ? "Failid sorteeritud: uuemad ees" : "Failid sorteeritud: vanemad ees";
        showToast("Filter rakendatud", message, "info");
    });

    // Function to sort files by their modification date
    function sortFilesByDate(newestFirst) {
        console.log("Sorting files, newest first:", newestFirst);

        // Get all file rows from the table
        const tableBody = $("#files-table-body");
        const fileRows = tableBody.find("tr.file-row").toArray();

        console.log("Found file rows:", fileRows.length);

        if (fileRows.length <= 1) {
            console.log("Not enough rows to sort");
            return; // Nothing to sort
        }

        // Debug the first row's date to check date parsing
        if (fileRows.length > 0) {
            const firstRowDate = $(fileRows[0]).find("td:nth-child(5)").text();
            console.log("First row date string:", firstRowDate);
            const parsedDate = parseDateFromElement(firstRowDate);
            console.log("Parsed date:", parsedDate);
        }

        // Sort the rows based on the date in the 5th column (modification date)
        fileRows.sort(function (a, b) {
            const dateA = parseDateFromElement($(a).find("td:nth-child(5)").text());
            const dateB = parseDateFromElement($(b).find("td:nth-child(5)").text());

            console.log("Comparing dates:", dateA, dateB);

            if (isNaN(dateA) || isNaN(dateB)) {
                console.error("Invalid date comparison:", $(a).find("td:nth-child(5)").text(), $(b).find("td:nth-child(5)").text());
                return 0;
            }

            // Sort based on direction
            return newestFirst ? dateB - dateA : dateA - dateB;
        });

        // Remove current rows
        tableBody.find("tr.file-row").remove();

        // Re-append the sorted rows to the table
        $.each(fileRows, function (index, row) {
            tableBody.append(row);
        });

        console.log("Sorting complete");
    }

    // Helper function to parse the date from the displayed format "DD.MM.YYYY HH:MM"
    function parseDateFromElement(dateString) {
        try {
            console.log("Parsing date string:", dateString);

            if (!dateString || typeof dateString !== 'string') {
                console.error("Invalid date string:", dateString);
                return new Date(0);
            }

            const parts = dateString.trim().split(" ");
            if (parts.length !== 2) {
                console.error("Unexpected date format, expected 'DD.MM.YYYY HH:MM', got:", dateString);
                return new Date(0);
            }

            const dateParts = parts[0].split(".");
            const timeParts = parts[1].split(":");

            if (dateParts.length !== 3 || timeParts.length !== 2) {
                console.error("Invalid date or time parts:", dateParts, timeParts);
                return new Date(0);
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-based
            const year = parseInt(dateParts[2], 10);
            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);

            console.log("Parsed components:", {day, month, year, hour, minute});

            // Validate values
            if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
                console.error("Invalid numeric date parts");
                return new Date(0);
            }

            const dateObj = new Date(year, month, day, hour, minute);
            console.log("Created date object:", dateObj);
            return dateObj;
        } catch (e) {
            console.error("Error parsing date:", dateString, e);
            return new Date(0); // Return epoch date as fallback
        }
    }

    // Initialize the button state
    initializeFilterButton();

    // Initial setup - set the button to reflect the default state
    function initializeFilterButton() {
        const filterBtn = $("#filter-files-btn");
        if (showNewestFirst) {
            filterBtn.html('<i class="fas fa-filter text-xs mr-1"></i><span>Filter</span>');
        }
    }

    // Add a console log to verify the script is running
    console.log("Virtuaaltoimik filter script loaded");
});