import { useEffect, RefObject } from 'react';

/**
 * Custom hook to enable Enter key to move to next input field (like Tab)
 * Usage: useEnterToTab(containerRef)
 * 
 * @param containerRef - Ref to the container element (optional, defaults to document)
 */
export const useEnterToTab = (containerRef?: RefObject<HTMLElement>) => {
  useEffect(() => {
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

      // Skip for readonly inputs
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
      const container = containerRef?.current || document;
      const focusableSelector = 'input:not([type="image"]):not([type="submit"]):not([type="hidden"]):not([readonly]):not([disabled]), select:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
      const focusables = Array.from(container.querySelectorAll(focusableSelector)) as HTMLElement[];

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

    const container = containerRef?.current || document;
    container.addEventListener('keydown', handleKeyDown as EventListener);

    return () => {
      container.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [containerRef]);
};

export default useEnterToTab;
