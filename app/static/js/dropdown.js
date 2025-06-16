// app/static/js/dropdown.js
// Enhanced dropdown system with anti-flicker and proper z-index handling

(function() {
    'use strict';

    // Prevent multiple initializations
    if (window.dropdownSystemInitialized) {
        return;
    }
    window.dropdownSystemInitialized = true;

    let activeDropdown = null;
    let dropdownTimeout = null;

    // Initialize dropdown system when DOM is ready
    $(document).ready(function() {
        initializeDropdownSystem();
    });

    function initializeDropdownSystem() {
        console.log('Initializing enhanced dropdown system...');

        // Set up all dropdown toggles
        setupDropdownToggles();

        // Set up global click handler to close dropdowns
        setupGlobalCloseHandler();

        // Set up keyboard navigation
        setupKeyboardNavigation();

        console.log('Dropdown system initialized successfully');
    }

    function setupDropdownToggles() {
        // Find all dropdown toggles and set up event handlers
        $('[id$="-dropdown-toggle"]').each(function() {
            const $toggle = $(this);
            const dropdownId = $toggle.attr('id').replace('-toggle', '-menu');
            const $dropdown = $('#' + dropdownId);

            if ($dropdown.length === 0) {
                console.warn(`Dropdown menu not found for toggle: ${$toggle.attr('id')}`);
                return;
            }

            // Remove any existing event handlers to prevent duplicates
            $toggle.off('click.dropdown mouseenter.dropdown mouseleave.dropdown');

            // FIXED: Use click handler with anti-flicker measures
            $toggle.on('click.dropdown', function(e) {
                e.preventDefault();
                e.stopPropagation();

                // Clear any pending timeouts
                clearTimeout(dropdownTimeout);

                toggleDropdown($toggle, $dropdown);
            });

            // FIXED: Add hover handlers with delays to prevent flickering
            $toggle.on('mouseenter.dropdown', function(e) {
                // Clear any pending close timeouts
                clearTimeout(dropdownTimeout);
            });

            $toggle.on('mouseleave.dropdown', function(e) {
                // Only start close timer if we're not moving to the dropdown menu
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || (!$dropdown[0].contains(relatedTarget) && relatedTarget !== $dropdown[0])) {
                    startCloseTimer($dropdown);
                }
            });

            // FIXED: Set up dropdown menu hover handlers
            $dropdown.on('mouseenter.dropdown', function(e) {
                clearTimeout(dropdownTimeout);
            });

            $dropdown.on('mouseleave.dropdown', function(e) {
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || (!$toggle[0].contains(relatedTarget) && relatedTarget !== $toggle[0])) {
                    startCloseTimer($dropdown);
                }
            });

            console.log(`Dropdown handlers set up for: ${$toggle.attr('id')}`);
        });
    }

    function toggleDropdown($toggle, $dropdown) {
        const isCurrentlyOpen = $dropdown.hasClass('show');

        // Close any other open dropdowns first
        closeAllDropdowns();

        if (!isCurrentlyOpen) {
            openDropdown($toggle, $dropdown);
        }
    }

    function openDropdown($toggle, $dropdown) {
        // FIXED: Ensure proper z-index and positioning
        $dropdown.css({
            'z-index': '9999',
            'position': 'absolute'
        });

        // Add show class and update toggle state
        $dropdown.addClass('show');
        $toggle.addClass('active');

        // Set active dropdown reference
        activeDropdown = $dropdown;

        // FIXED: Force layout recalculation to prevent flickering
        $dropdown[0].offsetHeight;

        // Update ARIA attributes for accessibility
        $toggle.attr('aria-expanded', 'true');
        $dropdown.attr('aria-hidden', 'false');

        console.log(`Opened dropdown: ${$dropdown.attr('id')}`);
    }

    function closeDropdown($dropdown) {
        if (!$dropdown || !$dropdown.length) return;

        const toggleId = $dropdown.attr('id').replace('-menu', '-toggle');
        const $toggle = $('#' + toggleId);

        // Remove show class and update toggle state
        $dropdown.removeClass('show');
        $toggle.removeClass('active');

        // Clear active dropdown reference
        if (activeDropdown && activeDropdown[0] === $dropdown[0]) {
            activeDropdown = null;
        }

        // Update ARIA attributes for accessibility
        $toggle.attr('aria-expanded', 'false');
        $dropdown.attr('aria-hidden', 'true');

        console.log(`Closed dropdown: ${$dropdown.attr('id')}`);
    }

    function closeAllDropdowns() {
        $('.dropdown-menu.show').each(function() {
            closeDropdown($(this));
        });

        // Clear any pending timeouts
        clearTimeout(dropdownTimeout);
        activeDropdown = null;
    }

    function startCloseTimer($dropdown, delay = 150) {
        clearTimeout(dropdownTimeout);
        dropdownTimeout = setTimeout(() => {
            closeDropdown($dropdown);
        }, delay);
    }

    function setupGlobalCloseHandler() {
        // Close dropdowns when clicking outside
        $(document).on('click.dropdown', function(e) {
            const $target = $(e.target);

            // Don't close if clicking inside a dropdown or its toggle
            if ($target.closest('.dropdown-menu, .dropdown-toggle').length === 0) {
                closeAllDropdowns();
            }
        });

        // Close dropdowns on window resize
        $(window).on('resize.dropdown', function() {
            closeAllDropdowns();
        });

        // Close dropdowns when scrolling (optional, can be removed if not desired)
        $('#table-container').on('scroll.dropdown', function() {
            if (activeDropdown) {
                closeAllDropdowns();
            }
        });
    }

    function setupKeyboardNavigation() {
        // Handle Escape key to close dropdowns
        $(document).on('keydown.dropdown', function(e) {
            if (e.key === 'Escape' && activeDropdown) {
                closeAllDropdowns();

                // Return focus to the toggle button
                const toggleId = activeDropdown.attr('id').replace('-menu', '-toggle');
                $('#' + toggleId).focus();
            }
        });

        // Handle arrow key navigation within dropdowns
        $(document).on('keydown.dropdown', '.dropdown-menu', function(e) {
            const $dropdown = $(this);
            const $items = $dropdown.find('.dropdown-item:not(.disabled)');
            const currentIndex = $items.index($(':focus'));

            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const nextIndex = currentIndex < $items.length - 1 ? currentIndex + 1 : 0;
                    $items.eq(nextIndex).focus();
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : $items.length - 1;
                    $items.eq(prevIndex).focus();
                    break;

                case 'Enter':
                case ' ':
                    e.preventDefault();
                    $(':focus').click();
                    break;
            }
        });
    }

    // FIXED: Enhanced positioning for mobile and edge cases
    function updateDropdownPositioning() {
        $('.dropdown-menu.show').each(function() {
            const $dropdown = $(this);
            const $toggle = $('#' + $dropdown.attr('id').replace('-menu', '-toggle'));

            if ($toggle.length === 0) return;

            const toggleRect = $toggle[0].getBoundingClientRect();
            const dropdownRect = $dropdown[0].getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Reset positioning
            $dropdown.css({
                'position': 'absolute',
                'top': '',
                'bottom': '',
                'left': '',
                'right': '',
                'transform': ''
            });

            // Check if dropdown would overflow viewport
            if (toggleRect.right - dropdownRect.width < 0) {
                // Align to left edge of toggle if overflowing left
                $dropdown.css('left', '0');
            } else if (toggleRect.left + dropdownRect.width > viewportWidth) {
                // Align to right edge of toggle if overflowing right
                $dropdown.css('right', '0');
            }

            // Check vertical overflow
            if (toggleRect.bottom + dropdownRect.height > viewportHeight) {
                // Show above toggle if overflowing bottom
                $dropdown.css({
                    'top': 'auto',
                    'bottom': '100%',
                    'transform-origin': 'bottom'
                });
            }
        });
    }

    // Update positioning on window resize
    $(window).on('resize.dropdown', function() {
        updateDropdownPositioning();
    });

    // Expose utility functions globally for debugging
    window.dropdownUtils = {
        closeAllDropdowns: closeAllDropdowns,
        openDropdown: openDropdown,
        closeDropdown: closeDropdown,
        getActiveDropdown: function() { return activeDropdown; }
    };

    console.log('Enhanced dropdown system loaded successfully');

})();