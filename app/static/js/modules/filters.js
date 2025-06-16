// app/static/js/modules/filters.js
// Filter-related functionality

(function() {
    // Local references to global state
    const state = window.appState;
    const funcs = window.appFunctions;

    // Update filter fields with column options
    function updateFilterFields() {
        if (!state.columnDefs || state.columnDefs.length === 0) return;

        // Clear existing options except the first placeholder
        $(".filter-field").each(function() {
            const placeholder = $(this).children().first();
            $(this).empty().append(placeholder);
        });

        // Add column options to each filter field
        state.columnDefs.forEach(function(col) {
            const option = $("<option>")
                .val(col.field)
                .text(col.headerName);

            $(".filter-field").each(function() {
                $(this).append(option.clone());
            });
        });
    }

    // Enhanced filter row function
    function addEnhancedFilterRow() {
        const nextId = state.nextFilterId++;
        const newRow = $(`
            <div class="filter-row" data-id="${nextId}">
                <select class="compact-select filter-field w-full sm:w-auto" onchange="window.appFunctions.updateFilterOperators(this)">
                    <option value="">Vali veerg...</option>
                </select>

                <select class="compact-select filter-operator w-full sm:w-auto" onchange="window.appFunctions.updateFilterValueInput($(this).closest('.filter-row'))">
                    <option value="contains">Sisaldab</option>
                    <option value="equals">Võrdub</option>
                    <option value="notEqual">Ei võrdu</option>
                    <option value="startsWith">Algab</option>
                    <option value="endsWith">Lõpeb</option>
                    <option value="blank">Tühi</option>
                    <option value="notBlank">Mitte tühi</option>
                </select>

                <div class="filter-value-container flex-grow">
                    <input type="text" class="compact-input w-full" placeholder="Filtri väärtus">
                </div>

                <button class="compact-filter-remove-btn">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `);

        $("#filter-container").append(newRow);

        // Add column options to the new filter field
        updateFilterFields();

        // Set up remove button handler
        newRow.find(".compact-filter-remove-btn").click(function() {
            $(this).closest(".filter-row").remove();
        });
    }

    // Function to update filter operators based on selected column type
    function updateFilterOperators(fieldSelect) {
        const $row = $(fieldSelect).closest('.filter-row');
        const $operatorSelect = $row.find('.filter-operator');
        const selectedField = $(fieldSelect).val();

        if (!selectedField) return;

        // Find the column definition
        const column = state.columnDefs.find(col => col.field === selectedField);

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
        const column = state.columnDefs.find(col => col.field === selectedField);
        if (!column) return;

        const colType = column.type || 'string';
        const $valueContainer = $row.find('.filter-value-container');

        // Clear existing inputs
        $valueContainer.empty();

        // For blank/notBlank operators, no input is needed
        if (selectedOperator === 'blank' || selectedOperator === 'notBlank') {
            $valueContainer.html('<div class="text-gray-400 italic text-xs">Väärtust pole vaja</div>');
            return;
        }

        // For inRange operator, we need two inputs
        if (selectedOperator === 'inRange') {
            if (colType.includes('date') || colType.includes('timestamp')) {
                $valueContainer.html(`
                    <div class="flex gap-2 flex-1">
                        <input type="date" class="compact-input filter-from flex-1" placeholder="Alates">
                        <input type="date" class="compact-input filter-to flex-1" placeholder="Kuni">
                    </div>
                `);
            } else {
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
            $valueContainer.html(`<input type="date" class="compact-input w-full" placeholder="Vali kuupäev">`);
        } else if (colType.includes('int') || colType.includes('numeric') || colType.includes('real') || colType.includes('double')) {
            $valueContainer.html(`<input type="number" class="compact-input w-full" placeholder="Sisesta number">`);
        } else {
            // For text fields, use a regular text input
            $valueContainer.html(`<input type="text" class="compact-input w-full" placeholder="Filtri väärtus">`);

            // Optionally fetch values for datalist if column has few unique values
            fetchFilterValues(selectedField)
                .then(response => {
                    if (response.values && response.values.length > 0 && response.values.length <= 100) {
                        // If column has relatively few values, show a datalist for suggestions
                        const datalistId = `datalist-${selectedField.replace(/[^a-zA-Z0-9]/g, '-')}`;

                        let html = `<input type="text" class="compact-input w-full" placeholder="Filtri väärtus" list="${datalistId}">`;
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

    // Fetch filter values for a column
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

    // Enhanced apply filters function
    function applyEnhancedFilters() {
        console.log("Applying filters");

        // Create a simple object to hold our filters
        let filterModel = {};

        // Process each filter row
        $(".filter-row").each(function() {
            const field = $(this).find(".filter-field").val();
            if (!field) return; // Skip incomplete filters

            const operator = $(this).find(".filter-operator").val();
            let value;

            // Handle different filter types
            if (operator === 'blank') {
                // For blank fields
                filterModel[field] = {
                    filterType: 'text',
                    type: 'blank'
                };
                return;
            } else if (operator === 'notBlank') {
                // For not blank fields
                filterModel[field] = {
                    filterType: 'text',
                    type: 'notBlank'
                };
                return;
            } else if (operator === 'inRange') {
                // For range filters
                const fromValue = $(this).find(".filter-from").val();
                const toValue = $(this).find(".filter-to").val();

                if (!fromValue && !toValue) return; // Skip empty ranges

                filterModel[field] = {
                    filterType: 'number',
                    type: 'inRange',
                    filter: {
                        from: fromValue || null,
                        to: toValue || null
                    }
                };
                return;
            }

            // For standard filters
            value = $(this).find(".filter-input").val();
            if (!value && operator !== 'blank' && operator !== 'notBlank') return; // Skip empty values

            // Create the filter object
            filterModel[field] = {
                filterType: getFilterType(operator),
                type: operator,
                filter: value
            };
        });

        console.log("Filter model:", JSON.stringify(filterModel));

        // Apply the filter model directly
        if (state.gridApi) {
            try {
                state.gridApi.setFilterModel(filterModel);

                // Force a refresh with timestamp for cache invalidation
                state.gridApi.refreshInfiniteCache();

                // Update status text
                setTimeout(() => {
                    const count = state.gridApi.getDisplayedRowCount();
                    $("#status").text(`Filtreeritud: ${count} kirjet`);
                }, 500);

                // Update active filters display
                funcs.updateActiveFiltersDisplay();

            } catch (err) {
                console.error("Error applying filters:", err);
                funcs.showToast("Viga", "Filtrite rakendamisel tekkis viga", "error");
            }
        }

        // Close the filter panel if checkbox is checked
        if ($("#auto-close-filters").prop("checked")) {
            $("#filter-panel").removeClass("show");
            setTimeout(funcs.resizeTableContainer, 100);
        }
    }

    // Helper function to get filter type for AG Grid
    function getFilterType(operator) {
        // Check for text-based operators
        if (operator === 'contains' || operator === 'notContains' ||
            operator === 'startsWith' || operator === 'endsWith' ||
            operator === 'equals' || operator === 'notEqual' ||
            operator === 'blank' || operator === 'notBlank') {
            return 'text';
        }

        // Check for number-based operators
        else if (operator === 'greaterThan' || operator === 'greaterThanOrEqual' ||
            operator === 'lessThan' || operator === 'lessThanOrEqual' ||
            operator === 'inRange') {
            return 'number';
        }

        // Default to text for unknown operators
        else {
            console.warn(`Unknown operator: ${operator}, defaulting to text`);
            return 'text';
        }
    }

    // Clear all filters
    function clearFilters() {
        // Reset filter UI
        $("#filter-container").empty();

        // Add a single empty filter row
        state.nextFilterId = 2; // Reset ID counter
        addEnhancedFilterRow();

        // Clear active filters
        state.activeFilters = [];

        // Clear AG Grid filters
        if (state.gridApi) {
            state.gridApi.setFilterModel(null);
            state.gridApi.refreshInfiniteCache();
        }

        // Update status
        if (state.gridApi) {
            const displayedRowCount = state.gridApi.getDisplayedRowCount();
            $("#status").text(`${displayedRowCount} kirjet`);
        }

        // Hide active filters container
        $("#active-filters-container").addClass("hidden");

        // Show confirmation
        funcs.showToast("Filtrid lähtestatud", "Kõik filtrid on eemaldatud", "info");
    }

    // Load saved filters into list
    function loadSavedFiltersList() {
        // Clear existing items
        $("#saved-filters-list").empty();

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
                });

                // Handle apply filter button clicks
                $(".apply-filter-btn").click(function() {
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

    function loadSavedFilters() {
        return $.ajax({
            url: "/api/v1/table/saved-filters",
            method: "GET",
            dataType: "json"
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
                    if (state.gridApi) {
                        state.gridApi.setFilterModel(filterModel);

                        // Force refresh
                        state.gridApi.refreshInfiniteCache();

                        // Update active filters display
                        setTimeout(funcs.updateActiveFiltersDisplay, 100);
                    }

                    // Update status and show success message
                    funcs.showToast("Filter rakendatud", `Filter "${response.name}" edukalt rakendatud`, "success");

                    // Close filter panel if open
                    if ($("#filter-panel").hasClass("show")) {
                        $("#filter-panel").removeClass("show");
                        setTimeout(funcs.resizeTableContainer, 100);
                    }

                } catch (e) {
                    console.error("Error parsing filter model:", e);
                    funcs.showToast("Viga filtri rakendamisel", "Vigane filtri formaat", "error");
                }
            })
            .catch(error => {
                console.error("Error applying filter:", error);
                funcs.showToast("Viga filtri rakendamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
            })
            .finally(() => {
                // Reset status
                funcs.updateStatus();
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

    // Confirm delete filter
    function confirmDeleteFilter(filterId, filterName) {
        if (confirm(`Kas olete kindel, et soovite kustutada filtri "${filterName}"?`)) {
            deleteSavedFilter(filterId)
                .then(response => {
                    funcs.showToast("Filter kustutatud", `Filter "${filterName}" edukalt kustutatud`, "success");
                    loadSavedFiltersList();
                })
                .catch(error => {
                    console.error("Error deleting filter:", error);
                    funcs.showToast("Viga filtri kustutamisel", error.responseJSON?.detail || "Palun proovige uuesti", "error");
                });
        }
    }

    // Function to delete a saved filter
    function deleteSavedFilter(filterId) {
        return $.ajax({
            url: `/api/v1/table/saved-filter/${filterId}`,
            method: "DELETE"
        });
    }

    // Expose functions to the global bridge
    funcs.updateFilterFields = updateFilterFields;
    funcs.addEnhancedFilterRow = addEnhancedFilterRow;
    funcs.updateFilterOperators = updateFilterOperators;
    funcs.updateFilterValueInput = updateFilterValueInput;
    funcs.applyEnhancedFilters = applyEnhancedFilters;
    funcs.clearFilters = clearFilters;
    funcs.loadSavedFiltersList = loadSavedFiltersList;
})();