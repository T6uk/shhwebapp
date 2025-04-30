// app/static/js/version-checker.js
(function() {
    // Version checker for auto-refresh when new versions are deployed
    const CURRENT_VERSION = document.documentElement.getAttribute('data-cache-version') || '';
    const CHECK_INTERVAL = 60000; // Check every minute

    // Skip in development with frequent reloads
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Version checking disabled on development server');
        return;
    }

    function checkVersion() {
        // Add a random parameter to avoid getting cached response
        fetch(`/api/v1/cache-version?_=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
                const serverVersion = data.version || '';

                if (CURRENT_VERSION && serverVersion && CURRENT_VERSION !== serverVersion) {
                    console.log(`New version detected: ${serverVersion} (current: ${CURRENT_VERSION})`);

                    // Show update notification
                    const notification = document.createElement('div');
                    notification.className = 'fixed top-0 inset-x-0 p-4 bg-blue-500 text-white z-50 flex items-center justify-between';
                    notification.innerHTML = `
                        <div class="flex items-center">
                            <i class="fas fa-sync-alt mr-2"></i>
                            <span>Rakenduse uus versioon on saadaval. Värskenda lehte uuenduste saamiseks.</span>
                        </div>
                        <div class="flex space-x-2">
                            <button id="update-now" class="bg-white text-blue-500 px-3 py-1 rounded text-sm">
                                Värskenda kohe
                            </button>
                            <button id="update-later" class="text-white border border-white px-3 py-1 rounded text-sm">
                                Hiljem
                            </button>
                        </div>
                    `;

                    document.body.appendChild(notification);

                    // Handle update now button
                    document.getElementById('update-now').addEventListener('click', function() {
                        window.location.reload(true);
                    });

                    // Handle update later button
                    document.getElementById('update-later').addEventListener('click', function() {
                        notification.remove();
                    });
                }
            })
            .catch(error => console.error('Version check failed:', error));
    }

    // Check immediately and then on interval
    setTimeout(checkVersion, 5000);
    setInterval(checkVersion, CHECK_INTERVAL);
})();