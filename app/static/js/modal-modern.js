/**
 * Modern modal system with improved UX and accessibility
 */
class ModalModern {
  constructor(options = {}) {
    this.activeModals = [];
    this.modalZIndex = options.baseZIndex || 1000;
    this.bodyScrollLock = options.bodyScrollLock !== false;

    // Track focus before modal opens
    this.previouslyFocusedElement = null;

    // Find existing modals when initialized
    this.init();

    // Keyboard handlers
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Initialize by finding all modal elements
   */
  init() {
    // Find all modal trigger elements with data-modal attribute
    const triggers = document.querySelectorAll('[data-modal-target]');

    // Set up each modal
    triggers.forEach(trigger => {
      const modalId = trigger.getAttribute('data-modal-target');
      const modal = document.getElementById(modalId);

      if (modal) {
        // Set up close buttons
        const closeButtons = modal.querySelectorAll('[data-modal-close]');
        closeButtons.forEach(button => {
          button.addEventListener('click', () => {
            this.close(modalId);
          });
        });

        // Add click event to trigger
        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          this.open(modalId);
        });

        // Add modern class if it doesn't have it
        if (!modal.classList.contains('modal-modern')) {
          this.convertToModernModal(modal);
        }
      }
    });

    // Set up backdrop click handlers for existing modals
    document.querySelectorAll('.modal-modern__backdrop').forEach(backdrop => {
      const modal = backdrop.closest('.modal-modern');
      if (modal && !backdrop.hasClickListener) {
        backdrop.addEventListener('click', () => {
          this.close(modal.id);
        });
        backdrop.hasClickListener = true;
      }
    });
  }

  /**
   * Convert a regular modal to use the modern structure
   */
  convertToModernModal(modalEl) {
    if (!modalEl) return;

    // Only convert if it's not already a modern modal
    if (modalEl.classList.contains('modal-modern')) return;

    // Save original content
    const originalContent = modalEl.innerHTML;

    // Clear the modal
    modalEl.innerHTML = '';

    // Add modern classes
    modalEl.classList.add('modal-modern', 'hidden');
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-modern__backdrop';
    backdrop.setAttribute('data-modal-close', '');
    backdrop.hasClickListener = true;
    backdrop.addEventListener('click', () => {
      this.close(modalEl.id);
    });

    // Create content container
    const content = document.createElement('div');
    content.className = 'modal-modern__content';
    content.innerHTML = originalContent;

    // Prevent clicks on content from closing modal
    content.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Append elements
    modalEl.appendChild(backdrop);
    modalEl.appendChild(content);

    return modalEl;
  }

  /**
   * Open a modal by ID
   */
  open(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    // Store the currently focused element to restore later
    this.previouslyFocusedElement = document.activeElement;

    // Convert to modern modal if needed
    if (!modal.classList.contains('modal-modern')) {
      this.convertToModernModal(modal);
    }

    // Calculate and set z-index for proper stacking
    const zIndex = this.modalZIndex + this.activeModals.length * 10;
    modal.style.zIndex = zIndex;

    // Show the modal
    modal.classList.remove('hidden');

    // Lock body scroll if enabled
    if (this.bodyScrollLock) {
      document.body.style.overflow = 'hidden';
    }

    // Track active modal
    this.activeModals.push({
      id,
      element: modal
    });

    // Set focus to first focusable element in modal
    setTimeout(() => {
      const focusable = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 100);

    // Trigger opened event
    const event = new CustomEvent('modal:opened', {
      detail: { id }
    });
    document.dispatchEvent(event);

    return modal;
  }

  /**
   * Close a modal by ID
   */
  close(id) {
    const modalIndex = this.activeModals.findIndex(m => m.id === id);
    if (modalIndex === -1) return;

    const modal = this.activeModals[modalIndex].element;

    // Hide the modal
    modal.classList.add('hidden');

    // Remove from active modals
    this.activeModals.splice(modalIndex, 1);

    // Restore body scroll if no more active modals
    if (this.bodyScrollLock && this.activeModals.length === 0) {
      document.body.style.overflow = '';
    }

    // Restore focus
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }

    // Trigger closed event
    const event = new CustomEvent('modal:closed', {
      detail: { id }
    });
    document.dispatchEvent(event);
  }

  /**
   * Close all open modals
   */
  closeAll() {
    [...this.activeModals].forEach(modal => {
      this.close(modal.id);
    });
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event) {
    if (this.activeModals.length === 0) return;

    // Close top-most modal on ESC
    if (event.key === 'Escape') {
      const topModal = this.activeModals[this.activeModals.length - 1];
      this.close(topModal.id);
      event.preventDefault();
    }

    // Handle Tab key for focus trapping in the top-most modal
    if (event.key === 'Tab' && this.activeModals.length > 0) {
      const topModal = this.activeModals[this.activeModals.length - 1].element;
      const focusable = Array.from(topModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ));

      if (focusable.length === 0) return;

      // Get first and last focusable elements
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];

      // If shift+tab on first element, wrap to last
      if (event.shiftKey && document.activeElement === firstFocusable) {
        lastFocusable.focus();
        event.preventDefault();
      }
      // If tab on last element, wrap to first
      else if (!event.shiftKey && document.activeElement === lastFocusable) {
        firstFocusable.focus();
        event.preventDefault();
      }
    }
  }

  /**
   * Create a modal programmatically
   */
  create(options) {
    const {
      id = `modal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      content,
      footer,
      size = 'md',
      closeButton = true,
      backdropClose = true,
      onOpen,
      onClose
    } = options;

    // Create modal element
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-modern hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${id}-title`);

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-modern__backdrop';

    if (backdropClose) {
      backdrop.setAttribute('data-modal-close', '');
      backdrop.hasClickListener = true;
      backdrop.addEventListener('click', () => {
        this.close(id);
      });
    }

    // Create content container with appropriate size
    const contentEl = document.createElement('div');
    contentEl.className = 'modal-modern__content';

    // Apply size class
    if (size === 'sm') contentEl.style.maxWidth = '24rem';
    if (size === 'md') contentEl.style.maxWidth = '32rem';
    if (size === 'lg') contentEl.style.maxWidth = '48rem';
    if (size === 'xl') contentEl.style.maxWidth = '64rem';
    if (size === 'full') contentEl.style.maxWidth = '100%';

    // Create header
    let headerEl;
    if (title || closeButton) {
      headerEl = document.createElement('div');
      headerEl.className = 'modal-modern__header';

      if (title) {
        const titleEl = document.createElement('h2');
        titleEl.id = `${id}-title`;
        titleEl.className = 'modal-modern__title';
        titleEl.textContent = title;
        headerEl.appendChild(titleEl);
      }

      if (closeButton) {
        const closeEl = document.createElement('button');
        closeEl.className = 'modal-modern__close';
        closeEl.setAttribute('aria-label', 'Close');
        closeEl.setAttribute('data-modal-close', '');
        closeEl.innerHTML = '<i class="fas fa-times"></i>';
        closeEl.addEventListener('click', () => {
          this.close(id);
        });
        headerEl.appendChild(closeEl);
      }

      contentEl.appendChild(headerEl);
    }

    // Create body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-modern__body';

    // Add content
    if (typeof content === 'string') {
      bodyEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      bodyEl.appendChild(content);
    }

    contentEl.appendChild(bodyEl);

    // Create footer
    if (footer) {
      const footerEl = document.createElement('div');
      footerEl.className = 'modal-modern__footer';

      if (typeof footer === 'string') {
        footerEl.innerHTML = footer;
      } else if (footer instanceof HTMLElement) {
        footerEl.appendChild(footer);
      }

      contentEl.appendChild(footerEl);
    }

    // Prevent clicks on content from closing modal
    contentEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Append elements
    modal.appendChild(backdrop);
    modal.appendChild(contentEl);

    // Add to document
    document.body.appendChild(modal);

    // Add event listeners
    if (onOpen) {
      document.addEventListener('modal:opened', function handler(e) {
        if (e.detail.id === id) {
          onOpen(modal);
          document.removeEventListener('modal:opened', handler);
        }
      });
    }

    if (onClose) {
      document.addEventListener('modal:closed', function handler(e) {
        if (e.detail.id === id) {
          onClose(modal);
          document.removeEventListener('modal:closed', handler);
        }
      });
    }

    return {
      id,
      element: modal,
      open: () => this.open(id),
      close: () => this.close(id)
    };
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.modalSystem = new ModalModern();
});