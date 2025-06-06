import React from 'react';

/**
 * A component that adds consistent bottom spacing to ensure content clears the navigation bar
 * @param {Object} props - Component props
 * @param {string} props.className - Additional classes to apply
 * @param {Object} props.style - Additional inline styles to apply
 * @returns {JSX.Element} A div with appropriate bottom spacing
 */
const BottomNavSpacer: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className = '', style = {} }) => {
  return (
    <div 
      className={`last-element-spacing ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
};

export default BottomNavSpacer;
