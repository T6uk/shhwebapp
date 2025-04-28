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

        // Try common variations to find the toimiku_nr
        let toimikuNr = null;
        const possibleColumns = ['toimiku_nr', 'toimikunr', 'document_nr', 'dokumendi_nr', 'id', 'number', 'nr'];

        for (const col of possibleColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                toimikuNr = selectedRow[col];
                console.log(`Found value in column '${col}':`, toimikuNr);
                break;
            }
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

        // Set the title with the current toimiku number
        $("#toimik-title").text(`Virtuaaltoimik: ${sanitizedToimikuNr}`);

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

    // Rest of the JavaScript remains the same...
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
                ${item.is_directory ? '' : `
                <button class="text-green-500 hover:text-green-700 dark:text-green-400 download-file-btn" title="Lae alla" data-path="${escapeHtml(item.path)}">
                  <i class="fas fa-download"></i>
                </button>`
            }
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

        $(".download-file-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            showToast("Funktsioon arendamisel", "Allalaadimise funktsioon on arendamisel", "info");
        });

        $(".delete-file-btn").on('click', function (e) {
            e.stopPropagation(); // Prevent row click
            const path = $(this).data('path');
            if (confirm("Kas olete kindel, et soovite kustutada selle faili?")) {
                showToast("Funktsioon arendamisel", "Kustutamise funktsioon on arendamisel", "info");
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
        showToast("Funktsioon arendamisel", "Failide avamise funktsioon on arendamisel", "info");
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

    // Other buttons - placeholder functionality for now
    $("#create-document-btn").on('click', function () {
        showToast("Funktsioon arendamisel", "Dokumendi koostamise funktsioon on arendamisel", "info");
    });

    $("#archive-btn").on('click', function () {
        showToast("Funktsioon arendamisel", "Arhiivi funktsioon on arendamisel", "info");
    });

    $("#filter-files-btn").on('click', function () {
        showToast("Funktsioon arendamisel", "Filtreerimine on arendamisel", "info");
    });
});