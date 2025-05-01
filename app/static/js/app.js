// app/static/js/app.js
// Main application file - loads all modules

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Load all required module scripts
document.addEventListener('DOMContentLoaded', function() {
    // Define modules to load
    const modules = [
        'core',
        'theme',
        'grid',
        'search',
        'filters',
        'saved-filters',
        'ui',
        'export',
        'events'
    ];

    // Load each module
    modules.forEach(module => {
        const script = document.createElement('script');
        script.src = `/static/js/modules/${module}.js?v=${new Date().getTime()}`;
        document.head.appendChild(script);
    });
});