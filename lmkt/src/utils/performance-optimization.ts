// Lightweight performance helpers for LCP/FCP/CLS

export function setupLazyLoadImages() {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.classList.add("loaded");
          obs.unobserve(img);
        }
      }
    });
  }, { rootMargin: "50px" });

  document.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => {
    observer.observe(img);
  });
}

export function preloadCriticalResources() {
  const head = document.head;
  const fonts = [
    {
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      rel: "stylesheet",
    },
  ];
  fonts.forEach((cfg) => {
    if (head.querySelector(`link[href='${cfg.href}']`)) return;
    const link = document.createElement("link");
    Object.assign(link, cfg);
    head.appendChild(link);
  });
}

export function preloadHeroImage() {
  try {
    const head = document.head;
    const meta: any = (window as any).meta || (window as any).__INITIAL_DATA__;
    const hero = meta?.image || meta?.f_logo || meta?.og_image;
    if (!hero || typeof hero !== "string") return;
    if (head.querySelector(`link[rel='preload'][href='${hero}']`)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = hero;
    link.setAttribute("fetchpriority", "high");
    head.appendChild(link);
  } catch (_) {
    /* noop */
  }
}

export function optimizeImagesOnTheFly() {
  const apply = () => {
    const imgs = Array.from(document.getElementsByTagName("img"));
    imgs.forEach((img, idx) => {
      const priority = img.dataset.priority === "high" || img.dataset.lcp === "true";
      if (!priority && idx > 0 && !img.getAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }
      if (!img.getAttribute("decoding")) {
        img.setAttribute("decoding", "async");
      }
      if (img.complete && !img.getAttribute("width") && img.naturalWidth > 0) {
        img.setAttribute("width", img.naturalWidth.toString());
      }
      if (img.complete && !img.getAttribute("height") && img.naturalHeight > 0) {
        img.setAttribute("height", img.naturalHeight.toString());
      }
    });
  };

  apply();

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

export function initializePerformanceOptimizations() {
  if (typeof window === "undefined") return;
  setupLazyLoadImages();
  preloadCriticalResources();
  preloadHeroImage();
  optimizeImagesOnTheFly();
}
