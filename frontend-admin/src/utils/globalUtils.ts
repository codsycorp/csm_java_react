/**
 * Global Utilities
 * Functions that can be called globally, compatible with legacy Vue code
 */

/**
 * Enable Enter key to move to next input (like Tab key)
 * Similar to Vue's EnterToTab function
 * This is a one-time setup function that adds event listeners to the document
 */
export const EnterToTab = (): void => {
  // Remove existing listener if any
  if ((window as any).__enterToTabListener) {
    document.removeEventListener('keydown', (window as any).__enterToTabListener);
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Only handle Enter key
    if (e.key !== 'Enter') return;

    const target = e.target as HTMLElement;

    // Skip if target is not an input/select/textarea
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

    const input = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    // Skip for certain input types
    if (input instanceof HTMLInputElement) {
      const type = input.type?.toLowerCase();
      if (['image', 'submit', 'button', 'hidden'].includes(type)) return;
    }

    // Skip for readonly/disabled inputs
    if (input.hasAttribute('readonly') || input.hasAttribute('disabled')) return;

    // Skip for textareas (allow Enter for new lines)
    if (target.tagName === 'TEXTAREA') return;

    // Special handling for password fields with login button
    if (input instanceof HTMLInputElement && input.name === 'password') {
      const loginBtn = document.querySelector('#btnLogin, #login') as HTMLButtonElement;
      if (loginBtn && document.activeElement === input) {
        e.preventDefault();
        loginBtn.click();
        return;
      }
    }

    // Get all focusable elements
    const focusableSelector = 'input:not([type="image"]):not([type="submit"]):not([type="hidden"]):not([readonly]):not([disabled]), select:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
    const focusables = Array.from(document.querySelectorAll(focusableSelector)) as HTMLElement[];

    if (focusables.length === 0) return;

    // Find current index
    const currentIndex = focusables.indexOf(target);
    if (currentIndex === -1) return;

    // Prevent default Enter behavior
    e.preventDefault();

    // Move to next element (or loop back to first)
    const nextIndex = (currentIndex + 1) % focusables.length;
    const nextElement = focusables[nextIndex];

    if (nextElement) {
      nextElement.focus();

      // Select text for input fields
      if (nextElement instanceof HTMLInputElement || nextElement instanceof HTMLTextAreaElement) {
        nextElement.select();
      }
    }
  };

  // Store listener reference for cleanup
  (window as any).__enterToTabListener = handleKeyDown;

  // Add event listener
  document.addEventListener('keydown', handleKeyDown);

  // Try to load file manager if lfm elements exist
  try {
    const lfmElements = document.querySelectorAll('.lfm');
    if (lfmElements.length > 0 && (window as any).$ && (window as any).$.fn?.filemanager) {
      (window as any).$('.lfm').filemanager();
    }
  } catch (ex) {
    console.warn('File manager initialization failed:', ex);
  }

  // Trigger window resize event (for layout adjustments)
  try {
    window.dispatchEvent(new Event('resize'));
  } catch (ex) {
    console.warn('Resize event dispatch failed:', ex);
  }
};

/**
 * Validate email address
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number
 */
export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^(\+91-|\+91|0)?\d{10}$/;
  return phoneRegex.test(phone);
};

/**
 * Show success notification
 * @param msg Message to display
 */
export const thongbao = (msg: string): void => {
  // Try to use DevExpress notification if available
  if ((window as any).DevExpress?.ui?.notify) {
    (window as any).DevExpress.ui.notify(`Thông Báo "${msg}"`, 'success', 3000);
  } else {
    // Fallback to alert or console
    console.log(`✅ Thông Báo: ${msg}`);
  }
};

/**
 * Show warning notification
 * @param msg Message to display
 */
export const canhbao = (msg: string): void => {
  // Try to use DevExpress notification if available
  if ((window as any).DevExpress?.ui?.notify) {
    (window as any).DevExpress.ui.notify(`Thông báo lỗi: "${msg}"`, 'warning', 3000);
  } else {
    // Fallback to alert or console
    console.warn(`⚠️ Cảnh báo: ${msg}`);
  }
};

/**
 * Delete all cookies and clear localStorage
 */
export const deleteAllCookies = (): void => {
  const cookies = document.cookie.split("; ");
  for (let c = 0; c < cookies.length; c++) {
    const d = window.location.hostname.split(".");
    while (d.length > 0) {
      const cookieBase = encodeURIComponent(cookies[c].split(";")[0].split("=")[0]) + '=; expires=Thu, 01-Jan-1970 00:00:01 GMT; domain=' + d.join('.') + ' ;path=';
      const p = location.pathname.split('/');
      document.cookie = cookieBase + '/';
      while (p.length > 0) {
        document.cookie = cookieBase + p.join('/');
        p.pop();
      }
      d.shift();
    }
  }
  localStorage.clear();
  setTimeout(() => {
    location.reload();
  }, 50);
};

// Export all global utilities
export const GlobalUtils = {
  EnterToTab,
  validateEmail,
  validatePhone,
  thongbao,
  canhbao,
  deleteAllCookies,
};

export default GlobalUtils;
