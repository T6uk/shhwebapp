// app/static/js/edit.js - Tabeli redigeerimise funktsioonid
// Globaalsed muutujad redigeerimiseks
let isEditMode = false;
let editSessionId = null;
let editableColumns = [];
let unsavedChanges = {};
let lastChangeCheck = null;
let changeCheckInterval = null;
let socket = null;

// Algväärtusta kui dokument on laaditud
$(document).ready(function () {
    // Kontrolli, kas kasutajal on redigeerimisõigused ja lae redigeeritavad veerud
    getEditableColumns();

    // Seadista sündmuste käsitlejad redigeerimisfunktsionaalsusele
    setupEditHandlers();

    // Kontrolli muudatusi teistelt kasutajatelt
    setupChangeNotifications();

    setupWebSocket();

    const originalInit = window.getEditableColumns;

    // Override the original function to add our initialization
    window.getEditableColumns = function () {
        // Call the original function
        if (originalInit) originalInit();

        // Initialize button hover state
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
    };
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
            editableColumns = response.columns || [];

            // Näita redigeerimise nuppu ainult siis, kui kasutajal on õigused
            if (response.can_edit) {
                $("#edit-mode-container").removeClass("hidden");
            }

            console.log("Redigeeritavad veerud:", editableColumns);
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

    // Add log to verify this function runs
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
                // Enable edit mode
                isEditMode = true;
                editSessionId = response.session_id;

                // Update button UI using classes
                const editBtn = document.getElementById('edit-mode-btn');
                editBtn.textContent = "Lülita redigeerimine välja";

                // Remove inactive class and add active class
                $(editBtn).removeClass('edit-mode-inactive')
                    .addClass('edit-mode-active');

                console.log("Edit mode enabled, button should be red now");

                // Reset unsaved changes
                unsavedChanges = {};

                // Redraw rows to highlight editable cells
                if (gridApi) {
                    gridApi.redrawRows();
                }

                // Show edit history panel
                $("#edit-history-panel").removeClass("hidden");

                // Show notification
                showToast("Redigeerimisrežiim lubatud", "Saate nüüd redigeerida esiletõstetud lahtreid topeltklõpsates", "info");
            } else {
                // Show error
                showToast("Redigeerimisrežiimi viga", response.message || "Vale parool", "error");
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga parooli kontrollimisel:", error);
            showToast("Viga", "Redigeerimisrežiimi lubamine ebaõnnestus", "error");
        }
    });
}

// Disable edit mode
function disableEditMode() {
    // Check for unsaved changes
    if (Object.keys(unsavedChanges).length > 0) {
        if (!confirm("Teil on salvestamata muudatusi. Kas olete kindel, et soovite redigeerimisrežiimist väljuda? Muudatusi ei saa hiljem tagasi võtta.")) {
            return;
        }
    }

    // Disable edit mode
    isEditMode = false;
    editSessionId = null;

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
    unsavedChanges = {};

    // Refresh table to remove highlighting
    if (gridApi) {
        gridApi.redrawRows();
    }

    // Show notification
    showToast("Redigeerimisrežiim keelatud", "Olete nüüd ainult vaatamise režiimis", "info");
}

// Käsitle lahtri väärtuse muutmist - see integreerib AG Grid'iga
function onCellValueChanged(params) {
    // Töötle ainult redigeerimisrežiimis
    if (!isEditMode) return;

    const column = params.column.getColDef().field;
    const rowId = params.data.id;
    const oldValue = params.oldValue;
    const newValue = params.newValue;

    // Jäta vahele, kui tegelikku muudatust pole
    if (oldValue === newValue) return;

    // Võti selle muudatuse jälgimiseks
    const changeKey = `${rowId}_${column}`;

    // Lisa salvestamata muudatustesse
    unsavedChanges[changeKey] = {
        rowId: rowId,
        column: column,
        oldValue: oldValue,
        newValue: newValue,
        timestamp: new Date().toISOString()
    };

    // Salvesta serverisse
    $.ajax({
        url: "/api/v1/table/update-cell",
        method: "POST",
        data: {
            table_name: "taitur_data", // Asenda oma tegeliku tabeli nimega
            row_id: rowId,
            column_name: column,
            old_value: oldValue,
            new_value: newValue,
            session_id: editSessionId
        },
        dataType: "json",
        success: function (response) {
            if (response.success) {
                // Eemalda salvestamata muudatustest, kuna see on salvestatud
                delete unsavedChanges[changeKey];

                // Uuenda muudatuste nimekirja
                loadSessionChanges();

                // Näita õnnestumise teavitust
                showToast("Lahter uuendatud", `Veeru ${column} väärtus edukalt uuendatud`, "success");
            }
        },
        error: function (xhr, status, error) {
            console.error("Viga lahtri uuendamisel:", error);

            // Taasta muudatus tabelis
            params.node.setDataValue(column, oldValue);

            // Näita vea teavitust
            showToast("Uuendamine ebaõnnestus", xhr.responseJSON?.detail || error, "error");
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
function showToast(title, message, type = "info") {
    // Determine if in dark mode
    const isDark = document.body.classList.contains('dark-mode');

    // Define colors for light and dark mode
    let colors = {
        "success": isDark ? "bg-green-900 text-green-100 border border-green-800" : "bg-green-100 text-green-800 border border-green-200",
        "error": isDark ? "bg-red-900 text-red-100 border border-red-800" : "bg-red-100 text-red-800 border border-red-200",
        "info": isDark ? "bg-blue-900 text-blue-100 border border-blue-800" : "bg-blue-100 text-blue-800 border border-blue-200",
        "warning": isDark ? "bg-yellow-900 text-yellow-100 border border-yellow-800" : "bg-yellow-100 text-yellow-800 border border-yellow-200"
    };

    let icons = {
        "success": "fas fa-check-circle",
        "error": "fas fa-exclamation-circle",
        "info": "fas fa-info-circle",
        "warning": "fas fa-exclamation-triangle"
    };

    // Create the toast element with enhanced styling
    const toast = $(`
        <div class="toast-notification ${colors[type]} p-3 rounded-lg shadow-lg mb-3 transform transition-all duration-300 opacity-0 translate-y-10">
            <div class="flex items-center">
                <i class="${icons[type]} mr-2"></i>
                <div>
                    <div class="font-medium">${title}</div>
                    <div class="text-sm">${message}</div>
                </div>
                <button class="close-toast ml-4 text-gray-400 hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `);

    // Add to the notifications container
    $("#notification-container").append(toast);

    // Show with animation
    setTimeout(() => {
        toast.removeClass("opacity-0 translate-y-10");
    }, 10);

    // Add click handler for close button
    toast.find(".close-toast").click(function () {
        toast.addClass("opacity-0 translate-y-10");
        setTimeout(() => toast.remove(), 300);
    });

    // Auto-close after 5 seconds
    setTimeout(function () {
        toast.addClass("opacity-0 translate-y-10");
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Kohandatud lahtri stiil redigeeritavate lahtrite jaoks - integreerib AG Grid'iga
function getCellStyle(params) {
    // Check if we're in dark mode
    const isDarkMode = document.body.classList.contains('dark-mode');

    // Tõsta esile redigeeritavad lahtrid, kui ollakse redigeerimisrežiimis
    if (isEditMode && editableColumns.includes(params.colDef.field)) {
        return {
            backgroundColor: isDarkMode ? "#93c5fd" : "#dbeafe",  // Lighter blue in dark mode
            color: "#000000", // Always black text for highlighted cells
            cursor: "pointer",
            // Add a subtle border to make it stand out more in dark mode
            border: isDarkMode ? "1px solid #60a5fa" : "none"
        };
    }

    // Special styling for highlighted/selected cells in dark mode
    if (isDarkMode && params.node.isSelected()) {
        return {
            color: "#000000" // Black text for selected cells in dark mode
        };
    }

    return null;
}

// Need funktsioonid peavad olema ligipääsetavad globaalses ulatuses AG Grid'iga integreerimiseks
window.onCellValueChanged = onCellValueChanged;
window.getCellStyle = getCellStyle;