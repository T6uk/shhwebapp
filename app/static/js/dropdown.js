/* app/static/js/dropdown.js */
/* Smooth dropdown system with keyboard navigation and accessibility */

class DropdownManager {
    constructor() {
        this.activeDropdown = null;
        this.keyboardIndex = -1;
        this.dropdowns = new Map();
        this.isMobile = window.innerWidth <= 768;

        this.init();
    }

    init() {
        this.bindEvents();
        this.setupDropdowns();
        this.handleResize();
    }

    bindEvents() {
        // Global click handler to close dropdowns
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.dropdown').length) {
                this.closeAllDropdowns();
            }
        });

        // Global escape key handler
        $(document).on('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllDropdowns();
            }
        });

        // Window resize handler
        $(window).on('resize', () => {
            this.handleResize();
            if (this.activeDropdown) {
                this.updateDropdownPosition(this.activeDropdown);
            }
        });

        // Prevent dropdown close when clicking inside dropdown menu
        $(document).on('click', '.dropdown-menu', (e) => {
            e.stopPropagation();
        });
    }

    setupDropdowns() {
        $('.dropdown').each((index, element) => {
            const $dropdown = $(element);
            const $toggle = $dropdown.find('[id$="-dropdown-toggle"], .dropdown-toggle').first();
            const $menu = $dropdown.find('[id$="-dropdown-menu"], .dropdown-menu').first();

            if ($toggle.length && $menu.length) {
                this.registerDropdown($dropdown, $toggle, $menu);
            }
        });
    }

    registerDropdown($container, $toggle, $menu) {
        const dropdownId = $toggle.attr('id') || `dropdown-${Date.now()}`;

        const dropdown = {
            id: dropdownId,
            container: $container,
            toggle: $toggle,
            menu: $menu,
            isOpen: false,
            items: $menu.find('.dropdown-item')
        };

        this.dropdowns.set(dropdownId, dropdown);

        // Bind toggle click
        $toggle.on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleDropdown(dropdownId);
        });

        // Bind keyboard navigation
        $toggle.on('keydown', (e) => {
            this.handleToggleKeydown(e, dropdownId);
        });

        $menu.on('keydown', (e) => {
            this.handleMenuKeydown(e, dropdownId);
        });

        // Bind item clicks
        dropdown.items.on('click', (e) => {
            this.handleItemClick(e, dropdownId);
        });

        // Set ARIA attributes
        $toggle.attr({
            'aria-haspopup': 'true',
            'aria-expanded': 'false',
            'aria-controls': $menu.attr('id') || `${dropdownId}-menu`
        });

        $menu.attr({
            'id': $menu.attr('id') || `${dropdownId}-menu`,
            'role': 'menu',
            'aria-labelledby': dropdownId
        });

        dropdown.items.attr('role', 'menuitem');
    }

    toggleDropdown(dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        if (!dropdown) return;

        if (dropdown.isOpen) {
            this.closeDropdown(dropdownId);
        } else {
            this.openDropdown(dropdownId);
        }
    }

    openDropdown(dropdownId) {
        // Close other dropdowns first
        this.closeAllDropdowns();

        const dropdown = this.dropdowns.get(dropdownId);
        if (!dropdown) return;

        dropdown.isOpen = true;
        this.activeDropdown = dropdown;
        this.keyboardIndex = -1;

        // Add mobile backdrop if needed
        if (this.isMobile) {
            this.showBackdrop();
        }

        // Update position and show
        this.updateDropdownPosition(dropdown);

        // Trigger opening animation
        requestAnimationFrame(() => {
            dropdown.menu.addClass('show');
            dropdown.toggle.attr('aria-expanded', 'true');
        });

        // Focus management
        setTimeout(() => {
            dropdown.menu.attr('tabindex', '-1').focus();
        }, 150);

        // Trigger custom event
        dropdown.container.trigger('dropdown:open', { dropdown: dropdown });
    }

    closeDropdown(dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        if (!dropdown || !dropdown.isOpen) return;

        dropdown.isOpen = false;
        dropdown.menu.removeClass('show');
        dropdown.toggle.attr('aria-expanded', 'false');

        // Clear keyboard navigation
        this.clearKeyboardFocus(dropdown);

        // Return focus to toggle
        dropdown.toggle.focus();

        // Hide backdrop
        this.hideBackdrop();

        if (this.activeDropdown === dropdown) {
            this.activeDropdown = null;
        }

        // Trigger custom event
        dropdown.container.trigger('dropdown:close', { dropdown: dropdown });
    }

    closeAllDropdowns() {
        this.dropdowns.forEach((dropdown) => {
            if (dropdown.isOpen) {
                this.closeDropdown(dropdown.id);
            }
        });
        this.hideBackdrop();
    }

    updateDropdownPosition(dropdown) {
        const $menu = dropdown.menu;
        const $toggle = dropdown.toggle;

        // Reset position classes
        $menu.removeClass('dropdown-left dropdown-center');

        // Get dimensions
        const toggleRect = $toggle[0].getBoundingClientRect();
        const menuWidth = $menu.outerWidth();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Handle mobile positioning
        if (this.isMobile) {
            $menu.css({
                position: 'fixed',
                left: '50%',
                bottom: '1rem',
                top: 'auto',
                right: 'auto',
                transform: 'translateX(-50%)'
            });
            return;
        }

        // Reset styles for desktop
        $menu.css({
            position: 'absolute',
            left: '',
            bottom: '',
            top: '100%',
            right: '0',
            transform: ''
        });

        // Check if dropdown overflows on the right
        if (toggleRect.right - menuWidth < 0) {
            $menu.addClass('dropdown-left');
        }

        // Check if dropdown overflows on the bottom
        const spaceBelow = windowHeight - toggleRect.bottom;
        const menuHeight = $menu.outerHeight();

        if (spaceBelow < menuHeight && toggleRect.top > menuHeight) {
            $menu.css({
                top: 'auto',
                bottom: '100%'
            });
        }
    }

    handleToggleKeydown(e, dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        if (!dropdown) return;

        switch (e.key) {
            case 'Enter':
            case ' ':
            case 'ArrowDown':
                e.preventDefault();
                if (!dropdown.isOpen) {
                    this.openDropdown(dropdownId);
                    setTimeout(() => this.focusFirstItem(dropdown), 150);
                } else {
                    this.focusFirstItem(dropdown);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (!dropdown.isOpen) {
                    this.openDropdown(dropdownId);
                    setTimeout(() => this.focusLastItem(dropdown), 150);
                } else {
                    this.focusLastItem(dropdown);
                }
                break;
        }
    }

    handleMenuKeydown(e, dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        if (!dropdown) return;

        const items = dropdown.items.filter(':visible:not(.disabled)');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.keyboardIndex = Math.min(this.keyboardIndex + 1, items.length - 1);
                this.updateKeyboardFocus(dropdown, items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.keyboardIndex = Math.max(this.keyboardIndex - 1, 0);
                this.updateKeyboardFocus(dropdown, items);
                break;
            case 'Home':
                e.preventDefault();
                this.keyboardIndex = 0;
                this.updateKeyboardFocus(dropdown, items);
                break;
            case 'End':
                e.preventDefault();
                this.keyboardIndex = items.length - 1;
                this.updateKeyboardFocus(dropdown, items);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (this.keyboardIndex >= 0 && this.keyboardIndex < items.length) {
                    $(items[this.keyboardIndex]).trigger('click');
                }
                break;
            case 'Tab':
                this.closeDropdown(dropdownId);
                break;
        }
    }

    handleItemClick(e, dropdownId) {
        const $item = $(e.currentTarget);

        // Don't close if item has a submenu or is disabled
        if ($item.hasClass('disabled') || $item.attr('aria-haspopup')) {
            e.preventDefault();
            return;
        }

        // Trigger custom event before closing
        $item.trigger('dropdown:item:click', {
            item: $item,
            dropdownId: dropdownId
        });

        // Close dropdown after a short delay to allow for visual feedback
        setTimeout(() => {
            this.closeDropdown(dropdownId);
        }, 100);
    }

    focusFirstItem(dropdown) {
        const items = dropdown.items.filter(':visible:not(.disabled)');
        if (items.length > 0) {
            this.keyboardIndex = 0;
            this.updateKeyboardFocus(dropdown, items);
        }
    }

    focusLastItem(dropdown) {
        const items = dropdown.items.filter(':visible:not(.disabled)');
        if (items.length > 0) {
            this.keyboardIndex = items.length - 1;
            this.updateKeyboardFocus(dropdown, items);
        }
    }

    updateKeyboardFocus(dropdown, items) {
        this.clearKeyboardFocus(dropdown);

        if (this.keyboardIndex >= 0 && this.keyboardIndex < items.length) {
            const $item = $(items[this.keyboardIndex]);
            $item.addClass('keyboard-focus').focus();
        }
    }

    clearKeyboardFocus(dropdown) {
        dropdown.items.removeClass('keyboard-focus');
    }

    showBackdrop() {
        if (!$('.dropdown-backdrop').length) {
            $('body').append('<div class="dropdown-backdrop"></div>');
        }

        $('.dropdown-backdrop').addClass('show').on('click', () => {
            this.closeAllDropdowns();
        });
    }

    hideBackdrop() {
        $('.dropdown-backdrop').removeClass('show').off('click');
        setTimeout(() => {
            $('.dropdown-backdrop').remove();
        }, 200);
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth <= 768;

        if (wasMobile !== this.isMobile && this.activeDropdown) {
            this.updateDropdownPosition(this.activeDropdown);
        }
    }

    // Public API methods
    open(dropdownId) {
        this.openDropdown(dropdownId);
    }

    close(dropdownId) {
        this.closeDropdown(dropdownId);
    }

    closeAll() {
        this.closeAllDropdowns();
    }

    isOpen(dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        return dropdown ? dropdown.isOpen : false;
    }

    // Method to dynamically add dropdowns
    addDropdown($container, $toggle, $menu) {
        this.registerDropdown($container, $toggle, $menu);
    }

    // Method to remove dropdowns
    removeDropdown(dropdownId) {
        const dropdown = this.dropdowns.get(dropdownId);
        if (dropdown) {
            this.closeDropdown(dropdownId);
            dropdown.toggle.off('click keydown');
            dropdown.menu.off('keydown');
            dropdown.items.off('click');
            this.dropdowns.delete(dropdownId);
        }
    }
}

// Utility functions for specific dropdown behaviors
const DropdownUtils = {
    // Load content into dropdown
    loadContent: function(dropdownId, content) {
        const manager = window.dropdownManager;
        const dropdown = manager.dropdowns.get(dropdownId);
        if (dropdown) {
            dropdown.menu.html(content);
            // Re-register items
            dropdown.items = dropdown.menu.find('.dropdown-item');
            dropdown.items.attr('role', 'menuitem');
            dropdown.items.on('click', (e) => {
                manager.handleItemClick(e, dropdownId);
            });
        }
    },

    // Show loading state
    showLoading: function(dropdownId, message = 'Loading...') {
        const manager = window.dropdownManager;
        const dropdown = manager.dropdowns.get(dropdownId);
        if (dropdown) {
            const loadingHtml = `
                <div class="dropdown-loading">
                    <div class="spinner"></div>
                    <span>${message}</span>
                </div>
            `;
            dropdown.menu.html(loadingHtml);
        }
    },

    // Add new item to dropdown
    addItem: function(dropdownId, itemHtml, position = 'append') {
        const manager = window.dropdownManager;
        const dropdown = manager.dropdowns.get(dropdownId);
        if (dropdown) {
            const $item = $(itemHtml);

            if (position === 'prepend') {
                dropdown.menu.prepend($item);
            } else {
                dropdown.menu.append($item);
            }

            // Update items cache
            dropdown.items = dropdown.menu.find('.dropdown-item');

            // Bind click handler
            $item.filter('.dropdown-item').on('click', (e) => {
                manager.handleItemClick(e, dropdownId);
            });
        }
    },

    // Remove item from dropdown
    removeItem: function(dropdownId, selector) {
        const manager = window.dropdownManager;
        const dropdown = manager.dropdowns.get(dropdownId);
        if (dropdown) {
            dropdown.menu.find(selector).remove();
            dropdown.items = dropdown.menu.find('.dropdown-item');
        }
    }
};

// Initialize dropdown system when DOM is ready
$(document).ready(function() {
    // Create global dropdown manager
    window.dropdownManager = new DropdownManager();
    window.DropdownUtils = DropdownUtils;

    console.log('Dropdown system initialized');
});