// app/static/js/enhanced-filters.js
// Enhanced filtering functionality for the data table application

// Global variables for filter management
let activeFilters = [];
let nextFilterId = 2; // Start at 2 since we have one filter row by default
let lastChangeCheck = null;

// Function to fetch column values for filter dropdowns
function fetchFilterValues(columnName, searchTerm = '') {
    return $.ajax({
        url: `/api/v1/table/filter-values/${columnName}`,
        method: "GET",
        data: {
            search: searchTerm
        },
        dataType: "json"
    });
}

// Function to save a filter
function saveFilter(name, description, filterModel, isPublic) {
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', description);
    formData.append('filter_model', JSON.stringify(filterModel));
    formData.append('is_public', isPublic);

    return $.ajax({
        url: "/api/v1/table/save-filter",
        method: "POST",
        data: formData,
        processData: false,
        contentType: false
    });
}

// Function to load saved filters
function loadSavedFilters() {
    return $.ajax({
        url: "/api/v1/table/saved-filters",
        method: "GET",
        dataType: "json"
    });
}

// Function to get a specific saved filter
function getSavedFilter(filterId) {
    return $.ajax({
        url: `/api/v1/table/saved-filter/${filterId}`,
        method: "GET",
        dataType: "json"
    });
}

// Function to delete a saved filter
function deleteSavedFilter(filterId) {
    return $.ajax({
        url: `/api/v1/table/saved-filter/${filterId}`,
        method: "DELETE"
    });
}

// Enhanced filter row function
function addEnhancedFilterRow() {
    const nextId = nextFilterId++;
    const newRow = $(`
        <div class="filter-row" data-id="${nextId}">
            <select class="filter-select filter-field" onchange="updateFilterOperators(this)">
                <option value="">Vali veerg...</option>
            </select>

            <select class="filter-select filter-operator" onchange="updateFilterValueInput($(this).closest('.filter-row'))">
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

    // Add column options to the new filter field
    updateFilterFields();
}

// Function to update filter operators based on selected column type
function updateFilterOperators(fieldSelect) {
    const $row = $(fieldSelect).closest('.filter-row');
    const $operatorSelect = $row.find('.filter-operator');
    const selectedField = $(fieldSelect).val();

    if (!selectedField) return;

    // Find the column definition
    const column = columnDefs.find(col => col.field === selectedField);

    if (!column) return;

    // Clear existing options
    $operatorSelect.empty();

    // Get column type from the column definition
    const colType = column.type || 'string';

    // Define operator options based on column type
    let operators = [];

    if (colType.includes('char') || colType.includes('text')) {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'contains', label: 'Sisaldab'},
            {value: 'notContains', label: 'Ei sisalda'},
            {value: 'startsWith', label: 'Algab'},
            {value: 'endsWith', label: 'Lõpeb'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') || colType.includes('double')) {
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
    } else if (colType.includes('date') || colType.includes('timestamp')) {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
            {value: 'greaterThan', label: 'Hiljem kui'},
            {value: 'lessThan', label: 'Varem kui'},
            {value: 'inRange', label: 'Ajavahemikus'},
            {value: 'blank', label: 'Tühi'},
            {value: 'notBlank', label: 'Mitte tühi'}
        ];
    } else {
        operators = [
            {value: 'equals', label: 'Võrdub'},
            {value: 'notEqual', label: 'Ei võrdu'},
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
}

// Function to update the value input based on selected column and operator
function updateFilterValueInput($row) {
    const selectedField = $row.find('.filter-field').val();
    const selectedOperator = $row.find('.filter-operator').val();

    if (!selectedField) return;

    // Find the column definition
    const column = columnDefs.find(col => col.field === selectedField);
    if (!column) return;

    const colType = column.type || 'string';
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
    } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') || colType.includes('double')) {
        $valueContainer.html(`<input type="number" class="filter-input" placeholder="Sisesta number">`);
    } else {
        // For text fields, use a regular text input
        $valueContainer.html(`<input type="text" class="filter-input" placeholder="Filtri väärtus">`);

        // Optionally fetch values for dropdown if column has few unique values
        fetchFilterValues(selectedField)
            .then(response => {
                if (response.values && response.values.length > 0 && response.values.length <= 100) {
                    // If column has relatively few values, show a datalist for suggestions
                    const datalistId = `datalist-${selectedField.replace(/[^a-zA-Z0-9]/g, '-')}`;

                    let html = `<input type="text" class="filter-input" placeholder="Filtri väärtus" list="${datalistId}">`;
                    html += `<datalist id="${datalistId}">`;

                    response.values.forEach(value => {
                        if (value !== null && value !== '') {
                            html += `<option value="${value}">`;
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
}

// Enhanced apply filters function
function applyEnhancedFilters() {
    // Collect filter conditions
    activeFilters = [];
    let filterModel = {};

    $(".filter-row").each(function () {
        const field = $(this).find(".filter-field").val();
        const operator = $(this).find(".filter-operator").val();

        // Skip if no field selected
        if (!field) return;

        let value;

        // Handle different operators
        if (operator === 'blank' || operator === 'notBlank') {
            value = null; // No value needed
        } else if (operator === 'inRange') {
            // Get from/to values
            const fromValue = $(this).find(".filter-from").val();
            const toValue = $(this).find(".filter-to").val();

            if (!fromValue && !toValue) return; // Skip if no range values

            value = {
                from: fromValue || null,
                to: toValue || null
            };
        } else {
            // Get single value from input
            const $valueInput = $(this).find(".filter-input");
            value = $valueInput.val();

            if (!value && operator !== 'blank' && operator !== 'notBlank') return; // Skip if no value
        }

        // Save the filter to the model
        activeFilters.push({
            field: field,
            operator: operator,
            value: value
        });

        // Add to AG Grid filter model
        filterModel[field] = {
            filterType: getFilterType(operator),
            type: operator,
            filter: value
        };
    });

    // Apply filters to AG Grid
    if (gridApi && Object.keys(filterModel).length > 0) {
        gridApi.setFilterModel(filterModel);
    } else if (gridApi) {
        // Clear filters
        gridApi.setFilterModel(null);
    }

    // Update status
    const displayedRowCount = gridApi ? gridApi.getDisplayedRowCount() : 0;
    $("#status").text(activeFilters.length > 0 ?
        `Filtreeritud: ${displayedRowCount} kirjet` :
        `${displayedRowCount} kirjet`);

    // Resize table container
    resizeTableContainer();

    // Close the filter panel if configured to auto-close
    if ($("#auto-close-filters").prop("checked")) {
        $("#filter-panel").removeClass("show");
    }
}

// Show save filter modal
function showSaveFilterModal() {
    // Get current filter settings
    if (activeFilters.length === 0) {
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

// Process saving a filter
function processSaveFilter() {
    const name = $("#filter-name").val().trim();
    const description = $("#filter-description").val().trim();
    const isPublic = $("#filter-public").prop("checked");

    // Validate inputs
    if (!name) {
        showToast("Nõutud väli puudub", "Palun sisestage filtri nimi", "error");
        return;
    }

    if (activeFilters.length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Get current filter model
    const filterModel = gridApi.getFilterModel();

    // Show loading indicator
    $("#save-filter-button").html('<i class="fas fa-spinner fa-spin mr-2"></i> Salvestamine...');
    $("#save-filter-button").prop("disabled", true);

    // Call API to save filter
    saveFilter(name, description, filterModel, isPublic)
        .then(response => {
            // Hide modal
            $("#save-filter-modal").addClass("hidden");

            // Show success message
            showToast("Filter salvestatud", `Filter "${name}" edukalt salvestatud`, "success");

            // Refresh filters list
            loadSavedFiltersList();
        })
        .catch(error => {
            console.error("Error saving filter:", error);
            showToast("Viga filtri salvestamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
        })
        .finally(() => {
            // Reset button
            $("#save-filter-button").html('<i class="fas fa-save mr-2"></i> Salvesta filter');
            $("#save-filter-button").prop("disabled", false);
        });
}

// Load saved filters into dropdown
function loadSavedFiltersList() {
    // Clear existing items
    $("#saved-filters-list").empty();
    $("#saved-filters-menu").empty();

    // Show loading indicator
    $("#saved-filters-list").html('<div class="p-4 text-center"><i class="fas fa-spinner fa-spin mr-2"></i> Laadimine...</div>');

    // Load filters from server
    loadSavedFilters()
        .then(response => {
            const filters = response.filters || [];

            // Check if we have any filters
            if (filters.length === 0) {
                $("#saved-filters-list").html('<div class="p-4 text-center text-gray-500">Salvestatud filtreid pole</div>');
                return;
            }

            // Clear loading indicator
            $("#saved-filters-list").empty();

            // Add filters to the list
            filters.forEach(filter => {
                // Add to filter panel list
                const listItem = $(`
                    <div class="saved-filter-item flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <div>
                            <div class="font-medium">${filter.name}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">${filter.description || ''}</div>
                        </div>
                        <div class="flex gap-2">
                            <button class="apply-filter-btn text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" data-id="${filter.id}" title="Rakenda filter">
                                <i class="fas fa-check"></i>
                            </button>
                            ${filter.is_owner ? `
                                <button class="delete-filter-btn text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" data-id="${filter.id}" title="Kustuta filter">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `);

                $("#saved-filters-list").append(listItem);

                // Also add to toolbar dropdown menu
                $("#saved-filters-menu").append(`
                    <div class="dropdown-item apply-saved-filter" data-id="${filter.id}">
                        <i class="fas fa-filter"></i>
                        <span>${filter.name}</span>
                    </div>
                `);
            });

            // Handle apply filter button clicks
            $(".apply-filter-btn, .apply-saved-filter").click(function() {
                const filterId = $(this).data("id");
                applySavedFilter(filterId);
            });

            // Handle delete filter button clicks
            $(".delete-filter-btn").click(function() {
                const filterId = $(this).data("id");
                const filterName = $(this).closest(".saved-filter-item").find(".font-medium").text();
                confirmDeleteFilter(filterId, filterName);
            });
        })
        .catch(error => {
            console.error("Error loading saved filters:", error);
            $("#saved-filters-list").html('<div class="p-4 text-center text-red-500">Viga filtrite laadimisel</div>');
        });
}

// Apply a saved filter
function applySavedFilter(filterId) {
    // Show loading indicator
    $("#status").html('<i class="fas fa-spinner fa-spin mr-2"></i> Filtri rakendamine...');

    // Get filter details
    getSavedFilter(filterId)
        .then(response => {
            try {
                // Parse filter model
                const filterModel = JSON.parse(response.filter_model);

                // Apply to AG Grid
                if (gridApi) {
                    gridApi.setFilterModel(filterModel);
                }

                // Update status and show success message
                showToast("Filter rakendatud", `Filter "${response.name}" edukalt rakendatud`, "success");

                // Close filter panel if open
                if ($("#filter-panel").hasClass("show")) {
                    $("#filter-panel").removeClass("show");
                }

                // Close dropdown
                $("#filters-dropdown-menu").removeClass("show");
            } catch (e) {
                console.error("Error parsing filter model:", e);
                showToast("Viga filtri rakendamisel", "Vigane filtri formaat", "error");
            }
        })
        .catch(error => {
            console.error("Error applying filter:", error);
            showToast("Viga filtri rakendamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
        })
        .finally(() => {
            // Reset status
            updateStatus();
        });
}

// Confirm delete filter
function confirmDeleteFilter(filterId, filterName) {
    if (confirm(`Kas olete kindel, et soovite kustutada filtri "${filterName}"?`)) {
        deleteSavedFilter(filterId)
            .then(response => {
                showToast("Filter kustutatud", `Filter "${filterName}" edukalt kustutatud`, "success");
                loadSavedFiltersList();
            })
            .catch(error => {
                console.error("Error deleting filter:", error);
                showToast("Viga filtri kustutamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
            });
    }
}

// Update status text
function updateStatus() {
    if (!gridApi) return;

    const displayedRowCount = gridApi.getDisplayedRowCount();
    const totalRowCount = gridApi.getInfiniteRowCount();

    const filterModel = gridApi.getFilterModel();
    const isFiltered = filterModel && Object.keys(filterModel).length > 0;

    $("#status").text(isFiltered ?
        `Filtreeritud: ${displayedRowCount} kirjet ${totalRowCount ? 'kokku ' + totalRowCount : ''}` :
        `${displayedRowCount} kirjet`);
}

// Initialize event handlers for the enhanced filtering system
document.addEventListener("DOMContentLoaded", function() {
    // Handle filter toggle button
    $("#filter-toggle").click(function() {
        $("#filter-panel").toggleClass("show");
        if ($("#filter-panel").hasClass("show")) {
            updateFilterFields();
            loadSavedFiltersList();
        }
        setTimeout(resizeTableContainer, 100);
    });

    // Handle open filter panel from dropdown
    $("#open-filter-panel").click(function() {
        $("#filter-panel").addClass("show");
        $("#filters-dropdown-menu").removeClass("show");
        updateFilterFields();
        loadSavedFiltersList();
        setTimeout(resizeTableContainer, 100);
    });

    // Handle add filter row button
    $("#add-filter-row").click(function() {
        addEnhancedFilterRow();
    });

    // Handle remove filter button clicks (using event delegation)
    $("#filter-container").on("click", ".filter-remove-btn", function() {
        $(this).closest(".filter-row").remove();
    });

    // Handle apply filters button
    $("#apply-filters").click(function() {
        applyEnhancedFilters();
    });

    // Handle clear filters button
    $("#clear-filters").click(function() {
        clearFilters();
    });

    // Handle save filter button
    $("#save-filter").click(function() {
        showSaveFilterModal();
    });

    // Handle save filter modal buttons
    $("#save-filter-button").click(function() {
        processSaveFilter();
    });

    $("#cancel-save-filter").click(function() {
        $("#save-filter-modal").addClass("hidden");
    });

    // Close save filter modal when clicking outside
    $("#save-filter-modal-backdrop").click(function() {
        $("#save-filter-modal").addClass("hidden");
    });

    // Prevent closing when clicking on modal content
    $("#save-filter-modal .modal-content").click(function(e) {
        e.stopPropagation();
    });
});