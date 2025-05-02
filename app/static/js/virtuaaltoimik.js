// app/static/js/virtuaaltoimik.js
// Robust implementation with improved debugging for row selection issues

$(document).ready(function () {
    console.log("Setting up virtual-file button handler with improved row detection");

    // Current toimiku number for the modal
    let currentToimikuNr = null;
    let showNewestFirst = true;

    // Add a fallback toast function if not available
    if (typeof window.showToast !== 'function') {
        window.showToast = function (title, message, type, duration = 3000) {
            alert(`${title}: ${message}`);
            console.log(`TOAST: ${type} - ${title}: ${message}`);
            // Return an object with a hide method to prevent errors
            return {
                hide: function () {
                }
            };
        };
    }

    // Fix the virtual-file button handler
    $("#virtual-file").off('click').on('click', function () {
        console.log("virtual-file button clicked");

        // Try multiple ways to get gridApi
        let gridApi = null;

        // Option 1: Try window.gridApi directly
        if (window.gridApi) {
            console.log("Found gridApi on window object");
            gridApi = window.gridApi;
        }
        // Option 2: Try window.appState
        else if (window.appState && window.appState.gridApi) {
            console.log("Found gridApi in appState");
            gridApi = window.appState.gridApi;
        }
        // Option 3: Try to get it from the grid element directly
        else {
            console.log("Attempting to get gridApi from DOM element");
            const gridDiv = document.querySelector('#data-table');
            if (gridDiv && gridDiv.__agGridApi) {
                gridApi = gridDiv.__agGridApi;
                console.log("Found gridApi in DOM element");
            }
        }

        // Check if we found a gridApi
        if (!gridApi) {
            console.error("Could not find gridApi");
            showToast("Viga", "Tabeli API-d ei leitud. Värskendage lehte ja proovige uuesti.", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Debug the selection state
        console.log("Grid API found, checking selected rows");
        console.log("Selection mode:", gridApi.getSelectionModel ? gridApi.getSelectionModel() : "Unknown");

        // Try multiple ways to get selected rows
        let selectedRows = [];

        // Method 1: getSelectedRows (most common)
        if (typeof gridApi.getSelectedRows === 'function') {
            selectedRows = gridApi.getSelectedRows();
            console.log("Using getSelectedRows() method:", selectedRows);
        }
        // Method 2: getSelectedNodes and map to rows
        else if (typeof gridApi.getSelectedNodes === 'function') {
            const selectedNodes = gridApi.getSelectedNodes();
            console.log("Selected nodes:", selectedNodes);
            selectedRows = selectedNodes.map(node => node.data);
            console.log("Mapped selected nodes to rows:", selectedRows);
        }

        // Workaround: If no row is selected, get the first visible row as fallback
        if (!selectedRows || selectedRows.length === 0) {
            console.warn("No rows selected, checking for visible rows");

            // Try to get the first displayed row as a fallback
            if (typeof gridApi.getDisplayedRowAtIndex === 'function') {
                const firstNode = gridApi.getDisplayedRowAtIndex(0);
                if (firstNode && firstNode.data) {
                    console.log("Using first visible row as fallback:", firstNode.data);
                    showToast("Info", "Automaatselt valiti esimene rida, kuna ühtegi rida polnud valitud.", "info");
                    selectedRows = [firstNode.data];
                }
            }
        }

        // Final check for selected rows
        if (!selectedRows || selectedRows.length === 0) {
            console.error("No selected rows found after all attempts");
            showToast("Viga", "Palun valige rida enne virtuaaltoimiku avamist", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Log all data in the selected row for debugging
        const selectedRow = selectedRows[0];
        console.log("Selected row data:", selectedRow);
        console.log("Properties in row:", Object.keys(selectedRow).join(", "));

        // Try to find Võlgnik and toimiku_nr separately
        let toimikuNr = null;
        let volgnikName = null;

        // Find Võlgnik name - try common variations
        const volgnikColumns = ['Võlgnik', 'võlgnik', 'volgnik', 'VÕLGNIK', 'isik', 'nimi'];
        for (const col of volgnikColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                volgnikName = selectedRow[col];
                console.log(`Found võlgnik in column '${col}':`, volgnikName);
                break;
            }
        }

        // Find toimiku_nr - try common variations
        const toimikuColumns = ['toimiku_nr', 'toimikunr', 'toimiku nr', 'id'];
        for (const col of toimikuColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                toimikuNr = selectedRow[col];
                console.log(`Found toimiku_nr in column '${col}':`, toimikuNr);
                break;
            }
        }

        // If toimiku_nr still not found, try to find any field that might contain it
        if (!toimikuNr) {
            console.log("Trying to find toimiku_nr in any field with pattern matching");
            for (const key in selectedRow) {
                const value = selectedRow[key];
                if (value && typeof value === 'string' &&
                    (key.toLowerCase().includes('toimik') ||
                        key.toLowerCase().includes('number') ||
                        /^\d+\/\d+\/\d+$/.test(value))) {
                    toimikuNr = value;
                    console.log(`Found potential toimiku_nr in column '${key}':`, toimikuNr);
                    break;
                }
            }
        }

        // If võlgnik name still not found, use a placeholder or any string field value
        if (!volgnikName) {
            console.log("No võlgnik field found, using fallback");
            // Try to find any string field that could be a name
            for (const key in selectedRow) {
                const value = selectedRow[key];
                if (value && typeof value === 'string' &&
                    (key.toLowerCase().includes('nimi') ||
                        key.toLowerCase().includes('name') ||
                        value.includes(' '))) {
                    volgnikName = value;
                    console.log(`Found potential võlgnik name in column '${key}':`, volgnikName);
                    break;
                }
            }

            // If still not found, use a placeholder
            if (!volgnikName) {
                volgnikName = "Tundmatu";
                console.log("Using placeholder for võlgnik name");
            }
        }

        if (!toimikuNr) {
            console.error("Could not find toimiku_nr in any column");
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

    // Function to render files table
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

    // Helper functions
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

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function openFileOrFolder(path, isDirectory) {
        if (isDirectory) {
            // For folders, open directly
            openFolderDirectly(path);
        } else {
            // For files, attempt to open them
            openFileDirectly(path);
        }
    }

    function openFolderDirectly(path) {
        $.ajax({
            url: `/api/v1/table/open-folder/${encodeURIComponent(path)}`,
            method: "GET",
            success: function (response) {
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

    function deleteFileOrFolder(path, row) {
        // Show loading indicator
        const loadingToast = showToast("Kustutamine", "Kustutan faili...", "info", -1);

        // Call the API to delete the file
        $.ajax({
            url: "/api/v1/table/file-operation",
            method: "POST",
            data: {
                operation: "delete",
                path: path
            },
            success: function (response) {
                // Close the loading toast
                if (loadingToast && loadingToast.hide) loadingToast.hide();

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
                // Close the loading toast
                if (loadingToast && loadingToast.hide) loadingToast.hide();

                // Show error message
                showToast("Viga", "Kustutamine ebaõnnestus: " + (xhr.responseJSON?.detail || error), "error");
            }
        });
    }

    // Set up modal close handlers
    $("#close-virtuaaltoimik-modal, #exit-virtuaaltoimik-btn").off('click').on('click', function () {
        $("#virtuaaltoimik-modal").addClass("hidden");
    });

    // Close modal when clicking backdrop
    $("#virtuaaltoimik-backdrop").off('click').on('click', function () {
        $("#virtuaaltoimik-modal").addClass("hidden");
    });

    // Prevent closing when clicking modal content
    $(".modal-content").off('click').on('click', function (e) {
        e.stopPropagation();
    });

    // Folder open button functionality
    $("#folder-open-btn").off('click').on('click', function () {
        if (currentToimikuNr) {
            const folderPath = `c:\\virtuaaltoimik\\${currentToimikuNr}`;
            openFolderDirectly(folderPath);
        } else {
            showToast("Viga", "Toimiku number puudub", "error");
        }
    });

    // Refresh button functionality
    $("#refresh-files-btn").off('click').on('click', function () {
        if (currentToimikuNr) {
            loadFolderContents(currentToimikuNr);
        }
    });

    console.log("virtual-file click handler setup complete with improved row detection");

    $("#create-document-btn").off('click').on('click', function () {
        console.log("Create document button clicked from virtuaaltoimik");

        // Get the current toimiku info from the toimik-title element
        const toimikTitle = $("#toimik-title").text();

        // Extract the toimiku information - format is "Virtuaaltoimik: number (name)"
        let toimikuInfo = "";
        if (toimikTitle.includes(":")) {
            // Extract the part after the colon
            toimikuInfo = toimikTitle.split(":")[1].trim();
        } else {
            toimikuInfo = toimikTitle;
        }

        console.log("Extracted toimiku info:", toimikuInfo);

        // Show document templates modal
        $("#document-templates-modal").removeClass("hidden");

        // Store the toimiku info as data attribute for persistence
        $("#document-templates-modal").data("toimiku-info", toimikuInfo);

        // Set the title with toimiku info
        $("#doc-pohjad-title").text(`Dokumendipõhjad: ${toimikuInfo}`);

        // Load templates if the function exists
        if (typeof window.loadDocumentTemplates === 'function') {
            window.loadDocumentTemplates();
        } else if (typeof loadDocumentTemplates === 'function') {
            loadDocumentTemplates();
        } else {
            // Try to find and execute the function from dokumendi_pohjad.js
            console.log("Looking for loadDocumentTemplates function...");

            // Load templates directly if function can't be found
            $.ajax({
                url: "/api/v1/table/document-templates",
                method: "GET",
                success: function (response) {
                    console.log("Document templates loaded directly:", response);

                    if (response.success && response.templates) {
                        renderTemplatesTable(response.templates);
                    } else {
                        showToast("Viga", "Dokumendipohjad ei leitud", "error");
                    }
                },
                error: function (error) {
                    console.error("Error loading document templates:", error);
                    showToast("Viga", "Viga dokumendipohjad laadimisel", "error");
                }
            });
        }
    });

// Add this helper function to render the templates if needed
    function renderTemplatesTable(templates) {
        if (!templates || templates.length === 0) {
            $("#templates-table-body").html('<tr><td colspan="6" class="text-center py-4">Dokumendipohjad puuduvad</td></tr>');
            return;
        }

        let tableHtml = '';
        templates.forEach(template => {
            tableHtml += `
        <tr class="template-row hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" data-path="${template.path}">
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">
                <i class="fas fa-file-word text-blue-500"></i>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                ${template.name}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                Word dokument
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${template.formatted_size}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${template.modified}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                <div class="flex space-x-2">
                    <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 use-template-btn" title="Kasuta">
                        <i class="fas fa-file-alt"></i>
                    </button>
                    <button class="text-green-500 hover:text-green-700 dark:text-green-400 preview-template-btn" title="Eelvaade">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
        });

        $("#templates-table-body").html(tableHtml);
    }

    // Improved filter button handler for file sorting
    $("#filter-files-btn").off('click').on('click', function () {
        console.log("Filter button clicked, current state:", showNewestFirst);

        // Toggle the sort direction
        showNewestFirst = !showNewestFirst;

        // Update the button text and icon
        if (showNewestFirst) {
            $(this).html('<i class="fas fa-sort-amount-down text-xs mr-1"></i><span>Uuemad ees</span>');
        } else {
            $(this).html('<i class="fas fa-sort-amount-up text-xs mr-1"></i><span>Vanemad ees</span>');
        }

        // Apply sorting
        sortFilesByDate(showNewestFirst);

        // Show notification
        showToast("Filter rakendatud",
            showNewestFirst ? "Failid sorteeritud: uuemad ees" : "Failid sorteeritud: vanemad ees",
            "info");
    });

// Function to sort files by date
    function sortFilesByDate(newestFirst) {
        console.log("Sorting files, newest first:", newestFirst);

        const tableBody = $("#files-table-body");
        const fileRows = tableBody.find("tr.file-row").toArray();

        console.log("Found file rows:", fileRows.length);

        if (fileRows.length <= 1) {
            console.log("Not enough rows to sort");
            return; // Nothing to sort
        }

        // Debug the first row's date
        if (fileRows.length > 0) {
            const firstRowDate = $(fileRows[0]).find("td:nth-child(5)").text();
            console.log("First row date string:", firstRowDate);
        }

        // Sort the rows based on the date in the 5th column (modification date)
        fileRows.sort(function (a, b) {
            const dateA = parseDateFromElement($(a).find("td:nth-child(5)").text());
            const dateB = parseDateFromElement($(b).find("td:nth-child(5)").text());

            console.log("Comparing dates:", dateA, dateB);

            // Sort based on direction
            return newestFirst ? dateB - dateA : dateA - dateB;
        });

        // Remove current rows
        tableBody.find("tr.file-row").remove();

        // Re-append the sorted rows
        $.each(fileRows, function (index, row) {
            tableBody.append(row);
        });

        console.log("Sorting complete");
    }

// Helper function to parse Estonian date format "DD.MM.YYYY HH:MM"
    function parseDateFromElement(dateString) {
        try {
            console.log("Parsing date string:", dateString);

            if (!dateString || typeof dateString !== 'string') {
                return new Date(0); // Return epoch date as fallback
            }

            const parts = dateString.trim().split(" ");
            if (parts.length !== 2) {
                return new Date(0);
            }

            const dateParts = parts[0].split(".");
            const timeParts = parts[1].split(":");

            if (dateParts.length !== 3 || timeParts.length !== 2) {
                return new Date(0);
            }

            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-based
            const year = parseInt(dateParts[2], 10);
            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);

            // Validate values
            if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
                return new Date(0);
            }

            return new Date(year, month, day, hour, minute);
        } catch (e) {
            console.error("Error parsing date:", dateString, e);
            return new Date(0); // Return epoch date as fallback
        }
    }
});