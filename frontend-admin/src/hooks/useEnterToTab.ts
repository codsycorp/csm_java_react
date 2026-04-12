import { useEffect, RefObject } from 'react';

/**
 * Custom hook to enable Enter/Tab keyboard navigation between controls.
 * - Enter: next control
 * - Shift+Enter: previous control
 * - Tab/Shift+Tab: custom navigation order inside container
 * Usage: useEnterToTab(containerRef)
 * 
 * @param containerRef - Ref to the container element (optional, defaults to document)
 */
export const useEnterToTab = (containerRef?: RefObject<HTMLElement>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEnter = e.key === 'Enter';
      const isTab = e.key === 'Tab';
      if (!isEnter && !isTab) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;

      const target = e.target as HTMLElement;
      
      // Handle native controls and custom focusable controls.
      const isNativeInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
      const tabIndexAttr = target.getAttribute('tabindex');
      const tabIndex = tabIndexAttr == null ? NaN : Number(tabIndexAttr);
      const isCustomFocusable = Number.isFinite(tabIndex) && tabIndex >= 0;
      if (!isNativeInput && !isCustomFocusable) return;

      const input = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

      // Skip for certain input types.
      if (isNativeInput && input instanceof HTMLInputElement) {
        const type = input.type?.toLowerCase();
        if (['image', 'submit', 'button', 'hidden'].includes(type)) return;
      }

      // Skip for readonly inputs
      if (target.hasAttribute('readonly') || target.hasAttribute('disabled')) return;

      // Keep textarea Enter for new lines. Shift+Tab still navigates backward.
      if (isEnter && target.tagName === 'TEXTAREA') return;

      // Special handling for password fields with login button
      if (isEnter && input instanceof HTMLInputElement && input.name === 'password') {
        const loginBtn = document.querySelector('#btnLogin, #login') as HTMLButtonElement;
        if (loginBtn && document.activeElement === input) {
          e.preventDefault();
          loginBtn.click();
          return;
        }
      }

      // Get all focusable elements
      const container = containerRef?.current || document;
      const focusableSelector = [
        'input:not([type="image"]):not([type="submit"]):not([type="hidden"]):not([readonly]):not([disabled])',
        'select:not([readonly]):not([disabled])',
        'textarea:not([readonly]):not([disabled])',
        'button:not([disabled])',
        '[tabindex]:not([tabindex="-1"]):not([disabled])',
      ].join(',');
      const focusables = Array.from(container.querySelectorAll(focusableSelector)) as HTMLElement[];

      if (focusables.length === 0) return;

      // Find current index
      const currentIndex = focusables.indexOf(target);
      if (currentIndex === -1) return;

      // Prevent default behavior and drive navigation ourselves.
      e.preventDefault();

      const direction = e.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + direction + focusables.length) % focusables.length;
      const nextElement = focusables[nextIndex];
      
      if (nextElement) {
        nextElement.focus();
        
        // Select text for input fields
        if (nextElement instanceof HTMLInputElement || nextElement instanceof HTMLTextAreaElement) {
          nextElement.select();
        }
      }
    };

    const container = containerRef?.current || document;
    container.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      container.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [containerRef]);
};

export default useEnterToTab;
