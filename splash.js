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
   */
  function hideSplash() {
    console.log("Splash: Hiding splash screen.");
    splashOverlay.classList.add('splash-hide');
    setTimeout(() => {
      if (splashOverlay) splashOverlay.style.display = 'none';
      document.body.classList.remove('splash-active');
      console.log("Splash: Animation complete and body unlocked.");
    }, 500);
  }

  /**
   * Check if all conditions are met to proceed
   * Called after minimum sequence (photo → signature → 1 shimmer) completes
   */
  function checkReadyToReveal() {
    console.log(`Splash: Checking ready state - signatureComplete: ${signatureAnimationComplete}, shimmerComplete: ${shimmerCycleComplete}, appReady: ${appReady}`);
    if (signatureAnimationComplete && shimmerCycleComplete && appReady) {
      // Stop shimmer and hide splash
      logoContainer.classList.remove('is-shimmering');
      hideSplash();
    } else if (signatureAnimationComplete && shimmerCycleComplete && !appReady) {
      // App not ready yet - shimmer continues (CSS animation is infinite)
      // Just wait and check again when app signals ready
      console.log('Splash: Minimum hold complete, waiting for app ready (shimmer continues)');
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
      const requiredStableFrames = 10;
      let totalFrames = 0;
      const maxFrames = 120;

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
          console.log(`Splash: Viewport stable at ${currentHeight}px`);
          resolve();
        } else if (totalFrames >= maxFrames) {
          console.warn(`Splash: Viewport stability timeout`);
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
        console.log('Splash: Page is prerendering, waiting...');
        document.addEventListener('prerenderingchange', () => {
          waitForStableViewport().then(resolve);
        }, { once: true });
        return;
      }

      if (document.visibilityState === 'hidden') {
        console.log('Splash: Page is hidden, waiting...');
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
    });
  }

  /**
   * Parse GIF to get frame delays - returns duration UP TO last frame appearing
   * (excludes last frame's delay since that's just a hold)
   */
  function parseGifDuration(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const frameDelays = [];
    let i = 13;

    // Skip Global Color Table if present
    const packedByte = data[10];
    if (packedByte & 0x80) {
      i += 3 * Math.pow(2, (packedByte & 0x07) + 1);
    }

    while (i < data.length) {
      if (data[i] === 0x21 && data[i + 1] === 0xF9) {
        const delay = (data[i + 4] | (data[i + 5] << 8)) * 10; // to ms
        frameDelays.push(delay);
        i += 8;
      } else if (data[i] === 0x21) {
        i += 2;
        while (data[i] !== 0 && i < data.length) i += data[i] + 1;
        i++;
      } else if (data[i] === 0x2C) {
        i += 10;
        if (data[i - 1] & 0x80) i += 3 * Math.pow(2, (data[i - 1] & 0x07) + 1);
        i++;
        while (data[i] !== 0 && i < data.length) i += data[i] + 1;
        i++;
      } else if (data[i] === 0x3B) {
        break;
      } else {
        i++;
      }
    }

    const totalDuration = frameDelays.reduce((a, b) => a + b, 0);
    const lastFrameDelay = frameDelays.length > 0 ? frameDelays[frameDelays.length - 1] : 0;
    // Duration until last frame APPEARS (excluding its hold time)
    const durationToLastFrame = totalDuration - lastFrameDelay;

    console.log(`Splash: GIF has ${frameDelays.length} frames, duration: ${durationToLastFrame}ms`);

    return durationToLastFrame;
  }

  /**
   * Fetch GIF, parse duration, and create blob URL for immediate use
   * Returns { duration, blobUrl } - blob is pre-fetched so no decode delay
   */
  function loadAndParseGif(src) {
    return fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const duration = parseGifDuration(buf);
        // Create blob URL from the SAME data we parsed - no second fetch needed
        const blob = new Blob([buf], { type: 'image/gif' });
        const blobUrl = URL.createObjectURL(blob);
        return { duration, blobUrl };
      })
      .catch(err => {
        console.error('Splash: Failed to parse GIF', err);
        return { duration: 3000, blobUrl: src };
      });
  }

  /**
   * Wait for the app to signal it's ready
   */
  function waitForAppReady() {
    return new Promise((resolve) => {
      // Listen for siteLoaded event from the Vue app
      const checkReady = () => {
        const scrollContainer = document.querySelector('.scroll-container.site-loaded');
        if (scrollContainer) {
          console.log('Splash: App ready (site-loaded class found)');
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

      // Safety timeout - if app doesn't load within 8 seconds, proceed anyway
      setTimeout(() => {
        if (!appReady) {
          console.warn('Splash: App ready timeout - proceeding anyway');
          appReady = true;
          observer.disconnect();
          resolve();
        }
      }, 8000);
    });
  }

  // --- Main Execution Logic ---
  console.log('Splash: Initializing...');

  // Store original signature src and clear it
  const originalSignatureSrc = splashSignature.src;
  splashSignature.src = '';

  // Track gif data
  let gifDuration = 0;
  let gifBlobUrl = '';

  // Step 1: Preload logo AND load/parse GIF (creates blob URL from same fetch)
  Promise.all([
    preloadImage(splashLogo.src),
    loadAndParseGif(originalSignatureSrc).then(result => {
      gifDuration = result.duration;
      gifBlobUrl = result.blobUrl;
      // Pre-decode by creating an Image and waiting for load
      return preloadImage(gifBlobUrl);
    })
  ]).then(() => {
    console.log(`Splash: Assets ready and pre-decoded, GIF duration: ${gifDuration}ms`);
    logoLoaded = true;

    return waitForPageVisibility();
  }).then(() => {
    splashLogo.classList.add('is-visible');
    console.log('Splash: Logo visible');

    // Wait for logo fade-in (600ms)
    return new Promise(resolve => setTimeout(resolve, 600));
  }).then(() => {
    // Step 2: Show GIF and start timer AFTER it's painted to screen
    return new Promise((resolve) => {
      // Set src and make visible
      splashSignature.src = gifBlobUrl;
      splashSignature.classList.add('is-visible');

      // Wait for ACTUAL paint using double-rAF pattern
      // First rAF: scheduled for next frame
      // Second rAF: ensures first frame has been painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const startTime = performance.now();
          console.log(`Splash: GIF painted, starting ${gifDuration}ms timer`);

          setTimeout(() => {
            console.log(`Splash: Timer fired at ${Math.round(performance.now() - startTime)}ms, starting shimmer`);
            signatureAnimationComplete = true;
            logoContainer.classList.add('is-shimmering');

            setTimeout(() => {
              shimmerCycleComplete = true;
              console.log('Splash: Shimmer cycle complete');
              resolve();
            }, 2000);
          }, gifDuration);
        });
      });
    });
  }).then(() => {
    checkReadyToReveal();
  }).catch((error) => {
    console.error('Splash: Error during initialization:', error);
    setTimeout(hideSplash, 2000);
  });

  // Wait for app ready in parallel
  waitForAppReady().then(() => {
    checkReadyToReveal();
  });

})();
