import React, { useState, useCallback } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  fallbackSrc,
  onError,
  loading = 'lazy',
  decoding = 'async'
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false);
    setHasError(true);
    
    // Try fallback if provided and we haven't already used it
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setHasError(false);
      setIsLoading(true);
      return;
    }
    
    // Call custom error handler if provided
    if (onError) {
      onError(e);
    }
  }, [fallbackSrc, currentSrc, onError]);

  if (hasError && (!fallbackSrc || currentSrc === fallbackSrc)) {
    return null; // Hide the image if it fails to load
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-700/30 animate-pulse rounded flex items-center justify-center">
          <div className="w-4 h-4 bg-gray-600/50 rounded"></div>
        </div>
      )}
      <img
        src={currentSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onLoad={handleLoad}
        onError={handleError}
        loading={loading}
        decoding={decoding}
      />
    </div>
  );
};

export default React.memo(OptimizedImage);