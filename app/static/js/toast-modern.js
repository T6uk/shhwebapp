/**
 * Modern toast notification system
 * Better performance and animations with improved UX
 */
class ToastModern {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('notification-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.className = 'fixed bottom-4 left-4 z-50 flex flex-col items-start';
      document.body.appendChild(this.container);
    }

    // Queue management for sequential display
    this.queue = [];
    this.isProcessing = false;

    // Default settings
    this.defaultDuration = options.duration || 5000;
    this.maxToasts = options.maxToasts || 3;
    this.activeToasts = 0;
  }

  /**
   * Show a toast notification
   * @param {string} title - The title of the toast
   * @param {string} message - The message content
   * @param {string} type - Type of toast: success, error, info, warning
   * @param {Object} options - Additional options
   */
  show(title, message, type = 'info', options = {}) {
    const toastOptions = {
      id: `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title,
      message,
      type,
      duration: options.duration || this.defaultDuration,
      closable: options.hasOwnProperty('closable') ? options.closable : true,
      onClose: options.onClose || null
    };

    // Add to queue
    this.queue.push(toastOptions);
    this.processQueue();

    return toastOptions.id;
  }

  /**
   * Process the toast queue
   */
  processQueue() {
    if (this.isProcessing || this.queue.length === 0 || this.activeToasts >= this.maxToasts) {
      return;
    }

    this.isProcessing = true;
    const toastOptions = this.queue.shift();
    this.createToast(toastOptions);
    this.isProcessing = false;

    // Continue processing if more toasts in queue
    if (this.queue.length > 0 && this.activeToasts < this.maxToasts) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Create and append a toast to the container
   */
  createToast(options) {
    const { id, title, message, type, duration, closable, onClose } = options;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast-modern toast-modern--${type}`;
    toast.setAttribute('role', 'alert');

    // Icon based on type
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';

    toast.innerHTML = `
      <div class="toast-modern__icon">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="toast-modern__content">
        <div class="toast-modern__title">${title}</div>
        <div class="toast-modern__message">${message}</div>
      </div>
      ${closable ? '<div class="toast-modern__close"><i class="fas fa-times"></i></div>' : ''}
    `;

    // Append to container
    this.container.appendChild(toast);
    this.activeToasts++;

    // Handle close button click
    if (closable) {
      const closeBtn = toast.querySelector('.toast-modern__close');
      closeBtn.addEventListener('click', () => this.closeToast(id, onClose));
    }

    // Auto-close after duration
    if (duration !== 0) {
      setTimeout(() => {
        if (document.getElementById(id)) {
          this.closeToast(id, onClose);
        }
      }, duration);
    }

    // Check queue after this toast is shown
    setTimeout(() => {
      if (this.queue.length > 0 && this.activeToasts < this.maxToasts) {
        this.processQueue();
      }
    }, 300);

    return id;
  }

  /**
   * Close a toast by ID
   */
  closeToast(id, callback = null) {
    const toast = document.getElementById(id);
    if (!toast) return;

    toast.classList.add('toast-exit');

    toast.addEventListener('animationend', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
        this.activeToasts--;

        // Process next toast in queue
        if (this.queue.length > 0 && this.activeToasts < this.maxToasts) {
          this.processQueue();
        }

        // Call callback if provided
        if (typeof callback === 'function') {
          callback();
        }
      }
    });
  }

  /**
   * Close all toasts
   */
  closeAll() {
    const toasts = this.container.querySelectorAll('.toast-modern');
    toasts.forEach(toast => {
      this.closeToast(toast.id);
    });

    // Clear the queue
    this.queue = [];
  }

  // Convenience methods for different toast types
  success(title, message, options = {}) {
    return this.show(title, message, 'success', options);
  }

  error(title, message, options = {}) {
    return this.show(title, message, 'error', options);
  }

  info(title, message, options = {}) {
    return this.show(title, message, 'info', options);
  }

  warning(title, message, options = {}) {
    return this.show(title, message, 'warning', options);
  }
}

// Create global instance
const toast = new ToastModern();

// Replace original showToast function for backwards compatibility
window.showToast = function(title, message, type = 'info') {
  return toast.show(title, message, type);
};