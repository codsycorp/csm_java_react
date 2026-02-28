import React, { useState, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
  className?: string;
  srcSet?: string;
  sizes?: string;
  onLoad?: () => void;
}

/**
 * Optimized Image Component with:
 * - Lazy loading support
 * - Explicit width/height to prevent layout shift
 * - Responsive image support via srcSet
 * - Loading state management
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  loading = 'lazy',
  className = '',
  srcSet,
  sizes,
  onLoad,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const aspectRatio = (height / width) * 100;

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: `${aspectRatio}%`,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
      }}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        srcSet={srcSet}
        sizes={sizes}
        onLoad={handleLoad}
        className={`${className} ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  );
};

export default OptimizedImage;
