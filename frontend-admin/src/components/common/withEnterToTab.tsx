import React, { ComponentType, useRef } from 'react';
import { useEnterToTab } from '#src/hooks/useEnterToTab';

/**
 * Higher Order Component to add Enter-to-Tab functionality to any component
 * Wraps the component in a div with Enter-to-Tab event handling
 * 
 * Usage:
 * export default withEnterToTab(MyFormComponent);
 * 
 * Or for inline usage:
 * const EnhancedForm = withEnterToTab(MyForm);
 */
export function withEnterToTab<P extends object>(
  WrappedComponent: ComponentType<P>
): ComponentType<P> {
  const WithEnterToTab = (props: P) => {
    const containerRef = useRef<HTMLDivElement>(null);
    useEnterToTab(containerRef);

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <WrappedComponent {...props} />
      </div>
    );
  };

  WithEnterToTab.displayName = `withEnterToTab(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithEnterToTab;
}

export default withEnterToTab;
