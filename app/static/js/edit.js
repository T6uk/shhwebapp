// app/static/js/edit.js - Editing functionality for the table
// Global variables for editing
let isEditMode = false;
let editSessionId = null;
let editableColumns = [];
let unsavedChanges = {};
let lastChangeCheck = null;
let changeCheckInterval = null;
let socket = null;

// Initialize when document is ready
$(document).ready(function() {
    // Check if user has edit permissions and get editable columns
    getEditableColumns();

    // Set up event handlers for edit functionality
    setupEditHandlers();

    // Check for changes from other users
    setupChangeNotifications();

    setupWebSocket();
});

function setupWebSocket() {
    // Get the token from cookies
    const cookies = document.cookie.split(';');
    let token = null;
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('access_token=')) {
            token = cookie.substring('access_token='.length);
            break;
        }
    }

    if (!token) return;

    // Clean the token
    if (token.startsWith('Bearer%20')) {
        token = token.replace('Bearer%20', '');
    } else if (token.startsWith('Bearer ')) {
        token = token.replace('Bearer ', '');
    }

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = function(e) {
        console.log("WebSocket connection established");

        // Send periodic pings to keep connection alive
        setInterval(function() {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({type: "ping"}));
            }
        }, 30000);
    };

    socket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle different message types
            if (data.type === "data_change") {
                // Show notification for data change
                showDataChangeNotification([{
                    username: "Another user",
                    table_name: data.table_name,
                    row_id: data.row_id,
                    column_name: data.column_name,
                    changed_at: data.timestamp
                }]);
            } else if (data.type === "pong") {
                // Ping response, nothing to do
            }
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };

    socket.onclose = function(event) {
        if (event.wasClean) {
            console.log(`WebSocket connection closed cleanly, code=${event.code}, reason=${event.reason}`);
        } else {
            console.error("WebSocket connection died");

            // Try to reconnect after a delay
            setTimeout(setupWebSocket, 5000);
        }
    };

    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };
}

// Get editable columns from the server
function getEditableColumns() {
    $.ajax({
        url: "/api/v1/table/editable-columns",
        method: "GET",
        dataType: "json",
        success: function(response) {
            editableColumns = response.columns || [];

            // Show edit button only if user has permission
            if (response.can_edit) {
                $("#edit-mode-container").removeClass("hidden");
            }

            console.log("Editable columns:", editableColumns);
        },
        error: function(xhr, status, error) {
            console.error("Error getting editable columns:", error);
        }
    });
}

// Set up edit-related event handlers
function setupEditHandlers() {
    // Edit mode toggle button
    $("#edit-mode-btn").click(function() {
        toggleEditMode();
    });

    // Undo all changes button
    $("#undo-all-btn").click(function() {
        undoAllChanges();
    });

    // Close history panel button
    $("#close-history-panel").click(function() {
        $("#edit-history-panel").addClass("hidden");
    });

    // Show history button
    $("#show-history-btn").click(function() {
        loadSessionChanges();
    });

    // Add beforeunload event handler to warn about unsaved changes
    $(window).on("beforeunload", function(e) {
        if (isEditMode && Object.keys(unsavedChanges).length > 0) {
            // Standard message for beforeunload event
            const message = "You have unsaved changes. Are you sure you want to leave? Changes can't be undone after.";
            e.returnValue = message;
            return message;
        }
    });
}

// Toggle edit mode on/off
function toggleEditMode() {
    if (isEditMode) {
        disableEditMode();
    } else {
        enableEditMode();
    }
}

// Enable edit mode after password verification
function enableEditMode() {
    // Prompt for password
    const password = prompt("Enter edit mode password:");
    if (!password) return;

    // Verify password with server
    $.ajax({
        url: "/api/v1/table/verify-edit-password",
        method: "POST",
        data: {
            password: password
        },
        dataType: "json",
        success: function(response) {
            if (response.success) {
                // Enable edit mode
                isEditMode = true;
                editSessionId = response.session_id;

                // Update button UI
                $("#edit-mode-btn").text("Disable Editing");
                $("#edit-mode-btn").removeClass("bg-green-500").addClass("bg-red-500");

                // Show editing indicator
                $("#edit-indicator").removeClass("hidden");

                // Show edit history panel
                $("#edit-history-panel").removeClass("hidden");

                // Reset unsaved changes
                unsavedChanges = {};

                // Refresh grid to highlight editable cells
                if (gridApi) {
                    gridApi.redrawRows();
                }

                // Show toast notification
                showToast("Edit mode enabled", "You can now edit the highlighted cells by double-clicking", "info");
            } else {
                // Show error
                showToast("Edit mode failed", response.message || "Invalid password", "error");
            }
        },
        error: function(xhr, status, error) {
            console.error("Error verifying edit password:", error);
            showToast("Error", "Failed to enable edit mode", "error");
        }
    });
}

// Disable edit mode
function disableEditMode() {
    // Check for unsaved changes
    if (Object.keys(unsavedChanges).length > 0) {
        if (!confirm("You have unsaved changes. Are you sure you want to exit edit mode? Changes can't be undone after.")) {
            return;
        }
    }

    // Disable edit mode
    isEditMode = false;
    editSessionId = null;

    // Update button UI
    $("#edit-mode-btn").text("Enable Editing");
    $("#edit-mode-btn").removeClass("bg-red-500").addClass("bg-green-500");

    // Hide editing indicator
    $("#edit-indicator").addClass("hidden");

    // Hide edit history panel
    $("#edit-history-panel").addClass("hidden");

    // Clear unsaved changes
    unsavedChanges = {};

    // Refresh grid to remove highlighting
    if (gridApi) {
        gridApi.redrawRows();
    }

    // Show toast notification
    showToast("Edit mode disabled", "You are now in view-only mode", "info");
}

// Handle cell value change - this integrates with AG Grid
function onCellValueChanged(params) {
    // Only process if in edit mode
    if (!isEditMode) return;

    const column = params.column.getColDef().field;
    const rowId = params.data.id;
    const oldValue = params.oldValue;
    const newValue = params.newValue;

    // Skip if no actual change
    if (oldValue === newValue) return;

    // Key for tracking this change
    const changeKey = `${rowId}_${column}`;

    // Add to unsaved changes
    unsavedChanges[changeKey] = {
        rowId: rowId,
        column: column,
        oldValue: oldValue,
        newValue: newValue,
        timestamp: new Date().toISOString()
    };

    // Save to server
    $.ajax({
        url: "/api/v1/table/update-cell",
        method: "POST",
        data: {
            table_name: "taitur_data", // Replace with your actual table name
            row_id: rowId,
            column_name: column,
            old_value: oldValue,
            new_value: newValue,
            session_id: editSessionId
        },
        dataType: "json",
        success: function(response) {
            if (response.success) {
                // Remove from unsaved changes since it's saved
                delete unsavedChanges[changeKey];

                // Update changes list
                loadSessionChanges();

                // Show success toast
                showToast("Cell updated", `Updated ${column} value successfully`, "success");
            }
        },
        error: function(xhr, status, error) {
            console.error("Error updating cell:", error);

            // Revert the change in the grid
            params.node.setDataValue(column, oldValue);

            // Show error toast
            showToast("Update failed", xhr.responseJSON?.detail || error, "error");
        }
    });
}

// Load changes for the current editing session
function loadSessionChanges() {
    if (!editSessionId) return;

    $.ajax({
        url: `/api/v1/table/session-changes/${editSessionId}`,
        method: "GET",
        dataType: "json",
        success: function(response) {
            // Update changes list UI
            updateChangesListUI(response.changes);
        },
        error: function(xhr, status, error) {
            console.error("Error loading session changes:", error);
        }
    });
}

// Update the changes list UI
function updateChangesListUI(changes) {
    const container = $("#changes-list");
    container.empty();

    if (!changes || changes.length === 0) {
        container.html('<div class="text-gray-500 dark:text-gray-400 text-sm italic">No changes yet</div>');
        $("#undo-all-btn").prop("disabled", true);
        return;
    }

    // Enable undo all button
    $("#undo-all-btn").prop("disabled", false);

    // Add each change to the list
    changes.forEach(function(change) {
        const changeTime = new Date(change.changed_at).toLocaleTimeString();
        const changeItem = $(`
            <div class="change-item mb-2 p-2 border-b border-gray-200 dark:border-gray-700">
                <div class="flex justify-between">
                    <div class="font-semibold text-sm">${change.column_name}</div>
                    <div class="text-xs text-gray-500">${changeTime}</div>
                </div>
                <div class="text-xs mt-1">
                    <span class="text-red-500 line-through">${change.old_value || '(empty)'}</span>
                    <span class="mx-1">→</span>
                    <span class="text-green-500">${change.new_value || '(empty)'}</span>
                </div>
                <button class="undo-change-btn text-xs text-blue-500 hover:text-blue-700 mt-1" data-id="${change.id}">
                    <i class="fas fa-undo mr-1"></i>Undo
                </button>
            </div>
        `);

        container.append(changeItem);
    });

    // Add click handler for undo buttons
    $(".undo-change-btn").click(function() {
        const changeId = $(this).data("id");
        undoChange(changeId);
    });
}

// Undo a specific change
function undoChange(changeId) {
    $.ajax({
        url: `/api/v1/table/undo-change/${changeId}`,
        method: "POST",
        dataType: "json",
        success: function(response) {
            if (response.success) {
                // Refresh grid data
                if (gridApi) {
                    gridApi.refreshInfiniteCache();
                }

                // Reload changes list
                loadSessionChanges();

                // Show success toast
                showToast("Change undone", "Successfully reverted the change", "success");
            }
        },
        error: function(xhr, status, error) {
            console.error("Error undoing change:", error);
            showToast("Undo failed", xhr.responseJSON?.detail || error, "error");
        }
    });
}

// Undo all changes in the current session
function undoAllChanges() {
    if (!confirm("Are you sure you want to undo all changes in this session?")) {
        return;
    }

    // Get all changes and undo them one by one
    $.ajax({
        url: `/api/v1/table/session-changes/${editSessionId}`,
        method: "GET",
        dataType: "json",
        success: function(response) {
            if (response.changes && response.changes.length > 0) {
                const undoPromises = response.changes.map(change => {
                    return $.ajax({
                        url: `/api/v1/table/undo-change/${change.id}`,
                        method: "POST",
                        dataType: "json"
                    });
                });

                // When all undos are complete
                Promise.all(undoPromises)
                    .then(() => {
                        // Refresh grid data
                        if (gridApi) {
                            gridApi.refreshInfiniteCache();
                        }

                        // Reload changes list
                        loadSessionChanges();

                        // Show success toast
                        showToast("All changes undone", "Successfully reverted all changes", "success");
                    })
                    .catch(error => {
                        console.error("Error undoing all changes:", error);
                        showToast("Undo failed", "Some changes could not be undone", "error");
                    });
            }
        },
        error: function(xhr, status, error) {
            console.error("Error getting session changes:", error);
            showToast("Undo failed", "Could not retrieve changes to undo", "error");
        }
    });
}

// Set up change notifications from other users
function setupChangeNotifications() {
    // Set the initial timestamp
    lastChangeCheck = new Date().toISOString();

    // Check for changes every 15 seconds
    changeCheckInterval = setInterval(checkForChanges, 15000);
}

// Check for changes from other users
function checkForChanges() {
    $.ajax({
        url: "/api/v1/table/check-for-changes",
        method: "GET",
        data: {
            last_checked: lastChangeCheck
        },
        dataType: "json",
        success: function(response) {
            // Update the last check timestamp
            lastChangeCheck = response.timestamp;

            // If there are changes, notify the user
            if (response.has_changes) {
                showDataChangeNotification(response.changes);
            }
        },
        error: function(xhr, status, error) {
            console.error("Error checking for changes:", error);
        }
    });
}

// Show notification for data changes from other users
function showDataChangeNotification(changes) {
    if (!changes || changes.length === 0) return;

    // Get the user who made the most recent change
    const latestChange = changes[0];
    const username = latestChange.username;

    // Create notification element
    const notification = $(`
        <div class="change-notification bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 p-3 rounded-lg shadow-lg mb-3 transform transition-all duration-300 opacity-0 translate-x-10">
            <div class="flex items-center">
                <i class="fas fa-info-circle mr-2"></i>
                <div>
                    <div class="font-medium">Data has been updated</div>
                    <div class="text-sm">${username} made changes to the data</div>
                </div>
            </div>
            <div class="mt-2">
                <button class="refresh-data-btn bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-xs">
                    Refresh Data
                </button>
                <button class="dismiss-btn ml-2 text-blue-800 hover:text-blue-900 dark:text-blue-200 dark:hover:text-white py-1 px-2 text-xs">
                    Dismiss
                </button>
            </div>
        </div>
    `);

    // Add to notification container
    $("#notification-container").append(notification);

    // Show with animation
    setTimeout(() => {
        notification.removeClass("opacity-0 translate-x-10");
    }, 10);

    // Add click handlers
    notification.find(".refresh-data-btn").click(function() {
        // Refresh the grid data
        if (gridApi) {
            gridApi.refreshInfiniteCache();
        }

        // Remove the notification
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    });

    notification.find(".dismiss-btn").click(function() {
        // Remove the notification
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    });

    // Auto-dismiss after 15 seconds
    setTimeout(function() {
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    }, 15000);
}

// Show toast notification
function showToast(title, message, type = "info") {
    // Define colors based on type
    let colors = {
        "success": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        "error": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        "info": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        "warning": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    };

    let icons = {
        "success": "fas fa-check-circle",
        "error": "fas fa-exclamation-circle",
        "info": "fas fa-info-circle",
        "warning": "fas fa-exclamation-triangle"
    };

    // Create toast element
    const toast = $(`
        <div class="toast-notification ${colors[type]} p-3 rounded-lg shadow-lg mb-3 transform transition-all duration-300 opacity-0 translate-y-10">
            <div class="flex items-center">
                <i class="${icons[type]} mr-2"></i>
                <div>
                    <div class="font-medium">${title}</div>
                    <div class="text-sm">${message}</div>
                </div>
                <button class="close-toast ml-4 text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `);

    // Add to notification container
    $("#notification-container").append(toast);

    // Show with animation
    setTimeout(() => {
        toast.removeClass("opacity-0 translate-y-10");
    }, 10);

    // Add click handler for close button
    toast.find(".close-toast").click(function() {
        toast.addClass("opacity-0 translate-y-10");
        setTimeout(() => toast.remove(), 300);
    });

    // Auto-dismiss after 5 seconds
    setTimeout(function() {
        toast.addClass("opacity-0 translate-y-10");
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Custom cell style for editable cells - integrates with AG Grid
function getCellStyle(params) {
    // Highlight editable cells when in edit mode
    if (isEditMode && editableColumns.includes(params.colDef.field)) {
        return {
            backgroundColor: "#dbeafe",  // Light blue background
            cursor: "pointer"
        };
    }

    return null;
}

// These functions need to be accessible in the global scope for AG Grid integration
window.onCellValueChanged = onCellValueChanged;
window.getCellStyle = getCellStyle;