import React, { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  extraBottomSpacing?: boolean;
}

/**
 * A wrapper component that provides consistent bottom spacing for all pages
 * Handles proper spacing to ensure content is visible above the navigation bar
 */
const PageWrapper: React.FC<PageWrapperProps> = ({ 
  children, 
  className = '', 
  style = {},
  extraBottomSpacing = false
}) => {
  return (
    <div 
      className={`page-wrapper ${className}`}
      style={{
        paddingBottom: extraBottomSpacing 
          ? 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 2rem)'
          : 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 1rem)',
        ...style
      }}
    >
      {children}
      
      {/* Spacer to ensure content clears the navigation */}
      <div 
        className={extraBottomSpacing ? "h-8 last-element-spacing" : "h-4 last-element-spacing"} 
        aria-hidden="true"
      />
    </div>
  );
};

export default PageWrapper;
