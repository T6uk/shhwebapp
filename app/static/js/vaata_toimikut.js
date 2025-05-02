// app/static/js/vaata_toimikut.js
// Robust implementation with improved debugging for row selection issues

$(document).ready(function() {
    console.log("Setting up view-file button handler with improved row detection");

    // Add a fallback toast function if not available
    if (typeof window.showToast !== 'function') {
        window.showToast = function(title, message, type, duration = 3000) {
            alert(`${title}: ${message}`);
            console.log(`TOAST: ${type} - ${title}: ${message}`);
            // Return an object with a hide method to prevent errors
            return { hide: function() {} };
        };
    }

    // Fix the view-file button handler
    $("#view-file").off('click').on('click', function() {
        console.log("view-file button clicked");

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
            showToast("Viga", "Palun valige rida enne toimiku avamist", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Log all data in the selected row for debugging
        const selectedRow = selectedRows[0];
        console.log("Selected row data:", selectedRow);
        console.log("Properties in row:", Object.keys(selectedRow).join(", "));

        // Find the toimiku_nr column (could be named differently)
        let toimikuNr = null;

        // Try common variations
        const possibleColumns = ['toimiku_nr', 'toimikunr', 'toimiku nr', 'id'];

        for (const col of possibleColumns) {
            if (selectedRow[col] !== undefined && selectedRow[col] !== null) {
                toimikuNr = selectedRow[col];
                console.log(`Found toimiku_nr in column '${col}':`, toimikuNr);
                break;
            }
        }

        // If still not found, try to find any field that might contain a toimiku number
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

        if (!toimikuNr) {
            console.error("Could not find toimiku_nr in any expected column");
            showToast("Viga", "Toimiku numbrit ei leitud valitud real", "error");
            $("#tools-dropdown-menu").removeClass("show");
            return;
        }

        // Sanitize the toimiku_nr for use in a file path
        const sanitizedToimikuNr = String(toimikuNr).replace(/[\/\\:*?"<>|]/g, '_');
        console.log("Sanitized toimiku_nr:", sanitizedToimikuNr);

        // Call the API to open the folder with the sanitized value
        const apiUrl = `/api/v1/table/open-folder/${encodeURIComponent(sanitizedToimikuNr)}`;
        console.log("Calling API endpoint:", apiUrl);

        $.ajax({
            url: apiUrl,
            method: "GET",
            success: function(response) {
                console.log("API response:", response);
                if (response.success) {
                    showToast("Toimik avatud", `Toimik ${sanitizedToimikuNr} on avatud asukohas: ${response.path}`, "success");
                } else {
                    showToast("Viga", `${response.message || "Toimiku avamine ebaõnnestus"}. Asukoht: ${response.path || 'N/A'}`, "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("AJAX error:", {status, error, response: xhr.responseText});
                showToast("Viga", "Toimiku avamine ebaõnnestus: " + error, "error");
            }
        });

        $("#tools-dropdown-menu").removeClass("show");
    });

    console.log("view-file click handler setup complete");
});