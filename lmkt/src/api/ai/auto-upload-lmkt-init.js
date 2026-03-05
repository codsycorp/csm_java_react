/**
 * AUTO_CODE - Lazy Load Entry Point
 * 
 * ========== PURPOSE ==========
 * - File nhỏ gọn < 10KB load ngay lập tức
 * - Defer loading main script (15,989 lines) đến khi user interact
 * - Giải quyết OOM crash: RAM spike from 90% → 30% on init
 * - Main script auto-loads khi user click/keyboard/scroll
 */

'use strict';

console.log('🚀 [LAZ] Lazy loader started');

// ===== GLOBAL STATE (MINIMAL) =====
let mainScriptLoaded = false;
let mainScriptLoading = false;
const interactionEvents = new Set();

// ===== LOAD MAIN SCRIPT =====
function loadMainScript() {
  if (mainScriptLoaded) return;
  if (mainScriptLoading) return;
  
  console.log('📥 [LAZ] Loading main auto-upload-lmkt.js...');
  mainScriptLoading = true;
  
  try {
    const script = document.createElement('script');
    // Point to actual main file in same directory
    script.src = './auto-upload-lmkt.js?' + Math.random();
    script.type = 'text/javascript';
    script.async = false;
    
    script.onload = () => {
      console.log('✅ [LAZ] Main script loaded successfully');
      mainScriptLoaded = true;
      // Remove interaction listeners since main script now active
      removeInteractionListeners();
    };
    
    script.onerror = (err) => {
      console.error('❌ [LAZ] Failed loading auto-upload-lmkt.js:', err);
      mainScriptLoading = false;
    };
    
    document.head.appendChild(script);
  } catch (e) {
    console.error('❌ [LAZ] Error:', e);
    mainScriptLoading = false;
  }
}

// ===== INTERACTION DETECTION =====
function setupInteractionListeners() {
  const triggerLoad = (event) => {
    console.log('👆 [LAZ] User interaction detected:', event.type);
    loadMainScript();
    removeInteractionListeners();
  };
  
  // Common interaction events
  const events = ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'];
  
  for (const eventType of events) {
    document.addEventListener(eventType, triggerLoad, { once: true, capture: true });
    interactionEvents.add({ type: eventType, handler: triggerLoad });
  }
  
  console.log('👁️  [LAZ] Listening for user interaction...');
}

function removeInteractionListeners() {
  for (const event of interactionEvents) {
    document.removeEventListener(event.type, event.handler, true);
  }
  interactionEvents.clear();
}

// ===== SHOW LOADING UI =====
function showLoadingUI() {
  if (document.getElementById('laz-loading')) return;
  
  const loading = document.createElement('div');
  loading.id = 'laz-loading';
  loading.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 30px 40px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    text-align: center;
    min-width: 300px;
  `;
  
  loading.innerHTML = `
    <div style="margin-bottom: 15px;">
      <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
      <h3 style="margin: 0; font-size: 16px; color: #1890ff;">
        Loading Auto Upload
      </h3>
    </div>
    <div style="width: 100%; height: 3px; background: #f0f0f0; border-radius: 1px; overflow: hidden;">
      <div style="
        width: 50%;
        height: 100%;
        background: linear-gradient(90deg, #1890ff, #69c0ff);
        border-radius: 1px;
        animation: loading-bar 1.5s ease-in-out infinite;
      "></div>
    </div>
    <p style="margin: 10px 0 0 0; font-size: 13px; color: #999;">
      Initializing modules...
    </p>
    <style>
      @keyframes loading-bar {
        0% { width: 30%; }
        50% { width: 70%; }
        100% { width: 30%; }
      }
    </style>
  `;
  
  document.body.appendChild(loading);
}

// ===== INIT =====
function init() {
  console.log('🔧 [LAZ] Init: readyState=' + document.readyState);
  
  // Show loading UI with hint
  showLoadingUI();
  
  // Setup interaction listeners to trigger main script load
  setupInteractionListeners();
  
  // Also trigger after 3 seconds as fallback (failsafe)
  setTimeout(() => {
    if (!mainScriptLoaded) {
      console.log('⏱️  [LAZ] Fallback: auto-loading after 3 sec');
      loadMainScript();
    }
  }, 3000);
}

// ===== AUTO START =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('✅ [LAZ] Lazy loader ready');
