// Direct implementation of the "vaata toimikut" functionality with path sanitization
$(document).ready(function () {
    console.log("Setting up view-file click handler with path sanitization");

    // Override the existing click handler
    $("#view-file").off('click').on('click', function () {
        console.log("view-file button clicked");

        // Get selected row(s)
        const selectedRows = gridApi ? gridApi.getSelectedRows() : null;
        console.log("Selected rows:", selectedRows);

        if (!selectedRows || selectedRows.length === 0) {
            console.error("No rows selected");
            showToast("Viga", "Palun valige rida enne toimiku avamist", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Get the first selected row
        const selectedRow = selectedRows[0];
        console.log("First selected row data:", selectedRow);

        // Log all column names for debugging
        console.log("Available columns in selected row:", Object.keys(selectedRow));

        // Find the toimiku_nr column (could be named differently)
        let toimikuNr = selectedRow.toimiku_nr;
        console.log("Initial toimiku_nr value:", toimikuNr);

        // If not found by that name, try to find a column that might contain toimiku number
        if (!toimikuNr) {
            // Try common variations
            const possibleColumns = ['toimiku_nr', 'toimikunr', 'toimiku nr'];

            for (const col of possibleColumns) {
                if (selectedRow[col]) {
                    toimikuNr = selectedRow[col];
                    console.log(`Found value in column '${col}':`, toimikuNr);
                    break;
                }
            }
        }

        if (!toimikuNr) {
            console.error("Could not find toimiku_nr in any expected column");
            showToast("Viga", "Toimiku numbrit ei leitud valitud real", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        console.log("Original toimiku_nr value:", toimikuNr);

        // Sanitize the toimiku_nr for use in a file path - replace slashes and other invalid chars
        const sanitizedToimikuNr = String(toimikuNr).replace(/[\/\\:*?"<>|]/g, '_');
        console.log("Sanitized toimiku_nr value:", sanitizedToimikuNr);

        // Call the API to open the folder with the sanitized value
        const apiUrl = `/api/v1/table/open-folder/${encodeURIComponent(sanitizedToimikuNr)}`;
        console.log("Calling API endpoint:", apiUrl);

        $.ajax({
            url: apiUrl,
            method: "GET",
            success: function (response) {
                console.log("API response:", response);
                if (response.success) {
                    showToast("Toimik avatud", `Toimik ${sanitizedToimikuNr} on avatud asukohas: ${response.path}`, "success");
                } else {
                    console.error("API reported error:", response.message);
                    showToast("Viga", `${response.message}. Asukoht: ${response.path || 'N/A'}`, "error");
                }
            },
            error: function (xhr, status, error) {
                console.error("AJAX error:", {status, error, response: xhr.responseText});
                try {
                    const errorResponse = xhr.responseJSON || JSON.parse(xhr.responseText);
                    console.error("Parsed error response:", errorResponse);
                    showToast("Viga", errorResponse?.detail || errorResponse?.message || "Viga toimiku avamisel", "error");
                } catch (e) {
                    console.error("Error parsing response:", e);
                    showToast("Viga", `Viga toimiku avamisel: ${error || status}`, "error");
                }
            }
        });

        $("#tools-dropdown-menu").removeClass("show");
    });

    console.log("view-file click handler setup complete");
});