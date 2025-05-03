// app/static/js/enhanced-filters.js - Complete rewrite
// Enhanced filtering functionality for the data table application

// Global variables for filter management
window.activeFilters = [];
window.nextFilterId = 1;
window.lastChangeCheck = null;

document.addEventListener("DOMContentLoaded", function () {
    console.log("Initializing enhanced filters");

    // Initialize first filter row
    resetFilterPanel();

    // Set up event handlers for the filter panel
    setupFilterEventHandlers();

    console.log("Enhanced filters initialized");
});

function setupFilterEventHandlers() {
    // Add filter row button
    $("#add-filter-row").off("click").on("click", function () {
        console.log("Add filter row button clicked");
        addFilterRow();
    });

    // Apply filters button - fix the event handler with explicit debugging
    $("#apply-filters").off("click").on("click", function () {
        console.log("Rakenda (Apply filters) button clicked");
        try {
            // Call the apply filters function directly
            applyFilters();
        } catch (error) {
            console.error("Error applying filters:", error);
            showToast("Viga", "Filtrite rakendamisel tekkis viga: " + error.message, "error");
        }
    });

    // Clear filters button
    $("#clear-filters").off("click").on("click", function () {
        clearFilters();
    });

    // Handle filter row removal (using event delegation)
    $("#filter-container").off("click", ".filter-remove-btn").on("click", ".filter-remove-btn", function () {
        // Get the row and field being removed
        const $row = $(this).closest(".filter-row");
        const fieldName = $row.find(".filter-field").val();

        console.log("Removing filter row with field:", fieldName);

        // Check if this is the last filter row
        if ($("#filter-container .filter-row").length > 1) {
            // Remove the row from the UI
            $row.remove();

            // If there was a field selected, immediately update the grid filter model
            if (fieldName && window.gridApi) {
                // Get the current filter model
                const currentFilterModel = window.gridApi.getFilterModel() || {};

                // Remove this field from the filter model if it exists
                if (currentFilterModel[fieldName]) {
                    delete currentFilterModel[fieldName];

                    console.log("Updated filter model after removal:", currentFilterModel);

                    // Apply the updated filter model
                    window.gridApi.setFilterModel(Object.keys(currentFilterModel).length > 0 ? currentFilterModel : null);

                    // Refresh the grid data
                    window.gridApi.refreshInfiniteCache();

                    // Update status text after data loads
                    setTimeout(function () {
                        const displayedRowCount = window.gridApi.getDisplayedRowCount();
                        const isFiltered = Object.keys(currentFilterModel).length > 0;
                        $("#status").text(isFiltered ?
                            `Filtreeritud: ${displayedRowCount} kirjet` :
                            `${displayedRowCount} kirjet`);
                    }, 500);

                    showToast("Filter eemaldatud", `Filter "${fieldName}" on eemaldatud`, "info");
                }
            }
        } else {
            // If it's the last one, just reset it instead of removing
            resetFilterRow($row);

            // Also clear the grid filter if it had a field
            if (fieldName && window.gridApi) {
                window.gridApi.setFilterModel(null);
                window.gridApi.refreshInfiniteCache();

                setTimeout(function () {
                    const displayedRowCount = window.gridApi.getDisplayedRowCount();
                    $("#status").text(`${displayedRowCount} kirjet`);
                }, 500);

                showToast("Filtrid eemaldatud", "Kõik filtrid on eemaldatud", "info");
            } else {
                showToast("Info", "Vähemalt üks filtri rida peab alles jääma", "info");
            }
        }
    });

    // Handle column selection change
    $("#filter-container").off("change", ".filter-field").on("change", ".filter-field", function () {
        updateFilterOperators(this);
    });

    // Handle operator change
    $("#filter-container").off("change", ".filter-operator").on("change", ".filter-operator", function () {
        updateFilterValueInput($(this).closest(".filter-row"));
    });

    // Save filter button
    $("#save-filter").off("click").on("click", function () {
        showSaveFilterModal();
    });

    // Debug filter button
    $("#debug-filter-btn").off("click").on("click", function () {
        debugFilter();
    });

    // Save filter modal buttons
    $("#save-filter-button").off("click").on("click", function () {
        processSaveFilter();
    });

    $("#cancel-save-filter").off("click").on("click", function () {
        $("#save-filter-modal").addClass("hidden");
    });

    // Filter modal backdrop
    $("#save-filter-modal-backdrop").off("click").on("click", function () {
        $("#save-filter-modal").addClass("hidden");
    });

    // Prevent modal closing when clicking content
    $("#save-filter-modal .modal-content").off("click").on("click", function (e) {
        e.stopPropagation();
    });
}

function resetFilterPanel() {
    // Clear filter container
    $("#filter-container").empty();
    window.nextFilterId = 1;

    // Add initial filter row
    addFilterRow();
}

function resetFilterRow($row) {
    // Reset field to empty selection
    $row.find(".filter-field").val("");

    // Reset operator to default options
    $row.find(".filter-operator").empty().append(`
        <option value="contains">Sisaldab</option>
        <option value="equals">Võrdub</option>
        <option value="notEqual">Ei võrdu</option>
        <option value="startsWith">Algab</option>
        <option value="endsWith">Lõpeb</option>
        <option value="blank">Tühi</option>
        <option value="notBlank">Mitte tühi</option>
    `);

    // Reset value input to default state
    $row.find(".filter-value-container").html(`
        <input type="text" class="filter-input" placeholder="Filtri väärtus">
    `);

    // Apply dark mode styling if needed
    if (window.isDarkMode) {
        $row.find("input, select").addClass("bg-gray-700 text-gray-200 border-gray-600")
            .removeClass("bg-white text-gray-700 border-gray-200");
    }
}

function addFilterRow() {
    const newRowId = window.nextFilterId++;
    const newRow = $(`
        <div class="filter-row" data-id="${newRowId}">
            <select class="filter-select filter-field">
                <option value="">Vali veerg...</option>
            </select>

            <select class="filter-select filter-operator">
                <option value="contains">Sisaldab</option>
                <option value="equals">Võrdub</option>
                <option value="notEqual">Ei võrdu</option>
                <option value="startsWith">Algab</option>
                <option value="endsWith">Lõpeb</option>
                <option value="blank">Tühi</option>
                <option value="notBlank">Mitte tühi</option>
            </select>

            <div class="filter-value-container">
                <input type="text" class="filter-input" placeholder="Filtri väärtus">
            </div>

            <button class="filter-remove-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `);

    $("#filter-container").append(newRow);

    // Add column options
    updateFilterFields();

    // Update dark mode styling if active
    if (window.isDarkMode) {
        updateDynamicElements();
    }
}

function updateFilterFields() {
    // Use columnDefs from window if available
    if (!window.columnDefs || window.columnDefs.length === 0) {
        console.log("No column definitions available");
        return;
    }

    // Clear existing options except the first placeholder
    $(".filter-field").each(function () {
        const placeholder = $(this).children().first();
        $(this).empty().append(placeholder);
    });

    // Add column options to each filter field dropdown
    window.columnDefs.forEach(function (col) {
        const option = $("<option>")
            .val(col.field)
            .text(col.headerName);

        $(".filter-field").each(function () {
            $(this).append(option.clone());
        });
    });
}

function updateFilterOperators(fieldSelect) {
    const $row = $(fieldSelect).closest('.filter-row');
    const $operatorSelect = $row.find('.filter-operator');
    const selectedField = $(fieldSelect).val();

    if (!selectedField) return;

    // Find column definition - check both possible locations
    const columnDefs = window.columnDefs || (window.appState ? window.appState.columnDefs : []);
    const column = columnDefs.find(col => col.field === selectedField);

    if (!column) {
        console.warn(`Column definition not found for field: ${selectedField}`);
        return;
    }

    // Clear existing options
    $operatorSelect.empty();

    // Get column type from the column definition
    const colDef = column.colDef || {};
    const colType = column.type || colDef.type || 'string';

    console.log(`Determining operators for field '${selectedField}' with type '${colType}'`);

    // Define operator options based on column type
    let operators = [];

    // Text-based columns
    if (colType.includes('char') || colType.includes('text') || colType === 'string' ||
        colType === 'varchar' || colType === 'character varying') {
        console.log("Using text operators");
        operators = [
            {value: 'contains', label: 'Sisaldab'},
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'startsWith', label: 'Algab'},
            {value: 'endsWith', label: 'Lõpeb'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    }
    // Numeric columns
    else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') ||
        colType.includes('double') || colType.includes('decimal') || colType === 'number') {
        console.log("Using numeric operators");
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'greaterThan', label: 'Suurem kui'},
            {value: 'greaterThanOrEqual', label: 'Suurem või võrdne'},
            {value: 'lessThan', label: 'Väiksem kui'},
            {value: 'lessThanOrEqual', label: 'Väiksem või võrdne'},
            {value: 'inRange', label: 'Vahemikus'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    }
    // Date columns
    else if (colType.includes('date') || colType.includes('timestamp') || colType === 'date' ||
        colType === 'timestamp with time zone' || colType === 'timestamp without time zone') {
        console.log("Using date operators");
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'greaterThan', label: 'Hiljem kui'},
            {value: 'lessThan', label: 'Varem kui'},
            {value: 'inRange', label: 'Ajavahemikus'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    }
    // Default/fallback
    else {
        console.log("Using default operators for unknown type");
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'contains', label: 'Sisaldab'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    }

    // Add options to select
    operators.forEach(op => {
        $operatorSelect.append(`<option value="${op.value}">${op.label}</option>`);
    });

    // Update value input based on selected column and operator
    updateFilterValueInput($row);

    console.log(`Updated filter operators for field '${selectedField}' (${colType}) with ${operators.length} operators`);
}

function updateFilterValueInput($row) {
    const selectedField = $row.find('.filter-field').val();
    const selectedOperator = $row.find('.filter-operator').val();

    if (!selectedField) return;

    // Find column definition
    const columnDefs = window.columnDefs || (window.appState ? window.appState.columnDefs : []);
    const column = columnDefs.find(col => col.field === selectedField);
    if (!column) return;

    const colType = column.type || 'string';
    const $valueContainer = $row.find('.filter-value-container');

    // Clear existing inputs
    $valueContainer.empty();

    // For blank/notBlank operators, no input is needed - fix for these special operators
    if (selectedOperator === 'blank' || selectedOperator === 'notBlank') {
        $valueContainer.html(`
            <div class="text-gray-400 italic text-xs">
                ${selectedOperator === 'blank' ?
            'Näitab tühjad ja NULL väärtused' :
            'Näitab mitteväärtused (ei tühi ega NULL)'}
            </div>
        `);
        console.log(`No input field needed for ${selectedOperator} operator`);
        return;
    }

    // For inRange operator, we need two inputs
    if (selectedOperator === 'inRange') {
        if (colType.includes('date') || colType.includes('timestamp')) {
            console.log("Creating date range inputs");
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="date" class="compact-input filter-from flex-1" placeholder="Alates">
                    <input type="date" class="compact-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        } else {
            console.log("Creating numeric range inputs");
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="number" class="compact-input filter-from flex-1" placeholder="Alates">
                    <input type="number" class="compact-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        }
        return;
    }

    // For different column types, create appropriate inputs
    if (colType.includes('date') || colType.includes('timestamp')) {
        console.log("Creating date input");
        $valueContainer.html(`<input type="date" class="compact-input w-full filter-input" placeholder="Vali kuupäev">`);
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') ||
        colType.includes('double') || colType.includes('float') || colType === 'number') {
        console.log("Creating numeric input");
        $valueContainer.html(`<input type="number" class="compact-input w-full filter-input" placeholder="Sisesta number">`);
    } else {
        // For text fields, use a regular text input
        console.log("Creating text input");
        $valueContainer.html(`<input type="text" class="compact-input w-full filter-input" placeholder="Filtri väärtus">`);

        // Fetch values for suggestions if available
        fetchFilterValues(selectedField)
            .then(response => {
                if (response && response.values && response.values.length > 0 && response.values.length <= 100) {
                    // If column has relatively few values, show a datalist for suggestions
                    const datalistId = `datalist-${selectedField.replace(/[^a-zA-Z0-9]/g, '-')}`;

                    console.log(`Creating datalist with ${response.values.length} values`);

                    let html = `<input type="text" class="compact-input w-full filter-input" placeholder="Filtri väärtus" list="${datalistId}">`;
                    html += `<datalist id="${datalistId}">`;

                    response.values.forEach(value => {
                        if (value !== null && value !== '') {
                            html += `<option value="${value.replace(/"/g, '&quot;')}">`;
                        }
                    });

                    html += '</datalist>';
                    $valueContainer.html(html);
                }
            })
            .catch(error => {
                console.error("Error loading filter values:", error);
            });
    }

    // Apply dark mode styling if needed
    if (window.isDarkMode) {
        $valueContainer.find('input').addClass('bg-gray-700 text-gray-200 border-gray-600')
            .removeClass('bg-white text-gray-700 border-gray-200');
    }
}

function applyFilters() {
    console.log("applyFilters function called");

    // Create a simple object to hold our filters
    let filterModel = {};
    let hasValidFilters = false;
    let appliedFilters = [];

    // Process each filter row
    $(".filter-row").each(function () {
        const field = $(this).find(".filter-field").val();
        if (!field) {
            console.log("Skipping row - no field selected");
            return; // Skip if no field selected
        }

        const operator = $(this).find(".filter-operator").val();
        console.log(`Processing filter: field=${field}, operator=${operator}`);

        let displayValue = ""; // For the toast message

        // Handle different operators
        if (operator === 'blank') {
            filterModel[field] = {
                type: 'blank'
                // No filter value needed for blank
            };
            displayValue = "on tühi";
            hasValidFilters = true;
            console.log(`Added blank filter for ${field}`);
        } else if (operator === 'notBlank') {
            filterModel[field] = {
                type: 'notBlank'
                // No filter value needed for notBlank
            };
            displayValue = "ei ole tühi";
            hasValidFilters = true;
            console.log(`Added notBlank filter for ${field}`);
        } else if (operator === 'inRange') {
            const fromValue = $(this).find(".filter-from").val();
            const toValue = $(this).find(".filter-to").val();

            if (!fromValue && !toValue) {
                console.log("Skipping inRange filter - no values provided");
                return; // Skip empty ranges
            }

            filterModel[field] = {
                type: 'inRange',
                filter: {
                    from: fromValue || null,
                    to: toValue || null
                }
            };
            displayValue = `between ${fromValue || '?'} and ${toValue || '?'}`;
            hasValidFilters = true;
            console.log(`Added inRange filter for ${field}: from=${fromValue}, to=${toValue}`);
        } else {
            // For all other operators
            const value = $(this).find(".filter-input").val();
            if (!value && operator !== 'blank' && operator !== 'notBlank') {
                console.log(`Skipping ${operator} filter - no value provided`);
                return; // Skip empty values
            }

            filterModel[field] = {
                type: operator,
                filter: value
            };
            displayValue = `${operator} "${value}"`;
            hasValidFilters = true;
            console.log(`Added ${operator} filter for ${field}: ${value}`);
        }

        // Add to applied filters for display
        if (hasValidFilters) {
            // Find column display name
            const columnDefs = window.columnDefs || (window.appState ? window.appState.columnDefs : null);
            const columnDef = columnDefs ? columnDefs.find(c => c.field === field) : null;
            const fieldDisplay = columnDef ? columnDef.headerName : field;
            appliedFilters.push(`${fieldDisplay} ${displayValue}`);
        }
    });

    // Log the filter model
    console.log("Final filter model:", JSON.stringify(filterModel, null, 2));
    console.log("Applied filters:", appliedFilters);

    // Check if we have any valid filters
    if (Object.keys(filterModel).length === 0) {
        console.log("No valid filters created");
        hasValidFilters = false;
    }

    // Apply to grid - ensure we use the correct API access
    const gridApi = window.gridApi || (window.appState ? window.appState.gridApi : null);

    if (gridApi) {
        // Set the filter model
        if (typeof gridApi.setFilterModel === 'function') {
            console.log("Setting filter model on grid API");
            gridApi.setFilterModel(hasValidFilters ? filterModel : null);
        } else {
            console.error("gridApi.setFilterModel is not a function");
            showToast("Viga", "Filtrite rakendamine ebaõnnestus: tabeli API funktsioon puudub", "error");
            return;
        }

        // Request fresh data
        if (typeof gridApi.refreshInfiniteCache === 'function') {
            console.log("Refreshing grid data with infinite cache");
            gridApi.refreshInfiniteCache();
        } else if (typeof gridApi.refreshServerSideStore === 'function') {
            console.log("Refreshing grid data with server-side store");
            gridApi.refreshServerSideStore({purge: true});
        } else {
            console.error("No grid refresh method found");
            showToast("Viga", "Andmete värskendamine ebaõnnestus: tabeli API funktsioon puudub", "error");
            return;
        }

        // Update status after data loads
        setTimeout(function () {
            try {
                const displayedRowCount = gridApi.getDisplayedRowCount();
                $("#status").text(hasValidFilters ?
                    `Filtreeritud: ${displayedRowCount} kirjet` :
                    `${displayedRowCount} kirjet`);
                console.log(`Updated status with ${displayedRowCount} rows`);
            } catch (error) {
                console.error("Error updating status:", error);
            }
        }, 500);
    } else {
        console.error("Grid API not available for filtering");
        showToast("Viga", "Tabeli API pole saadaval", "error");
        return;
    }

    // Show feedback
    if (hasValidFilters) {
        const filterCount = Object.keys(filterModel).length;
        showToast("Filtrid rakendatud",
            filterCount === 1 ? appliedFilters[0] : `${filterCount} filtrit rakendatud`,
            "success");
    } else {
        showToast("Filtrid eemaldatud", "Kõik filtrid on eemaldatud", "info");
    }

    // Close filter panel if configured
    if ($("#auto-close-filters").prop("checked")) {
        $("#filter-panel").removeClass("show");
        // Also resize the table container after closing
        setTimeout(function () {
            if (typeof window.appFunctions.resizeTableContainer === 'function') {
                window.appFunctions.resizeTableContainer();
            } else if (typeof resizeTableContainer === 'function') {
                resizeTableContainer();
            }
        }, 200);
    }

    // Update active filters display
    try {
        setTimeout(function () {
            if (typeof window.appFunctions.updateActiveFiltersDisplay === 'function') {
                window.appFunctions.updateActiveFiltersDisplay();
            } else if (typeof updateActiveFiltersDisplay === 'function') {
                updateActiveFiltersDisplay();
            }
        }, 500);
    } catch (error) {
        console.error("Error updating active filters display:", error);
    }

    console.log("Filter application complete");
}

function removeFilterAndApply(fieldName) {
    if (!window.gridApi || !fieldName) return;

    // Get current filter model
    const filterModel = window.gridApi.getFilterModel() || {};

    // Remove this field
    if (filterModel[fieldName]) {
        delete filterModel[fieldName];

        // Apply the updated model
        window.gridApi.setFilterModel(Object.keys(filterModel).length > 0 ? filterModel : null);
        window.gridApi.refreshInfiniteCache();

        // Show confirmation
        showToast("Filter eemaldatud", `Filter "${fieldName}" on eemaldatud`, "info");

        // Update status text
        setTimeout(function () {
            const displayedRowCount = window.gridApi.getDisplayedRowCount();
            const isFiltered = Object.keys(filterModel).length > 0;
            $("#status").text(isFiltered ?
                `Filtreeritud: ${displayedRowCount} kirjet` :
                `${displayedRowCount} kirjet`);
        }, 500);
    }
}

function updateActiveFiltersDisplay() {
    console.log("Updating active filters display");

    // Get the grid API from the correct location
    const gridApi = window.gridApi || (window.appState ? window.appState.gridApi : null);

    if (!gridApi) {
        console.error("Grid API not available for updating active filters display");
        return;
    }

    // Get the current filter model
    let filterModel;
    try {
        filterModel = gridApi.getFilterModel() || {};
        console.log("Current filter model:", filterModel);
    } catch (error) {
        console.error("Error getting filter model:", error);
        filterModel = {};
    }

    const $container = $("#active-filters-container");
    const $filtersDisplay = $("#active-filters");

    // Clear current filters
    $filtersDisplay.empty();

    // If we have filters, show them
    if (Object.keys(filterModel).length > 0) {
        Object.entries(filterModel).forEach(([field, config]) => {
            // Find column display name
            const columnDef = window.columnDefs ? window.columnDefs.find(c => c.field === field) : null;
            const fieldDisplay = columnDef ? columnDef.headerName : field;

            // Create display text
            let displayText = fieldDisplay + ": ";

            if (config.type === 'blank') {
                displayText += "on tühi";
            } else if (config.type === 'notBlank') {
                displayText += "ei ole tühi";
            } else if (config.type === 'inRange' && config.filter) {
                const from = config.filter.from || '?';
                const to = config.filter.to || '?';
                displayText += `vahemikus ${from} - ${to}`;
            } else if (config.filter) {
                // Map operator to human readable form
                let opText = config.type;
                switch (config.type) {
                    case 'equals':
                        opText = "=";
                        break;
                    case 'notEqual':
                        opText = "≠";
                        break;
                    case 'contains':
                        opText = "sisaldab";
                        break;
                    case 'startsWith':
                        opText = "algab";
                        break;
                    case 'endsWith':
                        opText = "lõpeb";
                        break;
                    case 'greaterThan':
                        opText = ">";
                        break;
                    case 'greaterThanOrEqual':
                        opText = "≥";
                        break;
                    case 'lessThan':
                        opText = "<";
                        break;
                    case 'lessThanOrEqual':
                        opText = "≤";
                        break;
                }
                displayText += `${opText} "${config.filter}"`;
            }

            // Create filter badge with remove button
            const $badge = $(`
                <div class="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 
                           px-2 py-1 rounded-full text-xs font-medium">
                    <span>${displayText}</span>
                    <button class="remove-filter-btn text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                            data-field="${field}">
                        <i class="fas fa-times-circle"></i>
                    </button>
                </div>
            `);

            $filtersDisplay.append($badge);
        });

        // Show the container
        $container.removeClass("hidden");
        console.log("Displayed active filters");
    } else {
        // Hide the container if no filters
        $container.addClass("hidden");
        console.log("No active filters to display");
    }

    // Set up click handlers for remove buttons
    $(".remove-filter-btn").click(function () {
        const field = $(this).data("field");
        console.log("Remove filter clicked for field:", field);
        removeFilterAndApply(field);

        // Update the display after removal
        setTimeout(updateActiveFiltersDisplay, 100);
    });
}

function clearFilters() {
    // Reset the filter panel UI
    resetFilterPanel();

    // Clear grid filters if grid is available
    if (window.gridApi) {
        window.gridApi.setFilterModel(null);
        window.gridApi.refreshInfiniteCache();

        // Update status after data loads
        setTimeout(function () {
            const displayedRowCount = window.gridApi.getDisplayedRowCount();
            $("#status").text(`${displayedRowCount} kirjet`);
        }, 500);
    }
    setTimeout(updateActiveFiltersDisplay, 100);

    showToast("Filtrid lähtestatud", "Kõik filtrid on eemaldatud", "info");
}

function debugFilter() {
    // Get the current filter model from the grid
    const filterModel = window.gridApi ? window.gridApi.getFilterModel() : {};
    const debugOutput = $('#debug-output');

    // Show UI form state
    let formState = [];
    $("#filter-container .filter-row").each(function (index) {
        const field = $(this).find(".filter-field").val() || "(empty)";
        const operator = $(this).find(".filter-operator").val() || "(empty)";

        let value;
        if (operator === 'blank' || operator === 'notBlank') {
            value = "(no value needed)";
        } else if (operator === 'inRange') {
            const from = $(this).find(".filter-from").val() || "(empty)";
            const to = $(this).find(".filter-to").val() || "(empty)";
            value = `From: ${from}, To: ${to}`;
        } else {
            value = $(this).find(".filter-input").val() || "(empty)";
        }

        formState.push(`Row ${index + 1}: Field: ${field}, Operator: ${operator}, Value: ${value}`);
    });

    // Display the debug info
    debugOutput.removeClass('hidden');
    debugOutput.html(
        '<strong>UI Filter Form State:</strong><br>' +
        formState.join('<br>') +
        '<br><br>' +
        '<strong>Current Grid Filter Model:</strong><br>' +
        JSON.stringify(filterModel, null, 2) +
        '<br><br>' +
        '<strong>Will send to server as:</strong><br>' +
        'filter_model=' + encodeURIComponent(JSON.stringify(filterModel))
    );

    // Make a test request
    $.ajax({
        url: "/api/v1/table/data",
        method: "GET",
        data: {
            start_row: 0,
            end_row: 10,
            filter_model: JSON.stringify(filterModel)
        },
        success: function (response) {
            debugOutput.append(
                '<br><br><strong>Server response:</strong><br>' +
                'Rows returned: ' + response.rowData.length + '<br>' +
                'Total matching rows: ' + response.rowCount
            );
        },
        error: function (xhr) {
            debugOutput.append(
                '<br><br><strong>Error from server:</strong><br>' +
                xhr.responseText
            );
        }
    });
}

function showSaveFilterModal() {
    // Get current filter settings
    if (!window.gridApi) return;

    const filterModel = window.gridApi.getFilterModel() || {};

    if (Object.keys(filterModel).length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Clear form
    $("#filter-name").val("");
    $("#filter-description").val("");
    $("#filter-public").prop("checked", false);

    // Show modal
    $("#save-filter-modal").removeClass("hidden");
}

function processSaveFilter() {
    if (!window.gridApi) return;

    const name = $("#filter-name").val().trim();
    const description = $("#filter-description").val().trim();
    const isPublic = $("#filter-public").prop("checked");

    // Validate inputs
    if (!name) {
        showToast("Nõutud väli puudub", "Palun sisestage filtri nimi", "error");
        return;
    }

    // Get current filter model
    const filterModel = window.gridApi.getFilterModel() || {};

    if (Object.keys(filterModel).length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Show loading indicator
    $("#save-filter-button").html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvestamine...');
    $("#save-filter-button").prop("disabled", true);

    // Call API to save filter
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('filter_model', JSON.stringify(filterModel));
    formData.append('is_public', isPublic);

    $.ajax({
        url: "/api/v1/table/save-filter",
        method: "POST",
        data: formData,
        processData: false,
        contentType: false,
        success: function (response) {
            // Hide modal
            $("#save-filter-modal").addClass("hidden");

            // Show success message
            showToast("Filter salvestatud", `Filter "${name}" edukalt salvestatud`, "success");

            // Refresh filters list
            if (typeof loadSavedFiltersList === 'function') {
                loadSavedFiltersList();
            }
        },
        error: function (xhr) {
            console.error("Error saving filter:", xhr.responseJSON);
            showToast("Viga filtri salvestamisel", xhr.responseJSON?.detail || "Palun proovige uuesti", "error");
        },
        complete: function () {
            // Reset button
            $("#save-filter-button").html('<i class="fas fa-save mr-2"></i> Salvesta filter');
            $("#save-filter-button").prop("disabled", false);
        }
    });
}

function updateDynamicElements() {
    if (window.isDarkMode) {
        $(".filter-row input, .filter-row select").addClass("bg-gray-700 text-gray-200 border-gray-600")
            .removeClass("bg-white text-gray-700 border-gray-200");
    } else {
        $(".filter-row input, .filter-row select").removeClass("bg-gray-700 text-gray-200 border-gray-600")
            .addClass("bg-white text-gray-700 border-gray-200");
    }
}

// For compatibility with other modules - these names are used in events.js and other places
window.addEnhancedFilterRow = addFilterRow;
window.applyEnhancedFilters = applyFilters;

// Expose all functions globally
window.resetFilterPanel = resetFilterPanel;
window.resetFilterRow = resetFilterRow;
window.addFilterRow = addFilterRow;
window.updateFilterFields = updateFilterFields;
window.updateFilterOperators = updateFilterOperators;
window.updateFilterValueInput = updateFilterValueInput;
window.applyFilters = applyFilters;
window.removeFilterAndApply = removeFilterAndApply;
window.updateActiveFiltersDisplay = updateActiveFiltersDisplay;
window.clearFilters = clearFilters;
window.debugFilter = debugFilter;
window.setupFilterEventHandlers = setupFilterEventHandlers;
window.showSaveFilterModal = showSaveFilterModal;
window.processSaveFilter = processSaveFilter;
window.updateDynamicElements = updateDynamicElements;