// app/static/js/edit.js - Tabeli redigeerimise funktsioonid
// Globaalsed muutujad redigeerimiseks
window.lastChangeCheck = null;
window.changeCheckInterval = null;
window.socket = null;

// Algväärtusta kui dokument on laaditud
$(document).ready(function () {
    // Kontrolli, kas kasutajal on redigeerimisõigused ja lae redigeeritavad veerud
    getEditableColumns();

    // Seadista sündmuste käsitlejad redigeerimisfunktsionaalsusele
    setupEditHandlers();

    // Kontrolli muudatusi teistelt kasutajatelt
    setupChangeNotifications();

    setupWebSocket();

    // Button state initialization
    const editBtn = document.getElementById('edit-mode-btn');
    if (editBtn) {
        editBtn.style.backgroundColor = "#22c55e"; // Green-500
        editBtn.style.borderColor = "#22c55e";
        editBtn.style.color = "white";

        $(editBtn).hover(
            function () {
                this.style.backgroundColor = "#16a34a"; // Green-600 for hover
                this.style.borderColor = "#16a34a";
            },
            function () {
                this.style.backgroundColor = "#22c55e"; // Back to Green-500
                this.style.borderColor = "#22c55e";
            }
        );
    }
    $("#edit-mode-btn").addClass('edit-mode-inactive');
});

function setupWebSocket() {
    // Hangi token küpsistest
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

    // Puhasta token
    if (token.startsWith('Bearer%20')) {
        token = token.replace('Bearer%20', '');
    } else if (token.startsWith('Bearer ')) {
        token = token.replace('Bearer ', '');
    }

    // Loo WebSocket ühendus
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    // Sulge olemasolev sokett, kui see on olemas
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = function (e) {
        console.log("WebSocket ühendus loodud");

        // Saada perioodilisi ping-e, et hoida ühendust elus
        if (window.pingInterval) {
            clearInterval(window.pingInterval);
        }

        window.pingInterval = setInterval(function () {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({type: "ping"}));
            }
        }, 30000);
    };

    socket.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);

            // Käitle erinevat tüüpi sõnumeid
            if (data.type === "data_change") {
                // Näita teavitust andmete muutmise kohta
                showDataChangeNotification([{
                    username: data.username || "Teine kasutaja",
                    table_name: data.table_name,
                    row_id: data.row_id,
                    column_name: data.column_name,
                    changed_at: data.timestamp
                }]);

                // Värskenda ka tabelit, et näidata viimased muudatused
                if (gridApi) {
                    gridApi.refreshInfiniteCache();
                }
            } else if (data.type === "pong") {
                // Ping vastus, midagi pole vaja teha
            }
        } catch (e) {
            console.error("Viga WebSocket sõnumi analüüsimisel:", e);
        }
    };

    socket.onclose = function (event) {
        if (event.wasClean) {
            console.log(`WebSocket ühendus suletud korrektselt, kood=${event.code}, põhjus=${event.reason}`);
        } else {
            console.error("WebSocket ühendus katkes");
        }

        // Tühjenda ping intervall, kui see eksisteerib
        if (window.pingInterval) {
            clearInterval(window.pingInterval);
        }

        // Proovi uuesti ühenduda peale viivitust
        setTimeout(setupWebSocket, 5000);
    };

    socket.onerror = function (error) {
        console.error("WebSocket viga:", error);
    };
}

// Hangi redigeeritavad veerud serverist
function getEditableColumns() {
    $.ajax({
        url: "/api/v1/table/editable-columns",
        method: "GET",
        dataType: "json",
        success: function (response) {
            // Store in both places for compatibility
            window.editableColumns = response.columns || [];
            window.appState.editableColumns = response.columns || [];

            // Show edit button if user can edit
            if (response.can_edit) {
                $("#edit-mode-container").removeClass("hidden");
            }

            console.log("Redigeeritavad veerud:", window.editableColumns);
        },
        error: function (xhr, status, error) {
            console.error("Viga redigeeritavate veergude laadimisel:", error);
        }
    });
}

// Seadista redigeerimisega seotud sündmuste käsitlejad
function setupEditHandlers() {
    // Redigeerimisrežiimi lüliti nupp
    $("#edit-mode-btn").click(function () {
        toggleEditMode();
    });

    // Kõigi muudatuste tühistamise nupp
    $("#undo-all-btn").click(function () {
        undoAllChanges();
    });

    // Sule ajaloo paneeli nupp
    $("#close-history-panel").click(function () {
        $("#edit-history-panel").addClass("hidden");
    });

    // Näita ajalugu nupp
    $("#show-history-btn").click(function () {
        loadSessionChanges();
    });

    // Lisa beforeunload sündmuse käsitleja hoiatamaks salvestamata muudatuste kohta
    $(window).on("beforeunload", function (e) {
        if (isEditMode && Object.keys(unsavedChanges).length > 0) {
            // Standardne sõnum beforeunload sündmuse jaoks
            const message = "Teil on salvestamata muudatusi. Kas olete kindel, et soovite lahkuda? Muudatusi ei saa hiljem tagasi võtta.";
            e.returnValue = message;
            return message;
        }
    });
}

// Lülita redigeerimisrežiim sisse/välja
function toggleEditMode() {
    if (isEditMode) {
        disableEditMode();
    } else {
        enableEditMode();
    }
}

// Luba redigeerimisrežiim pärast parooli kontrollimist
function enableEditMode() {
    // Ask for password
    const password = prompt("Sisestage redigeerimisrežiimi parool:");
    if (!password) return;

    console.log("Attempting to enable edit mode");

    // Verify password with server
    $.ajax({
        url: "/api/v1/table/verify-edit-password",
        method: "POST",
        data: {
            password: password
        },
        dataType: "json",
        success: function (response) {
            console.log("Edit mode password verification response:", response);

            if (response.success) {
                // Enable edit mode using global state
                window.appState.isEditMode = true;
                window.editSessionId = response.session_id;

                // Update button UI using classes
                const editBtn = document.getElementById('edit-mode-btn');
                editBtn.textContent = "Lülita redigeerimine välja";

                // Remove inactive class and add active class
                $(editBtn).removeClass('edit-mode-inactive')
                    .addClass('edit-mode-active');

                console.log("Edit mode enabled, button should be red now");

                // Reset unsaved changes
                window.unsavedChanges = {};

                // Make sure editableColumns are in global state
                window.appState.editableColumns = window.editableColumns || [];

                // Redraw rows to highlight editable cells
                if (window.appState.gridApi) {
                    window.appState.gridApi.redrawRows();
                } else if (window.gridApi) {
                    // Fallback to global gridApi
                    window.gridApi.redrawRows();
                }

                // Show edit history panel
                $("#edit-history-panel").removeClass("hidden");

                // Show notification
                if (typeof window.appFunctions.showToast === 'function') {
                    window.appFunctions.showToast("Redigeerimisrežiim lubatud", "Saate nüüd redigeerida esiletõstetud lahtreid topeltklõpsates", "info");
                } else {
                    showToast("Redigeerimisrežiim lubatud", "Saate nüüd redigeerida esiletõstetud lahtreid topeltklõpsates", "info");
                }
            } else {
                // Show error
                if (typeof window.appFunctions.showToast === 'function') {
                    window.appFunctions.showToast("Redigeerimisrežiimi viga", response.message || "Vale parool", "error");
                } else {
                    showToast("Redigeerimisrežiimi viga", response.message || "Vale parool", "error");
                }
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga parooli kontrollimisel:", error);
            if (typeof window.appFunctions.showToast === 'function') {
                window.appFunctions.showToast("Viga", "Redigeerimisrežiimi lubamine ebaõnnestus", "error");
            } else {
                showToast("Viga", "Redigeerimisrežiimi lubamine ebaõnnestus", "error");
            }
        }
    });
}

// Disable edit mode
function disableEditMode() {
    // Check for unsaved changes
    if (Object.keys(window.unsavedChanges || {}).length > 0) {
        if (!confirm("Teil on salvestamata muudatusi. Kas olete kindel, et soovite redigeerimisrežiimist väljuda? Muudatusi ei saa hiljem tagasi võtta.")) {
            return;
        }
    }

    // Disable edit mode using global state
    window.appState.isEditMode = false;
    window.editSessionId = null;

    // Update button UI using classes
    const editBtn = document.getElementById('edit-mode-btn');
    editBtn.textContent = "Luba redigeerimine";

    // Remove active class and add inactive class
    $(editBtn).removeClass('edit-mode-active')
        .addClass('edit-mode-inactive');

    console.log("Edit mode disabled, button should be green now");

    // Hide edit history panel
    $("#edit-history-panel").addClass("hidden");

    // Clear unsaved changes
    window.unsavedChanges = {};

    // Refresh table to remove highlighting
    if (window.appState.gridApi) {
        window.appState.gridApi.redrawRows();
    } else if (window.gridApi) {
        window.gridApi.redrawRows();
    }

    // Show notification
    if (typeof window.appFunctions.showToast === 'function') {
        window.appFunctions.showToast("Redigeerimisrežiim keelatud", "Olete nüüd ainult vaatamise režiimis", "info");
    } else {
        showToast("Redigeerimisrežiim keelatud", "Olete nüüd ainult vaatamise režiimis", "info");
    }
}

// Käsitle lahtri väärtuse muutmist - see integreerib AG Grid'iga
function onCellValueChanged(params) {
    // Only process in edit mode
    if (!window.appState.isEditMode) return;

    const column = params.column.getColDef().field;
    const rowId = params.data.id;
    const oldValue = params.oldValue;
    const newValue = params.newValue;

    // Skip if no actual change
    if (oldValue === newValue) return;

    // Key for tracking this change
    const changeKey = `${rowId}_${column}`;

    // Add to unsaved changes
    window.unsavedChanges[changeKey] = {
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
            table_name: "taitur_data",
            row_id: rowId,
            column_name: column,
            old_value: oldValue,
            new_value: newValue,
            session_id: window.editSessionId
        },
        dataType: "json",
        success: function (response) {
            if (response.success) {
                // Remove from unsaved changes
                delete window.unsavedChanges[changeKey];

                // Update changes list
                loadSessionChanges();

                // Show success notification
                if (typeof window.appFunctions.showToast === 'function') {
                    window.appFunctions.showToast("Lahter uuendatud", `Veeru ${column} väärtus edukalt uuendatud`, "success");
                } else {
                    showToast("Lahter uuendatud", `Veeru ${column} väärtus edukalt uuendatud`, "success");
                }
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga lahtri uuendamisel:", error);

            // Restore change in table
            params.node.setDataValue(column, oldValue);

            // Show error notification
            if (typeof window.appFunctions.showToast === 'function') {
                window.appFunctions.showToast("Uuendamine ebaõnnestus", xhr.responseJSON?.detail || error, "error");
            } else {
                showToast("Uuendamine ebaõnnestus", xhr.responseJSON?.detail || error, "error");
            }
        }
    });
}

// Lae muudatused praeguse redigeerimisseansi jaoks
function loadSessionChanges() {
    if (!editSessionId) return;

    $.ajax({
        url: `/api/v1/table/session-changes/${editSessionId}`,
        method: "GET",
        dataType: "json",
        success: function (response) {
            // Uuenda muudatuste nimekirja kasutajaliidest
            updateChangesListUI(response.changes);
        },
        error: function (xhr, status, error) {
            console.error("Viga seansi muudatuste laadimisel:", error);
        }
    });
}

// Uuenda muudatuste nimekirja kasutajaliidest
function updateChangesListUI(changes) {
    const container = $("#changes-list");
    container.empty();

    if (!changes || changes.length === 0) {
        container.html('<div class="text-gray-500 dark:text-gray-400 text-sm italic">Muudatusi pole veel</div>');
        $("#undo-all-btn").prop("disabled", true);
        return;
    }

    // Luba tühista kõik nupp
    $("#undo-all-btn").prop("disabled", false);

    // Lisa iga muudatus nimekirja
    changes.forEach(function (change) {
        const changeTime = new Date(change.changed_at).toLocaleTimeString();
        const changeItem = $(`
            <div class="change-item mb-2 p-2 border-b border-gray-200 dark:border-gray-700">
                <div class="flex justify-between">
                    <div class="font-semibold text-sm">${change.column_name}</div>
                    <div class="text-xs text-gray-500">${changeTime}</div>
                </div>
                <div class="text-xs mt-1">
                    <span class="text-red-500 line-through">${change.old_value || '(tühi)'}</span>
                    <span class="mx-1">→</span>
                    <span class="text-green-500">${change.new_value || '(tühi)'}</span>
                </div>
                <button class="undo-change-btn text-xs text-blue-500 hover:text-blue-700 mt-1" data-id="${change.id}">
                    <i class="fas fa-undo mr-1"></i>Tühista
                </button>
            </div>
        `);

        container.append(changeItem);
    });

    // Lisa klõpsamisel tühistamise nuppudele
    $(".undo-change-btn").click(function () {
        const changeId = $(this).data("id");
        undoChange(changeId);
    });
}

// Tühista konkreetne muudatus
function undoChange(changeId) {
    $.ajax({
        url: `/api/v1/table/undo-change/${changeId}`,
        method: "POST",
        dataType: "json",
        success: function (response) {
            if (response.success) {
                // Värskenda tabeli andmeid
                if (gridApi) {
                    gridApi.refreshInfiniteCache();
                }

                // Lae muudatuste nimekiri uuesti
                loadSessionChanges();

                // Näita õnnestumise teavitust
                showToast("Muudatus tühistatud", "Muudatus edukalt tagasi võetud", "success");
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga muudatuse tühistamisel:", error);
            showToast("Tühistamine ebaõnnestus", xhr.responseJSON?.detail || error, "error");
        }
    });
}

// Tühista kõik muudatused praeguses seansis
function undoAllChanges() {
    if (!confirm("Kas olete kindel, et soovite tühistada kõik muudatused selles seansis?")) {
        return;
    }

    // Hangi kõik muudatused ja tühista need ükshaaval
    $.ajax({
        url: `/api/v1/table/session-changes/${editSessionId}`,
        method: "GET",
        dataType: "json",
        success: function (response) {
            if (response.changes && response.changes.length > 0) {
                const undoPromises = response.changes.map(change => {
                    return $.ajax({
                        url: `/api/v1/table/undo-change/${change.id}`,
                        method: "POST",
                        dataType: "json"
                    });
                });

                // Kui kõik tühistamised on lõpetatud
                Promise.all(undoPromises)
                    .then(() => {
                        // Värskenda tabeli andmeid
                        if (gridApi) {
                            gridApi.refreshInfiniteCache();
                        }

                        // Lae muudatuste nimekiri uuesti
                        loadSessionChanges();

                        // Näita õnnestumise teavitust
                        showToast("Kõik muudatused tühistatud", "Kõik muudatused edukalt tagasi võetud", "success");
                    })
                    .catch(error => {
                        console.error("Viga kõigi muudatuste tühistamisel:", error);
                        showToast("Tühistamine ebaõnnestus", "Mõned muudatused ei õnnestunud tühistada", "error");
                    });
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga seansi muudatuste hankimisel:", error);
            showToast("Tühistamine ebaõnnestus", "Ei õnnestunud hankida muudatusi tühistamiseks", "error");
        }
    });
}

// Seadista teavitused teiste kasutajate muudatustest
function setupChangeNotifications() {
    // Määra algne ajatempel
    lastChangeCheck = new Date().toISOString();

    // Kontrolli muudatusi iga 15 sekundi järel
    changeCheckInterval = setInterval(checkForChanges, 15000);
}

// Kontrolli muudatusi teistelt kasutajatelt
function checkForChanges() {
    $.ajax({
        url: "/api/v1/table/check-for-changes",
        method: "GET",
        data: {
            last_checked: lastChangeCheck
        },
        dataType: "json",
        success: function (response) {
            // Uuenda viimase kontrolli ajatemplit
            lastChangeCheck = response.timestamp;

            // Kui on muudatusi, teavita kasutajat
            if (response.has_changes) {
                showDataChangeNotification(response.changes);
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga muudatuste kontrollimisel:", error);
        }
    });
}

// Näita teavitust teiste kasutajate andmemuudatuste kohta
function showDataChangeNotification(changes) {
    if (!changes || changes.length === 0) return;

    // Hangi kasutaja, kes tegi viimase muudatuse
    const latestChange = changes[0];
    const username = latestChange.username;

    // Tõsta esile ka värskendamise nupp
    if (typeof highlightRefreshButton === 'function') {
        highlightRefreshButton(changes);
    }

    // Loo teavituse element
    const notification = $(`
        <div class="change-notification bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 p-3 rounded-lg shadow-lg mb-3 transform transition-all duration-300 opacity-0 translate-x-10">
            <div class="flex items-center">
                <i class="fas fa-info-circle mr-2"></i>
                <div>
                    <div class="font-medium">Andmeid on uuendatud</div>
                    <div class="text-sm">${username} tegi andmetes muudatusi</div>
                </div>
            </div>
            <div class="mt-2">
                <button class="refresh-data-btn bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-xs">
                    Värskenda andmeid
                </button>
                <button class="dismiss-btn ml-2 text-blue-800 hover:text-blue-900 dark:text-blue-200 dark:hover:text-white py-1 px-2 text-xs">
                    Sulge
                </button>
            </div>
        </div>
    `);

    // Lisa teavituste konteinerisse
    $("#notification-container").append(notification);

    // Näita animatsiooniga
    setTimeout(() => {
        notification.removeClass("opacity-0 translate-x-10");
    }, 10);

    // Lisa klõpsamisel käsitlejad
    notification.find(".refresh-data-btn").click(function () {
        // Värskenda tabeli andmeid
        refreshData(); // Kutsu meie uut funktsiooni selle asemel

        // Eemalda teavitus
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    });

    notification.find(".dismiss-btn").click(function () {
        // Eemalda teavitus
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    });

    // Automaatne sulgemine 15 sekundi pärast
    setTimeout(function () {
        notification.addClass("opacity-0 translate-x-10");
        setTimeout(() => notification.remove(), 300);
    }, 15000);
}

// Näita teavitust
function showToast(title, message, type, duration = 3000) {
    // Determine background and text colors based on notification type and dark mode
    let bgClass, textClass;
    const isDarkMode = document.body.classList.contains('dark-mode');

    if (type === 'success') {
        bgClass = isDarkMode ? 'bg-green-900' : 'bg-green-100';
        textClass = isDarkMode ? 'text-green-100' : 'text-green-800';
    } else if (type === 'error') {
        bgClass = isDarkMode ? 'bg-red-900' : 'bg-red-100';
        textClass = isDarkMode ? 'text-red-100' : 'text-red-800';
    } else if (type === 'warning') {
        bgClass = isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100';
        textClass = isDarkMode ? 'text-yellow-100' : 'text-yellow-800';
    } else { // info or default
        bgClass = isDarkMode ? 'bg-blue-900' : 'bg-blue-100';
        textClass = isDarkMode ? 'text-blue-100' : 'text-blue-800';
    }

    // Create toast with proper styling
    const toast = $(`
        <div class="notification ${bgClass} ${textClass} mb-2 rounded-lg shadow-sm border-l-4 
                  ${type === 'success' ? 'border-green-500' :
        type === 'error' ? 'border-red-500' :
            type === 'warning' ? 'border-yellow-500' : 'border-blue-500'} p-3">
            <div class="flex items-center">
                <div class="notification-icon">
                    <i class="fas fa-${type === 'success' ? 'check-circle' :
        type === 'error' ? 'exclamation-circle' :
            type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium">${title}</h3>
                    <div class="mt-1 text-xs">${message}</div>
                </div>
                <div class="ml-auto pl-3">
                    <button class="notification-close text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
    `).appendTo("#notification-container");

    // Add animation class
    setTimeout(() => toast.addClass('show'), 10);

    // Set up close button
    toast.find('.notification-close').on('click', function () {
        closeToast(toast);
    });

    // Auto-close after duration (if not -1)
    let timeoutId = null;
    if (duration !== -1) {
        timeoutId = setTimeout(() => closeToast(toast), duration);
    }

    // Store the timeout ID for possible cancellation
    toast.data('timeout-id', timeoutId);

    // Add hide method to the toast
    toast.hide = function () {
        closeToast(toast);
    };

    return toast;

    function closeToast(toast) {
        // Clear any existing timeout
        const timeoutId = toast.data('timeout-id');
        if (timeoutId) clearTimeout(timeoutId);

        // Hide with animation
        toast.removeClass('show');
        setTimeout(() => toast.remove(), 300);
    }
}

// Kohandatud lahtri stiil redigeeritavate lahtrite jaoks - integreerib AG Grid'iga
function getCellStyle(params) {
    // Check if we're in dark mode
    const isDarkMode = document.body.classList.contains('dark-mode');

    // Highlight editable cells when in edit mode
    if (window.appState.isEditMode && window.appState.editableColumns.includes(params.colDef.field)) {
        return {
            backgroundColor: isDarkMode ? "#93c5fd" : "#dbeafe",
            color: "#000000",
            cursor: "pointer",
            border: isDarkMode ? "1px solid #60a5fa" : "none"
        };
    }

    // Special styling for highlighted/selected cells in dark mode
    if (isDarkMode && params.node.isSelected()) {
        return {
            color: "#000000"
        };
    }

    return null;
}

// Need funktsioonid peavad olema ligipääsetavad globaalses ulatuses AG Grid'iga integreerimiseks
window.getEditableColumns = getEditableColumns;
window.setupEditHandlers = setupEditHandlers;
window.setupChangeNotifications = setupChangeNotifications;
window.setupWebSocket = setupWebSocket;
window.toggleEditMode = toggleEditMode;
window.enableEditMode = enableEditMode;
window.disableEditMode = disableEditMode;
window.onCellValueChanged = onCellValueChanged;
window.loadSessionChanges = loadSessionChanges;
window.updateChangesListUI = updateChangesListUI;
window.undoChange = undoChange;
window.undoAllChanges = undoAllChanges;
window.checkForChanges = checkForChanges;
window.showDataChangeNotification = showDataChangeNotification;
window.showToast = showToast;
window.getCellStyle = getCellStyle;