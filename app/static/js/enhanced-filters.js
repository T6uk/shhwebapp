// app/static/js/enhanced-filters.js - Complete rewrite
// Enhanced filtering functionality for the data table application

// Global variables for filter management
let activeFilters = [];
let nextFilterId = 1;
let lastChangeCheck = null;

document.addEventListener("DOMContentLoaded", function () {
    // Initialize first filter row
    resetFilterPanel();

    // Set up event handlers for the filter panel
    setupFilterEventHandlers();
});

function setupFilterEventHandlers() {
    // Add filter row button
    $("#add-filter-row").off("click").on("click", function () {
        addFilterRow();
    });

    // Apply filters button
    $("#apply-filters").off("click").on("click", function () {
        applyFilters();
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
            if (fieldName && gridApi) {
                // Get the current filter model
                const currentFilterModel = gridApi.getFilterModel() || {};

                // Remove this field from the filter model if it exists
                if (currentFilterModel[fieldName]) {
                    delete currentFilterModel[fieldName];

                    console.log("Updated filter model after removal:", currentFilterModel);

                    // Apply the updated filter model
                    gridApi.setFilterModel(Object.keys(currentFilterModel).length > 0 ? currentFilterModel : null);

                    // Refresh the grid data
                    gridApi.refreshInfiniteCache();

                    // Update status text after data loads
                    setTimeout(function () {
                        const displayedRowCount = gridApi.getDisplayedRowCount();
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
            if (fieldName && gridApi) {
                gridApi.setFilterModel(null);
                gridApi.refreshInfiniteCache();

                setTimeout(function () {
                    const displayedRowCount = gridApi.getDisplayedRowCount();
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
    nextFilterId = 1;

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
    if (isDarkMode) {
        $row.find("input, select").addClass("bg-gray-700 text-gray-200 border-gray-600")
            .removeClass("bg-white text-gray-700 border-gray-200");
    }
}

function addFilterRow() {
    const newRowId = nextFilterId++;
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
    if (isDarkMode) {
        updateDynamicElements();
    }
}

function updateFilterFields() {
    if (!columnDefs || columnDefs.length === 0) return;

    // Clear existing options except the first placeholder
    $(".filter-field").each(function () {
        const placeholder = $(this).children().first();
        $(this).empty().append(placeholder);
    });

    // Add column options to each filter field dropdown
    columnDefs.forEach(function (col) {
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

    // Find column definition
    const column = columnDefs.find(col => col.field === selectedField);
    if (!column) return;

    // Clear existing options
    $operatorSelect.empty();

    // Get column type or default to string
    const colDef = column.colDef || {};
    const colType = column.type || colDef.type || 'string';

    // Define operators based on type
    let operators = [];

    // Text-based columns
    if (colType.includes('char') || colType.includes('text') || colType === 'string') {
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
        colType.includes('double') || colType === 'number') {
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
    else if (colType.includes('date') || colType.includes('timestamp')) {
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

    // Update value input based on selected options
    updateFilterValueInput($row);
}

function updateFilterValueInput($row) {
    const selectedField = $row.find('.filter-field').val();
    const selectedOperator = $row.find('.filter-operator').val();

    if (!selectedField) return;

    // Find column definition
    const column = columnDefs.find(col => col.field === selectedField);
    if (!column) return;

    // Get column type
    const colDef = column.colDef || {};
    const colType = column.type || colDef.type || 'string';

    const $valueContainer = $row.find('.filter-value-container');

    // Clear existing inputs
    $valueContainer.empty();

    // For blank/notBlank operators, no input is needed
    if (selectedOperator === 'blank' || selectedOperator === 'notBlank') {
        $valueContainer.html('<div class="text-gray-400 italic">Väärtust pole vaja</div>');
        return;
    }

    // For inRange operator, we need two inputs
    if (selectedOperator === 'inRange') {
        if (colType.includes('date') || colType.includes('timestamp')) {
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="date" class="filter-input filter-from flex-1" placeholder="Alates">
                    <input type="date" class="filter-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        } else {
            $valueContainer.html(`
                <div class="flex gap-2 flex-1">
                    <input type="number" class="filter-input filter-from flex-1" placeholder="Alates">
                    <input type="number" class="filter-input filter-to flex-1" placeholder="Kuni">
                </div>
            `);
        }
        return;
    }

    // For different column types, create appropriate inputs
    if (colType.includes('date') || colType.includes('timestamp')) {
        $valueContainer.html(`<input type="date" class="filter-input" placeholder="Vali kuupäev">`);
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') ||
        colType.includes('double') || colType === 'number') {
        $valueContainer.html(`<input type="number" class="filter-input" placeholder="Sisesta number">`);
    } else {
        // Default to text input
        $valueContainer.html(`<input type="text" class="filter-input" placeholder="Filtri väärtus">`);
    }

    // Apply dark mode styling if needed
    if (isDarkMode) {
        $valueContainer.find('input').addClass('bg-gray-700 text-gray-200 border-gray-600')
            .removeClass('bg-white text-gray-700 border-gray-200');
    }
}

function applyFilters() {
    // Collect the current state of filters
    let filterModel = {};
    let hasValidFilters = false;
    let appliedFilters = [];

    // Process each filter row
    $(".filter-row").each(function() {
        const field = $(this).find(".filter-field").val();
        if (!field) return; // Skip if no field selected

        const operator = $(this).find(".filter-operator").val();
        let displayValue = ""; // For the toast message

        // Handle different operators
        if (operator === 'blank') {
            filterModel[field] = {
                type: 'blank'
            };
            displayValue = "is blank";
            hasValidFilters = true;
        }
        else if (operator === 'notBlank') {
            filterModel[field] = {
                type: 'notBlank'
            };
            displayValue = "is not blank";
            hasValidFilters = true;
        }
        else if (operator === 'inRange') {
            const fromValue = $(this).find(".filter-from").val();
            const toValue = $(this).find(".filter-to").val();

            if (!fromValue && !toValue) return; // Skip empty ranges

            filterModel[field] = {
                type: 'inRange',
                filter: {
                    from: fromValue || null,
                    to: toValue || null
                }
            };
            displayValue = `between ${fromValue || '?'} and ${toValue || '?'}`;
            hasValidFilters = true;
        }
        else {
            // For all other operators
            const value = $(this).find(".filter-input").val();
            if (!value) return; // Skip empty values

            filterModel[field] = {
                type: operator,
                filter: value
            };
            displayValue = `${operator} "${value}"`;
            hasValidFilters = true;
        }

        // Add to applied filters for display
        if (hasValidFilters) {
            const columnDef = columnDefs.find(c => c.field === field);
            const fieldDisplay = columnDef ? columnDef.headerName : field;
            appliedFilters.push(`${fieldDisplay} ${displayValue}`);
        }
    });

    // Log the filter model
    console.log("Applying filter model:", filterModel);
    console.log("Applied filters:", appliedFilters);

    // Apply to grid
    if (gridApi) {
        // Set the filter model
        gridApi.setFilterModel(hasValidFilters ? filterModel : null);

        // Request fresh data
        gridApi.refreshInfiniteCache();

        // Update status after data loads
        setTimeout(function() {
            const displayedRowCount = gridApi.getDisplayedRowCount();
            $("#status").text(hasValidFilters ?
                `Filtreeritud: ${displayedRowCount} kirjet` :
                `${displayedRowCount} kirjet`);
        }, 500);
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
    }
    setTimeout(updateActiveFiltersDisplay, 100);
}

function removeFilterAndApply(fieldName) {
    if (!gridApi || !fieldName) return;

    // Get current filter model
    const filterModel = gridApi.getFilterModel() || {};

    // Remove this field
    if (filterModel[fieldName]) {
        delete filterModel[fieldName];

        // Apply the updated model
        gridApi.setFilterModel(Object.keys(filterModel).length > 0 ? filterModel : null);
        gridApi.refreshInfiniteCache();

        // Show confirmation
        showToast("Filter eemaldatud", `Filter "${fieldName}" on eemaldatud`, "info");

        // Update status text
        setTimeout(function() {
            const displayedRowCount = gridApi.getDisplayedRowCount();
            const isFiltered = Object.keys(filterModel).length > 0;
            $("#status").text(isFiltered ?
                `Filtreeritud: ${displayedRowCount} kirjet` :
                `${displayedRowCount} kirjet`);
        }, 500);
    }
}

function updateActiveFiltersDisplay() {
    if (!gridApi) return;

    const filterModel = gridApi.getFilterModel() || {};
    const $container = $("#active-filters-container");
    const $filtersDisplay = $("#active-filters");

    // Clear current filters
    $filtersDisplay.empty();

    // If we have filters, show them
    if (Object.keys(filterModel).length > 0) {
        Object.entries(filterModel).forEach(([field, config]) => {
            // Find column display name
            const columnDef = columnDefs.find(c => c.field === field);
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
                switch(config.type) {
                    case 'equals': opText = "="; break;
                    case 'notEqual': opText = "≠"; break;
                    case 'contains': opText = "sisaldab"; break;
                    case 'startsWith': opText = "algab"; break;
                    case 'endsWith': opText = "lõpeb"; break;
                    case 'greaterThan': opText = ">"; break;
                    case 'greaterThanOrEqual': opText = "≥"; break;
                    case 'lessThan': opText = "<"; break;
                    case 'lessThanOrEqual': opText = "≤"; break;
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
    } else {
        // Hide the container if no filters
        $container.addClass("hidden");
    }

    // Set up click handlers for remove buttons
    $(".remove-filter-btn").click(function() {
        const field = $(this).data("field");
        removeFilterAndApply(field);

        // Update the display after removal
        setTimeout(updateActiveFiltersDisplay, 100);
    });
}

function clearFilters() {
    // Reset the filter panel UI
    resetFilterPanel();

    // Clear grid filters if grid is available
    if (gridApi) {
        gridApi.setFilterModel(null);
        gridApi.refreshInfiniteCache();

        // Update status after data loads
        setTimeout(function () {
            const displayedRowCount = gridApi.getDisplayedRowCount();
            $("#status").text(`${displayedRowCount} kirjet`);
        }, 500);
    }
    setTimeout(updateActiveFiltersDisplay, 100);

    showToast("Filtrid lähtestatud", "Kõik filtrid on eemaldatud", "info");
}

function debugFilter() {
    // Get the current filter model from the grid
    const filterModel = gridApi ? gridApi.getFilterModel() : {};
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