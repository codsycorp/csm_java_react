/**
 * Performance Optimization Utilities
 * Helps improve LCP, FCP, CLS, and TBT metrics
 */

/**
 * Lazy load images with intersection observer
 * This helps reduce initial payload and improves LCP
 */
export function setupLazyLoadImages() {
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            const src = img.dataset.src;
            if (src) {
              img.src = src;
              img.classList.add("loaded");
              observer.unobserve(img);
            }
          }
        });
      },
      {
        rootMargin: "50px",
      }
    );

    document.querySelectorAll("img[data-src]").forEach((img) => {
      imageObserver.observe(img);
    });
  }
}

/**
 * Preload critical resources
 * Add this to <head> for LCP optimization
 */
export function preloadCriticalResources() {
  const head = document.head;
  
  // Load main fonts directly as stylesheet to avoid preload warning
  const fontLinks = [
    {
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      rel: "stylesheet",
    },
  ];

  fontLinks.forEach((link) => {
    const linkEl = document.createElement("link");
    Object.assign(linkEl, link);
    head.appendChild(linkEl);
  });
}

/**
 * Preload hero/LCP image when SSR meta provides it
 */
export function preloadHeroImage() {
  try {
    const head = document.head;
    const maybeMeta: any = (window as any).meta || (window as any).__INITIAL_DATA__;
    const hero = maybeMeta?.image || maybeMeta?.f_logo || maybeMeta?.og_image;
    if (!hero || typeof hero !== "string") return;

    // Avoid duplicate preload
    if (head.querySelector(`link[rel="preload"][href="${hero}"]`)) return;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = hero;
    // fetchpriority=high for LCP image
    link.setAttribute("fetchpriority", "high");
    head.appendChild(link);
  } catch (e) {
    // noop
  }
}

/**
 * Apply sensible defaults for images to reduce LCP/CLS:
 * - keep first image as priority (no forced lazy)
 * - lazy-load the rest if not explicitly marked
 * - use decoding=async
 * - backfill width/height after load to stabilize layout for subsequent renders
 */
export function optimizeImagesOnTheFly() {
  const apply = () => {
    const imgs = Array.from(document.getElementsByTagName("img"));
    imgs.forEach((img, idx) => {
      const priority = img.dataset.priority === "high" || img.dataset.lcp === "true";

      // Only lazy-load non-priority images beyond the first
      if (!priority && idx > 0 && !img.getAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }

      if (!img.getAttribute("decoding")) {
        img.setAttribute("decoding", "async");
      }

      // Backfill intrinsic size after load to prevent future CLS
      if (img.complete && !img.getAttribute("width") && img.naturalWidth > 0) {
        img.setAttribute("width", img.naturalWidth.toString());
      }
      if (img.complete && !img.getAttribute("height") && img.naturalHeight > 0) {
        img.setAttribute("height", img.naturalHeight.toString());
      }
    });
  };

  // Run once after hydration
  apply();

  // Observe future DOM mutations (e.g., route changes, async renders)
  const observer = new MutationObserver((mutations) => {
    let touched = false;
    mutations.forEach((m) => {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) touched = true;
          if (node instanceof HTMLElement && node.querySelector("img")) touched = true;
        });
      }
    });
    if (touched) apply();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Defer non-critical CSS
 * Helps improve FCP by deferring non-critical stylesheets
 */
export function deferNonCriticalCSS() {
  // Find all CSS links and defer non-critical ones
  const styleLinks = document.querySelectorAll('link[rel="stylesheet"]');
  styleLinks.forEach((link) => {
    const href = link.getAttribute("href");
    // Keep only critical CSS (adjust as needed)
    if (href && !href.includes("critical")) {
      const linkEl = link as HTMLLinkElement;
      linkEl.setAttribute("rel", "preload");
      linkEl.setAttribute("as", "style");
      linkEl.onload = () => {
        linkEl.rel = "stylesheet";
      };
    }
  });
}

/**
 * Monitor Web Vitals
 * Track LCP, FCP, CLS, and other metrics
 */
export function monitorWebVitals(enableLogging = false) {
  if ("PerformanceObserver" in window) {
    try {
      // Monitor LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const lastEntry = list.getEntries().at(-1) as any;
        if (lastEntry && enableLogging) {
          console.log("LCP:", lastEntry.renderTime || lastEntry.loadTime);
        }
      });
      lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });

      // Monitor FCP
      const fcpObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (enableLogging) {
            console.log("FCP:", entry.startTime);
          }
        });
      });
      fcpObserver.observe({ entryTypes: ["paint"] });

      // Monitor CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const layoutEntry = entry as any;
          if (!layoutEntry.hadRecentInput) {
            clsValue += layoutEntry.value;
            if (enableLogging) {
              console.log("CLS:", clsValue);
            }
          }
        });
      });
      clsObserver.observe({ entryTypes: ["layout-shift"] });

      // Monitor FID/INP
      try {
        const inpObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            const inpEntry = entry as any;
            if (enableLogging) {
              console.log("INP:", inpEntry.processingDuration);
            }
          });
        });
        // Try to observe both first-input and interaction (interaction might not be supported in all browsers)
        try {
          inpObserver.observe({ entryTypes: ["first-input", "interaction"] });
        } catch {
          // Fallback to just first-input if interaction is not supported
          inpObserver.observe({ entryTypes: ["first-input"] });
        }
      } catch (e) {
        if (enableLogging) {
          console.warn("FID/INP monitoring not available");
        }
      }
    } catch (e) {
      console.warn("Performance monitoring not available:", e);
    }
  }
}

/**
 * Batch DOM updates to reduce layout shifts
 * Helps improve CLS score
 */
export function batchDOMUpdates(callback: () => void) {
  if ("requestAnimationFrame" in window) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        callback();
      });
    });
  } else {
    callback();
  }
}

/**
 * Optimize font loading
 * Use font-display: swap to improve FCP
 */
export function optimizeFontLoading() {
  const fontLinks = document.querySelectorAll('link[rel="preload"][as="font"]');
  fontLinks.forEach((link) => {
    link.setAttribute("crossorigin", "anonymous");
  });
}

/**
 * Debounce function to reduce main thread work
 * Helps improve TBT (Total Blocking Time)
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Throttle function to control event firing
 * Reduces main thread work during rapid events
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastRun >= interval) {
      func(...args);
      lastRun = now;
    }
  };
}

/**
 * Use requestIdleCallback to schedule non-critical work
 * Helps keep main thread responsive
 */
export function scheduleIdleCallback(callback: () => void, timeout = 2000, enableLogging = false) {
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => {
      if (enableLogging) {
        console.log("Non-critical work scheduled");
      }
      callback();
    }, { timeout });
  } else {
    setTimeout(() => {
      if (enableLogging) {
        console.log("Non-critical work scheduled");
      }
      callback();
    }, timeout);
  }
}

/**
 * Initialize all performance optimizations
 */
export function initializePerformanceOptimizations(enableLogging = import.meta.env.DEV) {
  // Only run in browser environment
  if (typeof window === "undefined") return;

  // Setup lazy loading
  setupLazyLoadImages();

   // Preload critical resources (fonts, hero image)
  preloadCriticalResources();
  preloadHeroImage();

  // Normalize image loading strategies to cut LCP/CLS
  optimizeImagesOnTheFly();

  // Monitor Web Vitals
  monitorWebVitals(enableLogging);

  // Optimize fonts
  optimizeFontLoading();

  // Schedule non-critical work
  scheduleIdleCallback(() => {
    // Non-critical work can be done here
  }, 2000, enableLogging);
}
