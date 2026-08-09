"""Convert mobile-app.js from the dual-<video> pipeline to the canvas frame sequence."""
import io
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(REPO, "mobile-app.js")

src = io.open(PATH, encoding="utf-8").read()


def cut(start_marker, end_marker, replacement, label):
    """Replace everything from start_marker up to (not including) end_marker."""
    global src
    start = src.index(start_marker)
    end = src.index(end_marker, start)
    print("%-22s replacing %5d chars" % (label, end - start))
    src = src[:start] + replacement + src[end:]


def swap(old, new, label, expect=1):
    global src
    count = src.count(old)
    assert count == expect, "%s: expected %d occurrences, found %d" % (label, expect, count)
    src = src.replace(old, new)
    print("%-22s x%d" % (label, count))


# ---------------------------------------------------------------- refs / state
cut(
    "    const videoForwardRef = ref(null);",
    "    // Track current animation to prevent race conditions",
    '''    const coatCanvasRef = ref(null);
    const scrollProgress = ref(0);
    const currentSection = ref(1);
    const videoReady = ref(false); // Frame sequence fetched AND fully decoded
    const windowLoaded = ref(false);
    const siteLoaded = ref(false);
    let hasStarted = false;
    const isScrollLocked = ref(false);
    const showContent = ref(false);
    const exitingSection = ref(null); // Track which section is animating out
    const gradientSection = ref(1); // Tracks which gradient to show (CSS handles smooth transition)
    const gradientDuration = ref('1s'); // Duration synced to coat segment animation
    const gradientAngle = ref('135deg'); // Gradient angle for transitions
    // The coat is a canvas now, not a <video>, so there is no autoplay policy to
    // satisfy and no user gesture required. The tap-to-start gate existed purely
    // to unlock mobile video playback.
    const needsTapToStart = ref(false);
    const initialFadeComplete = ref(false); // Track if initial fade-in animation has completed

    const frameRate = 24;
    const totalFrames = 240; // last frame index; the sequence holds 0..240

''',
    "refs/state",
)

# ------------------------------------------------- frame machinery + settle
cut(
    "    // Convert frame number to timestamp",
    "    const onVisibilityChange = (e) => {",
    '''    // --- Coat frame sequence -------------------------------------------------
    // Previously two <video> elements were scrubbed by assigning currentTime on
    // every animation frame. That is the worst possible case for this asset: the
    // WebM is VP9 *with alpha* (software-decoded, no GPU path) with keyframes a
    // full second apart, so each scrub step had to decode a chain of dependent
    // frames. Now each frame is an independent decoded WebP and painting one is
    // just a drawImage. See coat-frames.js.
    let coatFrames = null;   // FrameSequence, or null if loading failed outright
    let coatCtx = null;

    const drawFrame = (index) => {
      if (!coatFrames || !coatCtx) return;
      coatFrames.draw(coatCtx, index);
    };

    const forceSettleToStableState = () => {
      // Invalidate any in-flight RAF animation so its callback becomes a no-op
      settleGeneration++;
      if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
        currentAnimationId = null;
      }
      // Remove orphaned transitionend listener that would never fire (or re-lock scroll)
      if (currentTransitionListener && currentTransitionElement) {
        currentTransitionElement.removeEventListener('transitionend', currentTransitionListener);
        currentTransitionListener = null;
        currentTransitionElement = null;
      }

      // Ensure we are not stuck mid-transition (iOS/Chrome throttles RAF when backgrounded)
      // BUT preserve scroll lock if an overlay is open (menu, CV, or project overlay)
      const overlayOpen = menuOpen.value || cvOverlayOpen.value || projectOverlay.value;
      if (!overlayOpen) {
        isScrollLocked.value = false;
      } else {
        console.log('Mobile: forceSettleToStableState - preserving scroll lock (overlay open)');
      }
      exitingSection.value = null;
      showContent.value = true;

      // Repaint the freeze frame for the current section. A canvas keeps its
      // pixels across backgrounding and there is no decoder to wake, so unlike
      // the old video path this cannot come back blank.
      const freezeFrame = sectionFrames[currentSection.value]?.[1];
      if (typeof freezeFrame === 'number') drawFrame(freezeFrame);
    };

''',
    "settle + frames",
)

# ------------------------------------ reverse table + playForward + playReverse
cut(
    "    // Reverse video: frame N in forward",
    "    // Handle wheel events for section-by-section scrolling",
    '''    // Section freeze frames double as the rest positions we keep permanently
    // decoded as ImageBitmaps, so every settled state is a zero-cost GPU blit.
    const FREEZE_FRAMES = [0, 25, 56, 69, 168, 240];

    /**
     * Animate the coat between two sections, in either direction.
     *
     * Replaces the old playForward/playReverse pair. There is no reversed asset
     * any more and no decoder to swap between - reverse is just a descending
     * frame index. The loop is driven by wall clock, so a slow frame is skipped
     * rather than stalling; it cannot buffer.
     */
    const playSection = (fromSection, targetSection) => {
      if (isScrollLocked.value) return;
      isScrollLocked.value = true;

      // Trigger exit animation on current section
      exitingSection.value = fromSection;
      showContent.value = false;

      const fromFrame = sectionFrames[fromSection][1];
      const toFrame = sectionFrames[targetSection][1];

      // Preserve the original pacing: 24fps, and segments longer than 2s run at
      // double speed (what video.playbackRate = 2 used to do).
      const spanSeconds = Math.abs(toFrame - fromFrame) / frameRate;
      const speed = spanSeconds > 2 ? 2 : 1;
      const actualDuration = spanSeconds / speed;

      // Cancel any existing animation AND transition listener to prevent race conditions
      if (currentAnimationId) {
        cancelAnimationFrame(currentAnimationId);
        currentAnimationId = null;
      }
      if (currentTransitionListener && currentTransitionElement) {
        currentTransitionElement.removeEventListener('transitionend', currentTransitionListener);
        currentTransitionListener = null;
        currentTransitionElement = null;
      }

      // Sync gradient with the animation: set duration, then trigger color change
      gradientDuration.value = `${actualDuration}s`;
      requestAnimationFrame(() => { requestAnimationFrame(() => { gradientSection.value = targetSection; }); });
      // Angle rotation: 135->180 at start, 180->135 near end
      gradientAngle.value = '180deg';
      const angleReturnMs = Math.max(0, (actualDuration * 1000) - 300);
      setTimeout(() => { gradientAngle.value = '135deg'; }, angleReturnMs);

      // Capture generation so this animation becomes a no-op if a settle happens mid-flight
      const myGeneration = settleGeneration;

      const finish = () => {
        currentAnimationId = null;
        drawFrame(toFrame);
        exitingSection.value = null;
        showContent.value = true;
        // Listen for actual CSS transitionend - no guessing
        const sectionEl = document.querySelector(`.section-content.section-${targetSection}`);
        if (sectionEl) {
          const onTransitionEnd = (e) => {
            // Only unlock on opacity transition (the main visibility transition)
            if (e.propertyName === 'opacity') {
              sectionEl.removeEventListener('transitionend', onTransitionEnd);
              currentTransitionListener = null;
              currentTransitionElement = null;
              isScrollLocked.value = false;
            }
          };
          currentTransitionListener = onTransitionEnd;
          currentTransitionElement = sectionEl;
          sectionEl.addEventListener('transitionend', onTransitionEnd);
        } else {
          // Fallback if element not found
          isScrollLocked.value = false;
        }
      };

      if (!coatFrames) {
        finish();
        return;
      }

      // Decode the upcoming frames into ImageBitmaps off the main thread.
      coatFrames.prewarm(fromFrame, toFrame);

      const durationMs = actualDuration * 1000;
      const animStartTime = performance.now();
      const span = toFrame - fromFrame;

      const animateFrame = () => {
        // Bail if a forced settle invalidated this animation
        if (myGeneration !== settleGeneration) { currentAnimationId = null; return; }

        const progress = durationMs <= 0 ? 1 : Math.min((performance.now() - animStartTime) / durationMs, 1);
        drawFrame(Math.round(fromFrame + span * progress));

        if (progress < 1) {
          currentAnimationId = requestAnimationFrame(animateFrame);
        } else {
          finish();
        }
      };
      currentAnimationId = requestAnimationFrame(animateFrame);
    };

''',
    "playSection",
)

# ------------------------------------------------------ tryStart + intro
cut(
    "    const tryStart = () => {",
    "    // Android back button handler",
    '''    const tryStart = () => {
      if (!hasStarted && videoReady.value && windowLoaded.value && siteLoaded.value) {
        hasStarted = true;
        // Signal to splash that app is truly ready for interaction
        const scrollContainer = document.querySelector('.scroll-container');
        if (scrollContainer) {
          scrollContainer.classList.add('app-ready');
        }
        // Dispatch event for reliable detection by splash.js
        window.dispatchEvent(new CustomEvent('app-ready'));

        // Play the intro once the splash has fully lifted. This used to require
        // a tap because mobile browsers block video autoplay - a canvas has no
        // such restriction, so the gate is gone.
        window.addEventListener('splash-complete', () => {
          initialFadeComplete.value = true;
          playSection(0, 1);
        }, { once: true });
      }
    };

''',
    "tryStart",
)

# ------------------------------------------------------- onMounted loading
cut(
    "      // Initialize both videos",
    "      // Preload all project images",
    '''      // Track all assets that need to load
      let imagesLoaded = 0;
      const totalImages = projects.length;

      const checkAllAssetsLoaded = () => {
        if (imagesLoaded === totalImages) {
          siteLoaded.value = true;
          tryStart();
        }
      };

''',
    "onMounted preload",
)

cut(
    "      const onWindowLoad = () => {",
    "    });\n\n    onUnmounted(() => {",
    '''      const onWindowLoad = () => {
        windowLoaded.value = true;
        tryStart();
      };

      if (document.readyState === 'complete') {
        windowLoaded.value = true;
        tryStart(); // Ensure tryStart is called when already loaded
      } else {
        window.addEventListener('load', onWindowLoad);
      }

      // Load the coat frame sequence. Resolves only once every frame is
      // downloaded AND decoded, so once the splash lifts there is nothing left
      // to fetch or decode and swiping cannot buffer. The old path relied on
      // preload="auto" plus polling video.buffered, which iOS Safari ignores for
      // large media - it routinely hit the 20s timeout and revealed the site
      // with the coat only partly buffered.
      CoatFrames.load({
        pin: FREEZE_FRAMES,
        onProgress: (fraction) => {
          window.dispatchEvent(new CustomEvent('coat-progress', { detail: fraction }));
        }
      }).then((sequence) => {
        coatFrames = sequence;

        const canvas = coatCanvasRef.value;
        canvas.width = sequence.width;
        canvas.height = sequence.height;
        coatCtx = canvas.getContext('2d');
        drawFrame(0);

        console.log(`Mobile: coat frames ready (${sequence.frameCount} frames @ ${sequence.width}x${sequence.height})`);
        videoReady.value = true;
        siteLoaded.value = true;
        tryStart();
      }).catch((err) => {
        console.error('Mobile: coat frame sequence failed to load', err);
        // Degrade honestly rather than hanging on the splash forever: the site
        // stays usable and section changes become instant cuts.
        coatFrames = null;
        videoReady.value = true;
        siteLoaded.value = true;
        tryStart();
      });

''',
    "onMounted frames",
)

# --------------------------------------------------------------- call sites
swap("playForward(fromSection, currentSection.value);", "playSection(fromSection, currentSection.value);", "call: forward next", 2)
swap("playReverse(fromSection, currentSection.value);", "playSection(fromSection, currentSection.value);", "call: reverse prev", 2)
swap("playForward(fromSection, sectionIndex);", "playSection(fromSection, sectionIndex);", "call: forward jump", 1)
swap("playReverse(fromSection, sectionIndex);", "playSection(fromSection, sectionIndex);", "call: reverse jump", 1)

# ------------------------------------------------------------------ returns
swap("""      videoForwardRef,
      videoReverseRef,
      scrollProgress,""", """      coatCanvasRef,
      scrollProgress,""", "returns: refs")

swap("""      isReversing,
      videoSwitchReady,
      videoReady,""", """      videoReady,""", "returns: flags")

# ----------------------------------------------------------------- template
swap('''        <!-- Forward video: visible unless we're in reverse mode AND switch is complete -->
        <video
          ref="videoForwardRef"
          muted
          playsinline
          preload="auto"
          :class="{
            'video-active': !(isReversing && videoSwitchReady) && videoReady && initialFadeComplete,
            'video-fade-in': !isReversing && videoReady && !initialFadeComplete,
            'video-hidden': isReversing && videoSwitchReady,
            'video-loading': !videoReady
          }"
          :style="{ opacity: videoReady ? null : 0 }"
          @animationend="initialFadeComplete = true"
        >
          <source src="assets/Coat_Unfolding.mov" type='video/quicktime; codecs="hvc1"'>
          <source src="assets/Coat_Unfolding.webm" type="video/webm">
        </video>
        <!-- Reverse video: visible only when in reverse mode AND switch is complete -->
        <video
          ref="videoReverseRef"
          muted
          playsinline
          preload="auto"
          :class="{
            'video-active': isReversing && videoSwitchReady && videoReady,
            'video-hidden': !(isReversing && videoSwitchReady),
            'video-loading': !videoReady
          }"
          :style="{ opacity: videoReady ? null : 0 }"
        >
          <source src="assets/Coat_Unfolding_Reverse.mov" type='video/quicktime; codecs="hvc1"'>
          <source src="assets/Coat_Unfolding_Reverse.webm" type="video/webm">
        </video>''', '''        <!-- Coat frame sequence: one canvas, both directions -->
        <canvas
          ref="coatCanvasRef"
          class="coat-canvas"
          :class="{
            'video-active': videoReady && initialFadeComplete,
            'video-fade-in': videoReady && !initialFadeComplete,
            'video-loading': !videoReady
          }"
          @animationend="initialFadeComplete = true"
        ></canvas>''', "template: canvas")

io.open(PATH, "w", encoding="utf-8").write(src)

leftover = [n for n in ("playForward", "playReverse", "sectionFramesReverse", "videoForwardRef",
                        "videoReverseRef", "isReversing", "videoSwitchReady", "frameToTime",
                        "reverseVideoReady", "forwardVideoReady", "handleTapToStart",
                        "videoDuration", "wakeVideo")
            if n in src]
print("\nremaining old-pipeline references:", leftover or "none")
