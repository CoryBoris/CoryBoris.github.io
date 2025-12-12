// Mobile-specific Vue app
// Based on the old mobile version with tap-to-start added

const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

const App = {
  setup() {
    const videoForwardRef = ref(null);
    const videoReverseRef = ref(null);
    const scrollProgress = ref(0);
    const currentSection = ref(1);
    const videoReady = ref(false);
    const windowLoaded = ref(false);
    let hasStarted = false;
    const isScrollLocked = ref(false);
    const showContent = ref(false);
    const exitingSection = ref(null); // Track which section is animating out
    const isReversing = ref(false);
    const videoSwitchReady = ref(true); // Tracks if incoming video is ready to show
    const gradientSection = ref(1); // Tracks which gradient to show (CSS handles smooth transition)
    const gradientDuration = ref('1s'); // Duration synced to video segment playback
    const gradientAngle = ref('135deg'); // Gradient angle for transitions
    const needsTapToStart = ref(true); // Mobile needs user gesture to unlock video
    const initialFadeComplete = ref(false); // Track if initial fade-in animation has completed

    const videoDuration = 10;
    const frameRate = 24;
    const totalFrames = 240; // 10 seconds * 24 fps

    // Convert frame number to timestamp
    // Add tiny epsilon to land solidly within the target frame, avoiding boundary rounding issues
    const frameToTime = (frame) => (frame / frameRate) + 0.001;

    // Gradient section is now controlled via data-section attribute on .video-container
    // CSS handles the smooth color interpolation via @property

    // Project content for each section
    const projects = [
      {
        number: '01',
        title: 'Newsway',
        logo: 'assets/newsway_project.jpg',
        link: 'newsway.html',
        description: 'NewsWay is a news summary engine which leverages Google\'s Gemini Ai to deliver concise and digestible summaries of the latest breaking news.'
      },
      {
        number: '02',
        title: 'GifSig',
        logo: 'assets/gifsig_project.png',
        link: 'gifsig.html',
        description: 'GifSig is a privacy-first tool for creating animated signature GIFs with zero data collection.'
      },
      {
        number: '03',
        title: 'Nadette',
        logo: 'assets/nadette_project.png',
        link: 'nadette.html',
        description: 'Nadette is a phone-based personal assistant you can call to execute tasks using natural voice commands.'
      },
      {
        number: '04',
        title: 'TrueAutoColor',
        logo: 'assets/TrueAutoColor_project.JPG',
        link: 'trueautocolor.html',
        description: 'TrueAutoColor automatically colors your Ableton Live tracks and clips based on their names—no plugins required.'
      }
    ];

    // Section timing using FRAME NUMBERS for accuracy
    // Use multiples of 24 where possible to avoid floating point issues
    // [startFrame, endFrame] - endFrame is the freeze frame
    const sectionFrames = {
      0: [0, 0],        // virtual section 0 for initial state (frame 0)
      1: [0, 25],       // frames 0-24 (0-1s), freeze at frame 24
      2: [26, 56],      // frames 24-56 (1-2.33s), freeze at frame 56 (was 55, now divisible by 8)
      3: [57, 168],     // frames 56-168 (2.33-7s), freeze at frame 168
      4: [169, 240]     // frames 168-240 (7-10s), freeze at frame 240
    };

    // Reverse video: frame N in forward = frame (totalFrames - N) in reverse
    // For frame-perfect alignment, reverse freeze frames must exactly match forward freeze frames
    // Forward freezes at: 24, 56, 168, 240 → Reverse freezes at: 216, 184, 72, 0
    const sectionFramesReverse = {
      1: [totalFrames - 24, totalFrames],         // frames 216-240, freeze at 216 (matches fwd frame 24)
      2: [totalFrames - 56, totalFrames - 24],    // frames 184-216, freeze at 184 (matches fwd frame 56)
      3: [totalFrames - 168, totalFrames - 56],   // frames 72-184, freeze at 72 (matches fwd frame 168)
      4: [totalFrames - 240, totalFrames - 168]   // frames 0-72, freeze at 0 (matches fwd frame 240)
    };

    // Track if videos are pre-buffered and ready at correct positions
    const reverseVideoReady = ref(false);
    const forwardVideoReady = ref(true); // Forward starts ready at frame 0
    let reverseTargetTime = 0;
    let forwardTargetTime = 0;

    // Play video forward (supports multi-section jumps)
    const playForward = (fromSection, targetSection) => {
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;
      if (!videoFwd) return;
      if (isScrollLocked.value) return;

      isScrollLocked.value = true;

      // Trigger exit animation on current section
      exitingSection.value = fromSection;
      showContent.value = false;

      // For multi-section jumps, play from current position to target end frame
      const [, startEndFrame] = sectionFrames[fromSection];
      const [, endFrame] = sectionFrames[targetSection];
      const startTime = frameToTime(startEndFrame);
      const endTime = frameToTime(endFrame);
      const segmentLength = endTime - startTime;
      const playbackRate = segmentLength > 2 ? 2 : 1;
      videoFwd.playbackRate = playbackRate;

      // Orchestrate gradient transition
      const actualDuration = segmentLength / playbackRate;
      const angleTransitionTime = 300; // ms for angle to rotate
      gradientAngle.value = '180deg';
      setTimeout(() => {
        gradientDuration.value = `${actualDuration - 0.6}s`;
        gradientSection.value = targetSection;
      }, angleTransitionTime);
      setTimeout(() => {
        gradientAngle.value = '135deg';
      }, (actualDuration * 1000) - angleTransitionTime);

      const startPlayback = () => {
        videoFwd.play();

        // PRE-BUFFER reverse video while forward plays
        // DELAY this seek to ensure videoRev is fully hidden (opacity applied) before scrubbing
        setTimeout(() => {
          const revEndFrame = sectionFramesReverse[targetSection][0];
          reverseTargetTime = frameToTime(revEndFrame);
          reverseVideoReady.value = false;
          if (videoRev) {
            videoRev.currentTime = reverseTargetTime;
            videoRev.addEventListener('seeked', () => {
              reverseVideoReady.value = true;
            }, { once: true });
          }
        }, 100);

        const checkTime = () => {
          if (videoFwd.currentTime >= endTime - 0.02) {
            videoFwd.pause();
            videoFwd.currentTime = endTime;
            isScrollLocked.value = false;
            exitingSection.value = null; // Clear exiting state
            showContent.value = true;
          } else {
            requestAnimationFrame(checkTime);
          }
        };

        // Seek first, then play after seek completes
        const onSeeked = () => {
            // Wait for paint if we just swapped
            requestAnimationFrame(checkTime);
        };
        // We are already playing, checkTime handles the loop
        requestAnimationFrame(checkTime);
      };

      // Ensure start position and wait for seek to complete before playing
      videoFwd.currentTime = startTime;

      const onSeekReady = () => {
        // If we are currently showing Reverse, we need to swap
        if (isReversing.value) {
          // Mark switch in progress - keeps reverse video visible until forward is ready
          videoSwitchReady.value = false;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              videoSwitchReady.value = true; // Forward is ready
              isReversing.value = false; // Swap to Forward
              startPlayback();
            });
          });
        } else {
          startPlayback();
        }
      };

      // Wait for seek to complete before starting playback
      videoFwd.addEventListener('seeked', onSeekReady, { once: true });
    };

    // Play video in reverse (using the reversed video file)
    const playReverse = (fromSection, targetSection) => {
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;
      if (!videoRev || isScrollLocked.value) return;

      isScrollLocked.value = true;

      // Trigger exit animation on current section
      exitingSection.value = fromSection;
      showContent.value = false;

      // Get frame numbers
      const [revStartFrame] = sectionFramesReverse[fromSection];
      const [revEndFrame] = sectionFramesReverse[targetSection];
      const [, targetEndFrame] = sectionFrames[targetSection];

      // Convert to timestamps
      const revStartTime = frameToTime(revStartFrame);
      const revEndTime = frameToTime(revEndFrame);
      const targetEndTime = frameToTime(targetEndFrame);

      const segmentLength = revEndTime - revStartTime;
      const playbackRate = segmentLength > 2 ? 2 : 1;
      videoRev.playbackRate = playbackRate;

      // Orchestrate gradient transition
      const actualDuration = segmentLength / playbackRate;
      const angleTransitionTime = 300; // ms for angle to rotate
      gradientAngle.value = '180deg';
      setTimeout(() => {
        gradientDuration.value = `${actualDuration - 0.6}s`;
        gradientSection.value = targetSection;
      }, angleTransitionTime);
      setTimeout(() => {
        gradientAngle.value = '135deg';
      }, (actualDuration * 1000) - angleTransitionTime);

      const startPlayback = () => {
        videoRev.play();

        // NOW pre-buffer forward video while reverse plays (forward is hidden now)
        // DELAY this seek slightly to ensure forward video is fully hidden
        setTimeout(() => {
            forwardVideoReady.value = false;
            forwardTargetTime = targetEndTime;
            videoFwd.currentTime = targetEndTime;
            videoFwd.addEventListener('seeked', () => {
              forwardVideoReady.value = true;
            }, { once: true });
        }, 100);

        const checkTime = () => {
          if (videoRev.currentTime >= revEndTime - 0.02) {
            videoRev.pause();
            videoRev.currentTime = revEndTime;

            isScrollLocked.value = false;
            exitingSection.value = null; // Clear exiting state
            showContent.value = true;
            // STAY on Reverse video - no swap back!
          } else {
            requestAnimationFrame(checkTime);
          }
        };
        requestAnimationFrame(checkTime);
      };

      // Ensure start position and wait for seek to complete before playing
      videoRev.currentTime = revStartTime;

      const onSeekReady = () => {
        // If we are currently showing Forward (default), we need to swap
        if (!isReversing.value) {
          // Mark switch in progress - keeps forward video visible until reverse is ready
          videoSwitchReady.value = false;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              videoSwitchReady.value = true;
              isReversing.value = true; // Swap to Reverse
              startPlayback();
            });
          });
        } else {
          // Already in reverse mode, just play (no visibility change needed)
          startPlayback();
        }
      };

      // Wait for seek to complete before starting playback
      videoRev.addEventListener('seeked', onSeekReady, { once: true });
    };

    // Handle wheel events for section-by-section scrolling
    const handleWheel = (e) => {
      e.preventDefault();
      if (needsTapToStart.value) return; // Block scroll if tap-to-start is active
      if (isScrollLocked.value) return;

      const delta = e.deltaY;
      if (delta > 20 && currentSection.value < 4) {
        const fromSection = currentSection.value;
        currentSection.value++;
        playForward(fromSection, currentSection.value);
      } else if (delta < -20 && currentSection.value > 1) {
        const fromSection = currentSection.value;
        currentSection.value--;
        playReverse(fromSection, currentSection.value);
      }
    };

    // Handle touch events for mobile
    let touchStartY = 0;
    const handleTouchStart = (e) => {
      if (needsTapToStart.value) return; // Block swipe if tap-to-start is active
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      if (needsTapToStart.value) return; // Block swipe if tap-to-start is active
      if (isScrollLocked.value) return;

      const touchEndY = e.changedTouches[0].clientY;
      const delta = touchStartY - touchEndY;

      if (delta > 50 && currentSection.value < 4) {
        const fromSection = currentSection.value;
        currentSection.value++;
        playForward(fromSection, currentSection.value);
      } else if (delta < -50 && currentSection.value > 1) {
        const fromSection = currentSection.value;
        currentSection.value--;
        playReverse(fromSection, currentSection.value);
      }
    };

    const scrollToSection = (sectionIndex) => {
      if (needsTapToStart.value) return; // Block if tap-to-start is active
      if (isScrollLocked.value || sectionIndex === currentSection.value) return;
      const fromSection = currentSection.value;
      currentSection.value = sectionIndex;
      if (sectionIndex > fromSection) {
        playForward(fromSection, sectionIndex);
      } else {
        playReverse(fromSection, sectionIndex);
      }
    };

    const tryStart = () => {
      if (!hasStarted && videoReady.value && windowLoaded.value) {
        hasStarted = true;
      }
    };

    const handleTapToStart = () => {
      if (!needsTapToStart.value) return;
      needsTapToStart.value = false;
      initialFadeComplete.value = true;

      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      // MOBILE AUTOPLAY FIX: Must call play() directly in user gesture handler.
      if (videoFwd) {
        videoFwd.currentTime = 0; // Reset to start
        const playPromise = videoFwd.play();
        if (playPromise) {
          playPromise.then(() => {
            // Video is now playing from 0. Set up the checkTime loop to stop at frame 24.
            isScrollLocked.value = true;
            showContent.value = false;

            const endTime = frameToTime(24); // Frame 24 = 1 second

            const checkTime = () => {
              if (videoFwd.currentTime >= endTime - 0.02) {
                videoFwd.pause();
                videoFwd.currentTime = endTime;
                isScrollLocked.value = false;
                showContent.value = true;
                currentSection.value = 1;
              } else {
                requestAnimationFrame(checkTime);
              }
            };
            requestAnimationFrame(checkTime);
          }).catch(() => {});
        }
      }

      // Also unlock reverse video for later use
      if (videoRev) {
        videoRev.play().then(() => {
          videoRev.pause();
        }).catch(() => {});
      }
    };

    onMounted(() => {
      // Prevent default scroll
      document.body.style.overflow = 'hidden';

      // Add wheel listener with passive: false to allow preventDefault
      window.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });

      // Initialize both videos
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      let loadedCount = 0;
      const onVideoReady = () => {
        loadedCount++;
        if (loadedCount === 2) {
          videoReady.value = true;
          tryStart();
        }
      };

      const onWindowLoad = () => {
        windowLoaded.value = true;
        tryStart();
      };

      if (document.readyState === 'complete') {
        windowLoaded.value = true;
      } else {
        window.addEventListener('load', onWindowLoad);
      }

      if (videoFwd) {
        videoFwd.muted = true;
        videoFwd.playsInline = true;
        videoFwd.addEventListener('loadeddata', onVideoReady, { once: true });
        videoFwd.load();
      }

      if (videoRev) {
        videoRev.muted = true;
        videoRev.playsInline = true;
        videoRev.addEventListener('loadeddata', onVideoReady, { once: true });
        videoRev.load();
      }
    });

    onUnmounted(() => {
      document.body.style.overflow = '';
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    });

    const menuOpen = ref(false);
    const menuClosing = ref(false);
    const toggleMenu = () => {
      if (menuOpen.value) {
        // Menu is closing - set closing state and wait for animation
        menuClosing.value = true;
        menuOpen.value = false;
        setTimeout(() => {
          menuClosing.value = false;
        }, 1600); // Start tap-to-play fade-in before hamburger overlay finishes
      } else {
        menuOpen.value = true;
      }
    };

    return {
      videoForwardRef,
      videoReverseRef,
      scrollProgress,
      currentSection,
      gradientSection,
      gradientDuration,
      projects,
      scrollToSection,
      isScrollLocked,
      showContent,
      exitingSection,
      isReversing,
      videoSwitchReady,
      videoReady,
      needsTapToStart,
      handleTapToStart,
      initialFadeComplete,
      menuOpen,
      menuClosing,
      toggleMenu
    };
  },

  template: `
    <div class="scroll-container">
      <!-- Progress bar -->
      <div class="progress-bar" :style="{ width: (scrollProgress * 100) + '%' }"></div>

      <!-- Video background with CSS-interpolated gradient -->
      <div class="video-container" :data-section="gradientSection" :style="{ '--gradient-duration': gradientDuration }">
        <!-- Forward video: visible unless we're in reverse mode AND switch is complete -->
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
          <source src="assets/Coat_Unfolding.mp4" type="video/mp4">
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
          <source src="assets/Coat_Unfolding_Reverse.mp4" type="video/mp4">
        </video>
      </div>

      <!-- Hamburger Menu Button -->
      <button class="hamburger-btn" :class="{ active: menuOpen }" @click="toggleMenu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <!-- Menu Overlay -->
      <div class="menu-overlay" :class="{ active: menuOpen }">
        <div class="menu-content">
          <nav>
            <a href="#about" @click="toggleMenu">About</a>
            <a href="#contact" @click="toggleMenu">Contact</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" @click="toggleMenu">LinkedIn</a>
          </nav>
        </div>
      </div>

      <!-- Header -->
      <div class="header-title">
        <h1>Cory's Portfolio</h1>
      </div>

      <!-- Content overlay -->
      <div class="content-overlay">
        <div
          v-for="(project, index) in projects"
          :key="index"
          class="section-content"
          :class="['section-' + (index + 1), { active: currentSection === index + 1 && showContent, exiting: exitingSection === index + 1 }]"
        >
          <a :href="project.link" class="project-link">
            <img v-if="project.logo" :src="project.logo" :alt="project.title" class="project-logo">
            <h2 v-else>{{ project.title }}</h2>
          </a>
        </div>
      </div>

      <!-- Section dots navigation -->
      <div class="section-dots">
        <div
          v-for="i in 4"
          :key="i"
          class="section-dot"
          :class="{ active: currentSection === i }"
          @click="scrollToSection(i)"
        ></div>
      </div>

      <!-- Scroll indicator -->
      <div class="scroll-indicator" :class="{ hidden: needsTapToStart || scrollProgress > 0.05 }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        <div>Scroll</div>
      </div>

      <!-- Tap to start overlay (mobile only) - hidden when menu is open or closing -->
      <div v-if="needsTapToStart && videoReady && !menuOpen && !menuClosing" class="tap-to-start" @click="handleTapToStart">
        <div class="tap-to-start-content">
          <div class="tap-icon">👆</div>
          <div>tap to activate Cory's Portfolio</div>
        </div>
      </div>

    </div>
  `
};

createApp(App).mount('#app');
