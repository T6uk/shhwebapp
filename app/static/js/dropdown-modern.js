/**
 * Modern dropdown system with better UX and accessibility
 */
class DropdownModern {
  constructor(options = {}) {
    // Find all dropdowns on page load
    this.dropdowns = [];
    this.activeDropdown = null;

    // Default focus trap settings
    this.focusTrap = options.focusTrap !== false;

    // Close on click outside by default
    this.closeOnClickOutside = options.closeOnClickOutside !== false;

    // Find existing dropdowns when initialized
    this.init();

    // Close active dropdown when clicking outside
    if (this.closeOnClickOutside) {
      document.addEventListener('click', this.handleDocumentClick.bind(this));
    }

    // Keyboard handlers
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Initialize by finding all dropdown elements
   */
  init() {
    // Find all dropdown toggle elements with data-dropdown attribute
    const toggles = document.querySelectorAll('[data-dropdown]');

    // Set up each dropdown
    toggles.forEach(toggle => {
      const targetId = toggle.getAttribute('data-dropdown');
      const menu = document.getElementById(targetId);

      if (menu) {
        // Add the modern classes
        menu.classList.add('dropdown-modern__menu');
        toggle.classList.add('dropdown-modern__toggle');

        // Register the dropdown
        this.dropdowns.push({
          toggle,
          menu,
          id: targetId,
          isOpen: false
        });

        // Add click event to toggle
        toggle.addEventListener('click', (event) => {
          event.stopPropagation();
          this.toggleDropdown(targetId);
        });
      }
    });
  }

  /**
   * Toggle a dropdown by ID
   */
  toggleDropdown(id) {
    const dropdown = this.dropdowns.find(d => d.id === id);

    if (!dropdown) return;

    if (dropdown.isOpen) {
      this.closeDropdown(id);
    } else {
      this.openDropdown(id);
    }
  }

  /**
   * Open a dropdown by ID
   */
  openDropdown(id) {
    // Close any already open dropdown
    if (this.activeDropdown) {
      this.closeDropdown(this.activeDropdown.id);
    }

    const dropdown = this.dropdowns.find(d => d.id === id);
    if (!dropdown) return;

    // Show the dropdown
    dropdown.menu.classList.remove('hidden');
    dropdown.menu.classList.add('dropdown-modern__menu--show');
    dropdown.isOpen = true;
    this.activeDropdown = dropdown;

    // Set ARIA attributes
    dropdown.toggle.setAttribute('aria-expanded', 'true');
    dropdown.menu.setAttribute('aria-hidden', 'false');

    // Position check - ensure the dropdown is fully visible
    this.adjustPosition(dropdown);

    // Set focus to first focusable element in dropdown
    if (this.focusTrap) {
      setTimeout(() => {
        const focusable = dropdown.menu.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusable.length > 0) {
          focusable[0].focus();
        }
      }, 100);
    }

    // Trigger custom event
    const event = new CustomEvent('dropdown:opened', {
      detail: { id: dropdown.id }
    });
    document.dispatchEvent(event);
  }

  /**
   * Close a dropdown by ID
   */
  closeDropdown(id) {
    const dropdown = this.dropdowns.find(d => d.id === id);
    if (!dropdown || !dropdown.isOpen) return;

    // Hide the dropdown
    dropdown.menu.classList.add('hidden');
    dropdown.menu.classList.remove('dropdown-modern__menu--show');
    dropdown.isOpen = false;

    // Update ARIA attributes
    dropdown.toggle.setAttribute('aria-expanded', 'false');
    dropdown.menu.setAttribute('aria-hidden', 'true');

    // Return focus to toggle button
    dropdown.toggle.focus();

    if (this.activeDropdown && this.activeDropdown.id === id) {
      this.activeDropdown = null;
    }

    // Trigger custom event
    const event = new CustomEvent('dropdown:closed', {
      detail: { id: dropdown.id }
    });
    document.dispatchEvent(event);
  }

  /**
   * Close all open dropdowns
   */
  closeAll() {
    this.dropdowns.forEach(dropdown => {
      if (dropdown.isOpen) {
        this.closeDropdown(dropdown.id);
      }
    });
  }

  /**
   * Handle document clicks to close dropdowns when clicking outside
   */
  handleDocumentClick(event) {
    if (!this.activeDropdown) return;

    // Check if click is outside the active dropdown
    const isClickInside = event.target.closest(`#${this.activeDropdown.id}`) ||
                          event.target.closest(`[data-dropdown="${this.activeDropdown.id}"]`);

    if (!isClickInside) {
      this.closeDropdown(this.activeDropdown.id);
    }
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event) {
    if (!this.activeDropdown) return;

    // ESC key closes the dropdown
    if (event.key === 'Escape') {
      this.closeDropdown(this.activeDropdown.id);
      event.preventDefault();
    }

    // Arrow navigation within dropdown
    if (['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key) && this.activeDropdown) {
      const focusable = Array.from(this.activeDropdown.menu.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ));

      if (focusable.length === 0) return;

      // Find current focused element
      const currentIndex = focusable.findIndex(el => el === document.activeElement);

      if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
        // Move focus to next item, or first if at end
        const nextIndex = currentIndex + 1 < focusable.length ? currentIndex + 1 : 0;
        focusable[nextIndex].focus();
        event.preventDefault();
      } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
        // Move focus to previous item, or last if at beginning
        const prevIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : focusable.length - 1;
        focusable[prevIndex].focus();
        event.preventDefault();
      }
    }
  }

  /**
   * Adjust dropdown position to ensure it stays in viewport
   */
  adjustPosition(dropdown) {
    const menu = dropdown.menu;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Reset any previous position adjustments
    menu.style.transform = '';

    // Check horizontal overflow
    if (menuRect.right > viewportWidth) {
      const overflow = menuRect.right - viewportWidth + 8; // 8px buffer
      menu.style.transform = `translateX(-${overflow}px)`;
    }

    // Check vertical overflow
    if (menuRect.bottom > viewportHeight) {
      // Add a class that will position above the toggle instead of below
      menu.classList.add('dropdown-modern__menu--upward');
    } else {
      menu.classList.remove('dropdown-modern__menu--upward');
    }
  }

  /**
   * Create a dropdown programmatically
   */
  create(options) {
    const {
      toggleElement,
      menuElement,
      id = `dropdown-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      items = [],
      position = 'bottom-right'
    } = options;

    // If no toggle or menu elements are provided, create them
    const toggle = toggleElement || document.createElement('button');
    const menu = menuElement || document.createElement('div');

    // Set IDs and attributes
    menu.id = id;
    toggle.setAttribute('data-dropdown', id);

    // Add classes
    toggle.classList.add('dropdown-modern__toggle');
    menu.classList.add('dropdown-modern__menu');

    // Position class
    if (position === 'bottom-left') {
      menu.classList.add('dropdown-modern__menu--left');
    }

    // Set ARIA attributes
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('role', 'menu');

    // Create items if provided
    if (items.length > 0) {
      items.forEach(item => {
        if (item.type === 'divider') {
          const divider = document.createElement('div');
          divider.className = 'dropdown-modern__divider';
          menu.appendChild(divider);
        } else {
          const itemEl = document.createElement('div');
          itemEl.className = 'dropdown-modern__item';
          itemEl.setAttribute('role', 'menuitem');

          if (item.icon) {
            const iconEl = document.createElement('i');
            iconEl.className = item.icon;
            itemEl.appendChild(iconEl);
          }

          const textEl = document.createElement('span');
          textEl.textContent = item.text;
          itemEl.appendChild(textEl);

          if (item.action && typeof item.action === 'function') {
            itemEl.addEventListener('click', (e) => {
              item.action(e);
              this.closeDropdown(id);
            });
          }

          menu.appendChild(itemEl);
        }
      });
    }

    // Add click event to toggle
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleDropdown(id);
    });

    // Register the dropdown
    this.dropdowns.push({
      toggle,
      menu,
      id,
      isOpen: false
    });

    // Append to DOM if parent is provided
    if (options.parent) {
      const parent = typeof options.parent === 'string'
        ? document.querySelector(options.parent)
        : options.parent;

      if (parent) {
        if (!toggleElement) parent.appendChild(toggle);
        if (!menuElement) document.body.appendChild(menu);
      }
    }

    return { toggle, menu, id };
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.dropdownSystem = new DropdownModern();
});