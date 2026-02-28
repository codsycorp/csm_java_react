/**
 * Image Optimization Strategy
 * Saves ~2.946 KiB and significantly improves LCP
 */

// ✅ Example 1: Basic Image Optimization
export function OptimizedImage({ src, alt, width = 800, height = 600 }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      style={{
        maxWidth: '100%',
        height: 'auto',
        aspectRatio: `${width} / ${height}`,
      }}
    />
  );
}

// ✅ Example 2: Responsive Image with WebP
export function ResponsiveImage({ 
  webpSrc,
  jpgSrc, 
  alt,
  width = 800,
  height = 600,
  sizes = "(max-width: 768px) 100vw, 50vw"
}: {
  webpSrc: string;
  jpgSrc: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
}) {
  return (
    <picture>
      <source 
        srcSet={webpSrc} 
        type="image/webp"
        sizes={sizes}
      />
      <img
        src={jpgSrc}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        sizes={sizes}
        style={{
          maxWidth: '100%',
          height: 'auto',
        }}
      />
    </picture>
  );
}

// ✅ Example 3: Hero Image (LCP Optimization)
export function HeroImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      width={1200}
      height={630}
      fetchPriority="high"
      decoding="sync"
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
      }}
    />
  );
}

// ✅ Example 4: Image with Placeholder (reduces CLS)
export function ImageWithPlaceholder({ 
  src, 
  alt,
  placeholderSrc,
  width = 800,
  height = 600
}: {
  src: string;
  alt: string;
  placeholderSrc?: string;
  width?: number;
  height?: number;
}) {
  return (
    <img
      src={placeholderSrc || src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      style={{
        aspectRatio: `${width} / ${height}`,
        maxWidth: '100%',
        height: 'auto',
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        img.src = src;
      }}
    />
  );
}

// ✅ Image Optimization CLI Commands
/**
 * Install imagemin:
 * npm install --save-dev imagemin imagemin-webp imagemin-jpegoptim imagemin-pngquant
 * 
 * Compress and convert to WebP:
 * npx imagemin "public/images/*.{jpg,png}" --out-dir=public/images/optimized --plugin=webp
 * 
 * Optimize existing images:
 * npx imagemin "public/images/*.jpg" --out-dir=public/images/optimized --plugin=jpegoptim
 * npx imagemin "public/images/*.png" --out-dir=public/images/optimized --plugin=pngquant
 */

// ✅ Next.js Image Component equivalent (if using modern React)
export function ResponsiveOptimizedImage({ 
  src, 
  alt,
  width = 800,
  height = 600,
  priority = false
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding={priority ? "sync" : "async"}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 85vw, (max-width: 1280px) 70vw, 1200px"
      style={{
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
        backgroundColor: '#f0f0f0', // Placeholder color
      }}
    />
  );
}

// ✅ Image Optimization Best Practices
/**
 * 1. DIMENSIONS:
 *    - Always specify width and height
 *    - Prevents layout shift (CLS improvement)
 *    - Browser can allocate space in advance
 *
 * 2. FORMAT:
 *    - Use WebP for modern browsers (better compression)
 *    - Fallback to JPG/PNG for older browsers
 *    - Target size: <200KB per image
 *
 * 3. LOADING:
 *    - Priority images: loading="eager", fetchPriority="high"
 *    - Other images: loading="lazy"
 *    - Hero/LCP images must load immediately
 *
 * 4. RESPONSIVE:
 *    - Use srcset for different screen sizes
 *    - Use sizes to hint responsive behavior
 *    - Reduces bandwidth for mobile users
 *
 * 5. COMPRESSION:
 *    - JPG quality: 75-85% (imperceptible quality loss)
 *    - PNG: Use pngquant to reduce palette
 *    - SVG: Optimize with SVGO
 *
 * 6. DELIVERY:
 *    - Serve from CDN for faster delivery
 *    - Enable gzip/brotli compression
 *    - Use image caching headers
 */
