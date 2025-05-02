// app/static/js/toimik_buttons_fix.js
// This file contains focused fixes for the Virtuaaltoimik modal buttons

$(document).ready(function() {
    console.log("Loading toimik_buttons_fix.js");

    // Fix for "Create document" button
    function fixCreateDocumentButton() {
        $("#create-document-btn").off('click').on('click', function() {
            console.log("Create document button clicked - from fix");

            // Get the current toimiku info from the toimik-title element
            const toimikTitle = $("#toimik-title").text();
            let toimikuInfo = toimikTitle.includes(":") ? toimikTitle.split(":")[1].trim() : toimikTitle;

            console.log("Extracted toimiku info:", toimikuInfo);

            // Show document templates modal
            $("#document-templates-modal").removeClass("hidden");

            // Store the toimiku info as data attribute
            $("#document-templates-modal").data("toimiku-info", toimikuInfo);

            // Set the title with toimiku info
            $("#doc-pohjad-title").text(`Dokumendipõhjad: ${toimikuInfo}`);

            // Try to load templates
            try {
                $.ajax({
                    url: "/api/v1/table/document-templates",
                    method: "GET",
                    success: function(response) {
                        console.log("Document templates response:", response);

                        if (response.success && response.templates) {
                            // Render templates
                            let tableHtml = '';

                            response.templates.forEach(template => {
                                // Create icon based on extension
                                const ext = template.extension || '.docx';
                                let icon = '<i class="fas fa-file-alt text-gray-500"></i>';

                                if (ext === '.docx' || ext === '.doc') {
                                    icon = '<i class="fas fa-file-word text-blue-500"></i>';
                                } else if (ext === '.pdf') {
                                    icon = '<i class="fas fa-file-pdf text-red-500"></i>';
                                }

                                tableHtml += `
                                <tr class="template-row hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" data-path="${template.path}">
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">
                                        ${icon}
                                    </td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                        ${template.name}
                                    </td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${ext.toUpperCase().substring(1)} fail
                                    </td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${template.formatted_size || '-'}
                                    </td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        ${template.modified || '-'}
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
                        } else {
                            // Show empty state
                            $("#templates-table-body").html(`
                                <tr>
                                    <td colspan="6" class="px-3 py-4 text-center">
                                        <div class="text-gray-500">Dokumendipohjad puuduvad</div>
                                    </td>
                                </tr>
                            `);
                        }
                    },
                    error: function(error) {
                        console.error("Error loading templates:", error);
                        $("#templates-table-body").html(`
                            <tr>
                                <td colspan="6" class="px-3 py-4 text-center">
                                    <div class="text-red-500">Viga dokumendipohjad laadimisel</div>
                                </td>
                            </tr>
                        `);
                    }
                });
            } catch (e) {
                console.error("Error in template loading:", e);
            }
        });
    }

    // Fix for "Filter" button
    function fixFilterButton() {
        // Track sorting state
        let isNewestFirst = true;

        $("#filter-files-btn").off('click').on('click', function() {
            console.log("Filter button clicked - from fix");

            // Toggle sorting direction
            isNewestFirst = !isNewestFirst;

            // Update button UI
            $(this).html(`
                <i class="fas fa-sort-amount-${isNewestFirst ? 'down' : 'up'} text-xs mr-1"></i>
                <span>${isNewestFirst ? 'Uuemad ees' : 'Vanemad ees'}</span>
            `);

            // Apply sorting directly
            const tableBody = $("#files-table-body");
            const rows = tableBody.find("tr.file-row").toArray();

            console.log(`Sorting ${rows.length} rows, newest first: ${isNewestFirst}`);

            if (rows.length > 1) {
                // Sort rows by date
                rows.sort(function(a, b) {
                    const dateColIndex = 4; // The column with date (5th column, index 4)
                    const dateStrA = $(a).find("td").eq(dateColIndex).text().trim();
                    const dateStrB = $(b).find("td").eq(dateColIndex).text().trim();

                    console.log(`Comparing dates: ${dateStrA} vs ${dateStrB}`);

                    // Parse Estonian date format: DD.MM.YYYY HH:MM
                    const parseDate = function(dateStr) {
                        try {
                            const [datePart, timePart] = dateStr.split(' ');
                            if (!datePart || !timePart) return 0;

                            const [day, month, year] = datePart.split('.').map(Number);
                            const [hour, minute] = timePart.split(':').map(Number);

                            // Validate all parts
                            if ([day, month, year, hour, minute].some(isNaN)) return 0;

                            // Create Date object (month is 0-based in JS)
                            return new Date(year, month-1, day, hour, minute);
                        } catch (e) {
                            console.error("Error parsing date:", dateStr, e);
                            return 0;
                        }
                    };

                    const dateA = parseDate(dateStrA);
                    const dateB = parseDate(dateStrB);

                    // Sort by direction
                    return isNewestFirst ? dateB - dateA : dateA - dateB;
                });

                // Remove all rows and re-add in sorted order
                tableBody.find("tr.file-row").remove();
                rows.forEach(row => tableBody.append(row));

                // Show success message
                if (typeof showToast === 'function') {
                    showToast("Filter rakendatud",
                              `Failid sorteeritud: ${isNewestFirst ? "uuemad" : "vanemad"} ees`,
                              "info");
                } else {
                    console.log(`Files sorted: ${isNewestFirst ? "newest" : "oldest"} first`);
                }
            } else {
                console.log("Not enough rows to sort");
            }
        });
    }

    // Apply fixes
    // Use setTimeout to ensure all DOM elements are ready
    setTimeout(function() {
        fixCreateDocumentButton();
        fixFilterButton();
        console.log("Button fixes applied");

        // Attach event handlers for virtuaaltoimik-modal visibility changes
        $("#virtuaaltoimik-modal").on("DOMSubtreeModified", function() {
            if ($(this).is(":visible") && !$(this).hasClass("hidden")) {
                console.log("Virtuaaltoimik modal is visible - reapplying button fixes");
                fixCreateDocumentButton();
                fixFilterButton();
            }
        });

        // Alternative approach with MutationObserver
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === "class") {
                    const modal = $("#virtuaaltoimik-modal");
                    if (modal.is(":visible") && !modal.hasClass("hidden")) {
                        console.log("Virtuaaltoimik modal class changed to visible - reapplying button fixes");
                        fixCreateDocumentButton();
                        fixFilterButton();
                    }
                }
            });
        });

        // Start observing the modal element
        observer.observe(document.getElementById("virtuaaltoimik-modal"), {
            attributes: true,
            attributeFilter: ["class"]
        });
    }, 500);
});