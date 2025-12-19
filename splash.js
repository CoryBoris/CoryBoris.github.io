(function() {
  const splashOverlay = document.getElementById('splash-overlay');
  const splashLogo = document.getElementById('splash-logo');
  const splashSignature = document.getElementById('splash-signature');
  const logoContainer = document.getElementById('splash-logo-container');

  if (!splashOverlay || !splashLogo || !splashSignature || !logoContainer) {
    console.warn("Splash: Elements not found. Aborting splash.");
    return;
  }

  // Track state
  let logoLoaded = false;
  let signatureLoaded = false;
  let signatureAnimationComplete = false;
  let shimmerCycleComplete = false;
  let appReady = false;

  /**
   * Hide the splash screen and show the main site
   * Background stays constant, only content transitions:
   * 1. Logo/signature fade out (500ms)
   * 2. Site fades in on top (500ms)
   * 3. Remove splash overlay (now behind site)
   */
  function hideSplash() {
    console.log('Splash: hiding');

    // Step 1: Fade out logo/signature (background stays)
    splashOverlay.classList.add('splash-hide');

    // Step 2: After logo fades, show site and trigger slat reveal
    setTimeout(() => {
      const app = document.getElementById('app');
      const slatOverlay = document.getElementById('slat-overlay');

      if (app) {
        app.classList.add('site-visible');
        // Signal to app.js that video should start fading in NOW (synced with site fade)
        window.dispatchEvent(new CustomEvent('site-reveal'));
      }

      // Trigger slat slide-off
      if (slatOverlay) {
        slatOverlay.classList.add('reveal');
      }

      // Step 3: After slat animation, clean up
      setTimeout(() => {
        if (splashOverlay) splashOverlay.style.display = 'none';
        if (slatOverlay) slatOverlay.style.display = 'none';
        if (gifBlobUrl && typeof gifBlobUrl === 'string' && gifBlobUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(gifBlobUrl); } catch (_) {}
          gifBlobUrl = '';
        }
        document.body.classList.remove('splash-active');
        console.log('Splash: complete');
        // Signal to app.js that splash is fully done and video can play
        window.dispatchEvent(new CustomEvent('splash-complete'));
      }, 500);
    }, 500); // Wait for logo/signature fade first
  }

  /**
   * Check if all conditions are met to proceed
   * Called after minimum sequence (photo → signature → 1 shimmer) completes
   */
  function checkReadyToReveal() {
    if (signatureAnimationComplete && shimmerCycleComplete && appReady) {
      // Stop shimmer and hide splash
      logoContainer.classList.remove('is-shimmering');
      hideSplash();
    } else if (signatureAnimationComplete && shimmerCycleComplete && !appReady) {
      // App not ready yet - shimmer continues (CSS animation is infinite)
      // Just wait and check again when app signals ready
      console.log('Splash: waiting for app ready');
    }
  }

  /**
   * Wait for viewport dimensions to stabilize (address bar animation, etc.)
   */
  function waitForStableViewport() {
    return new Promise((resolve) => {
      let lastHeight = window.innerHeight;
      let lastWidth = window.innerWidth;
      let stableFrames = 0;
      const requiredStableFrames = 3;  // ~50ms at 60fps - quick check
      let totalFrames = 0;
      const maxFrames = 30;  // ~500ms max wait - don't block too long

      function check() {
        totalFrames++;
        const currentHeight = window.innerHeight;
        const currentWidth = window.innerWidth;

        if (currentHeight === lastHeight && currentWidth === lastWidth) {
          stableFrames++;
        } else {
          stableFrames = 0;
          lastHeight = currentHeight;
          lastWidth = currentWidth;
        }

        if (stableFrames >= requiredStableFrames) {
          resolve();
        } else if (totalFrames >= maxFrames) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      }

      requestAnimationFrame(check);
    });
  }

  /**
   * Wait for page to be visible (not prerendering or hidden)
   */
  function waitForPageVisibility() {
    return new Promise((resolve) => {
      if (document.prerendering) {
        document.addEventListener('prerenderingchange', () => {
          waitForStableViewport().then(resolve);
        }, { once: true });
        return;
      }

      if (document.visibilityState === 'hidden') {
        const onVisible = () => {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', onVisible);
            waitForStableViewport().then(resolve);
          }
        };
        document.addEventListener('visibilitychange', onVisible);
        return;
      }

      waitForStableViewport().then(resolve);
    });
  }

  /**
   * Preload an image and return a promise
   */
  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
      if (img.complete) {
        if (img.naturalWidth > 0) resolve(img);
        else reject(new Error(`Splash: Image failed to load (complete but empty): ${src}`));
      }
    });
  }

  /**
   * Parse GIF and modify it:
   * 1. Play only once (no loop)
   * 2. Extend frame 0 delay to match fade-in duration (holds on first frame)
   * Returns { duration, data } where data is the modified Uint8Array.
   */
  const FADE_IN_DURATION = 60; // 600ms in GIF time units (centiseconds) - extra buffer for fade

  function parseAndModifyGif(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const frameDelays = [];
    let i = 13;
    let netscapeExtPos = -1;
    let firstFrameDelayPos = -1;

    // Skip Global Color Table if present
    const packedByte = data[10];
    if (packedByte & 0x80) {
      i += 3 * Math.pow(2, (packedByte & 0x07) + 1);
    }

    while (i < data.length) {
      // Graphic Control Extension (frame delay)
      if (data[i] === 0x21 && data[i + 1] === 0xF9) {
        // Track first frame's delay position for modification
        if (firstFrameDelayPos === -1) {
          firstFrameDelayPos = i + 4; // delay bytes are at offset 4-5
        }
        const delay = (data[i + 4] | (data[i + 5] << 8)) * 10; // to ms
        frameDelays.push(delay);
        i += 8;
      }
      // Application Extension (check for NETSCAPE)
      else if (data[i] === 0x21 && data[i + 1] === 0xFF) {
        const blockSize = data[i + 2];
        if (blockSize === 0x0B) {
          // Check if it's NETSCAPE2.0
          const appId = String.fromCharCode(...data.slice(i + 3, i + 14));
          if (appId === 'NETSCAPE2.0') {
            // Found NETSCAPE extension - the loop count is at i + 16 and i + 17
            // Format: 21 FF 0B NETSCAPE2.0 03 01 [loop_lo] [loop_hi] 00
            netscapeExtPos = i + 16;
          }
        }
        // Skip this extension block
        i += 2;
        while (data[i] !== 0 && i < data.length) i += data[i] + 1;
        i++;
      }
      // Other extension
      else if (data[i] === 0x21) {
        i += 2;
        while (data[i] !== 0 && i < data.length) i += data[i] + 1;
        i++;
      }
      // Image descriptor
      else if (data[i] === 0x2C) {
        i += 10;
        if (data[i - 1] & 0x80) i += 3 * Math.pow(2, (data[i - 1] & 0x07) + 1);
        i++;
        while (data[i] !== 0 && i < data.length) i += data[i] + 1;
        i++;
      }
      // Trailer
      else if (data[i] === 0x3B) {
        break;
      } else {
        i++;
      }
    }

    // Modify the loop count to 1 (play once, then stop)
    if (netscapeExtPos !== -1) {
      data[netscapeExtPos] = 1;      // loop count low byte = 1
      data[netscapeExtPos + 1] = 0;  // loop count high byte = 0
    }

    // Extend first frame delay to hold during fade-in
    if (firstFrameDelayPos !== -1) {
      const originalDelay = data[firstFrameDelayPos] | (data[firstFrameDelayPos + 1] << 8);
      data[firstFrameDelayPos] = FADE_IN_DURATION & 0xFF;         // low byte
      data[firstFrameDelayPos + 1] = (FADE_IN_DURATION >> 8) & 0xFF; // high byte
    }

    // Calculate duration (add the extra fade time we added to frame 0)
    const originalFirstDelay = frameDelays[0] || 0;
    const totalDuration = frameDelays.reduce((a, b) => a + b, 0) - originalFirstDelay + (FADE_IN_DURATION * 10);

    return { duration: totalDuration, data };
  }

  /**
   * Fetch GIF, parse duration, modify to non-looping, and create blob URL.
   * Returns { duration, blobUrl }
   */
  function loadAndModifyGif(src) {
    return fetch(src, { cache: 'force-cache' })
      .then(r => r.arrayBuffer())
      .then(buf => {
        const { duration, data } = parseAndModifyGif(buf);
        // Create blob URL from the MODIFIED data
        const blob = new Blob([data], { type: 'image/gif' });
        const blobUrl = URL.createObjectURL(blob);
        return { duration, blobUrl };
      })
      .catch(err => {
        console.error('Splash: Failed to load/modify GIF', err);
        return { duration: 3000, blobUrl: src };
      });
  }

  /**
   * Wait for the app to signal it's truly ready for interaction
   * This waits for 'app-ready' class which is set when:
   * - Videos are buffered (canplaythrough)
   * - Window is loaded
   * - All project images are preloaded
   * - hasStarted = true in Vue app
   */
  function waitForAppReady() {
    return new Promise((resolve) => {
      const checkReady = () => {
        // app-ready is set by tryStart() when ALL conditions are met
        const scrollContainer = document.querySelector('.scroll-container.app-ready');
        if (scrollContainer) {
          console.log('Splash: app ready');
          appReady = true;
          resolve();
          return true;
        }
        return false;
      };

      // Check immediately
      if (checkReady()) return;

      // Set up a MutationObserver to watch for the class change
      const observer = new MutationObserver((mutations) => {
        if (checkReady()) {
          observer.disconnect();
        }
      });

      // Observe the body for added nodes and class changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });

      // Safety timeout - only as absolute last resort (slow network, stuck video)
      // 15 seconds is long enough that if we hit this, something is actually broken
      setTimeout(() => {
        if (!appReady) {
          console.warn('Splash: app ready timeout (15s) - proceeding anyway');
          appReady = true;
          observer.disconnect();
          resolve();
        }
      }, 15000);
    });
  }

  // --- Main Execution Logic ---

  // Get signature src from data attribute (src is empty to prevent early loading)
  const originalSignatureSrc = splashSignature.dataset.src;
  const originalLogoSrc = splashLogo.dataset.src || splashLogo.src;

  // Track gif data
  let gifDuration = 0;
  let gifBlobUrl = '';

  // Start loading immediately - don't wait for first paint
  // Logo is already preloaded via <link rel="preload"> in HTML, so this should be instant
  const logoPromise = preloadImage(originalLogoSrc);

  // Start GIF fetch/parse immediately in parallel
  const signaturePromise = loadAndModifyGif(originalSignatureSrc)
    .then(result => {
      gifDuration = result.duration;
      gifBlobUrl = result.blobUrl;
      return preloadImage(gifBlobUrl);
    });

  waitForPageVisibility()
    .then(() => logoPromise)
    .then(() => {
      logoLoaded = true;
      splashLogo.src = originalLogoSrc;
      splashLogo.classList.add('is-visible');
      console.log('Splash: logo visible');
      // Wait for BOTH: minimum visual gap (so logo registers first) AND signature ready
      // Whichever takes longer - no unnecessary delay if signature is already loaded
      const minVisualGap = new Promise(resolve => setTimeout(resolve, 100));
      return Promise.all([minVisualGap, signaturePromise]);
    })
    .then(() => {

      return new Promise((resolve) => {
        splashSignature.src = gifBlobUrl;
        splashSignature.classList.add('is-visible');

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const safetyBuffer = 100;
            const waitTime = gifDuration + safetyBuffer;

            setTimeout(() => {
              console.log('Splash: signature done, shimmer start');
              signatureAnimationComplete = true;
              logoContainer.classList.add('is-shimmering');

              setTimeout(() => {
                shimmerCycleComplete = true;
                resolve();
              }, 2200);
            }, waitTime);
          });
        });
      });
    })
    .then(() => {
      checkReadyToReveal();
    })
    .catch((error) => {
      console.error('Splash: Error during initialization:', error);
      setTimeout(hideSplash, 2000);
    });

  // Wait for app ready in parallel
  waitForAppReady().then(() => {
    checkReadyToReveal();
  });

})();
