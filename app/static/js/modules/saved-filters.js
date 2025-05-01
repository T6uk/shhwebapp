// app/static/js/modules/saved-filters.js
// Saved filter operations

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

// Show save filter modal
function showSaveFilterModal() {
    // Get current filter settings
    if (AppState.activeFilters.length === 0) {
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

    if (AppState.activeFilters.length === 0) {
        showToast("Pole midagi salvestada", "Palun rakendage enne salvestamist vähemalt üks filter", "warning");
        return;
    }

    // Get current filter model
    const filterModel = AppState.gridApi.getFilterModel();

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
                if (AppState.gridApi) {
                    AppState.gridApi.setFilterModel(filterModel);
                }

                // Update active filters in AppState
                AppState.activeFilters = Object.keys(filterModel).map(field => ({
                    field,
                    ...filterModel[field]
                }));

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

// Export functions for other modules
window.saveFilter = saveFilter;
window.loadSavedFilters = loadSavedFilters;
window.getSavedFilter = getSavedFilter;
window.deleteSavedFilter = deleteSavedFilter;
window.showSaveFilterModal = showSaveFilterModal;
window.processSaveFilter = processSaveFilter;
window.loadSavedFiltersList = loadSavedFiltersList;
window.applySavedFilter = applySavedFilter;
window.confirmDeleteFilter = confirmDeleteFilter;