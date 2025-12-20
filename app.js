const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

const App = {
  setup() {
    const videoForwardRef = ref(null);
    const videoReverseRef = ref(null);
    const scrollProgress = ref(0);
    const currentSection = ref(1);
    const videoReady = ref(false);
    const windowLoaded = ref(false);
    const imagesReady = ref(false);
    const siteLoaded = ref(false);
    let hasStarted = false;
    const showContent = ref(false);
    const videoFadedIn = ref(false); // Controls video fade-in on frame 0
    const exitingSection = ref(null); // Track which section is animating out
    const isReversing = ref(false);
    const videoSwitchReady = ref(true); // Tracks if incoming video is ready to show
    const initialIntroDone = ref(false);
    const isScrollLocked = ref(true); // Block scrolls during animation
    const gradientSection = ref(0); // Start at 0 (matches splash), transitions to 1 on initial play
    const gradientDuration = ref('1s'); // Duration synced to video segment playback
    const gradientAngle = ref('135deg'); // Angle: 135deg at rest, 180deg during color transition
    const angleDuration = ref('0.3s'); // Quick angle transitions

    const videoDuration = 10;
    const frameRate = 24;
    const totalFrames = 240; // 10 seconds * 24 fps

    // Convert frame number to timestamp
    // Add tiny epsilon to land solidly within the target frame, avoiding boundary rounding issues
    const frameToTime = (frame) => (frame / frameRate) + 0.001;

    const forceSettleToStableState = () => {
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      // If we got backgrounded mid-transition, ensure UI is interactive again
      exitingSection.value = null;
      showContent.value = initialIntroDone.value;
      videoSwitchReady.value = true;
      // Re-enable scrolling if intro is done
      isScrollLocked.value = !initialIntroDone.value;

      // Snap visible video to the freeze frame for the current section
      const section = currentSection.value;
      if (isReversing.value) {
        const freezeFrame = sectionFramesReverse[section]?.[0];
        if (videoRev && typeof freezeFrame === 'number') {
          try {
            videoRev.pause();
            videoRev.currentTime = frameToTime(freezeFrame);
          } catch (_) {}
        }
      } else {
        const freezeFrame = sectionFrames[section]?.[1];
        if (videoFwd && typeof freezeFrame === 'number') {
          try {
            videoFwd.pause();
            videoFwd.currentTime = frameToTime(freezeFrame);
          } catch (_) {}
        }
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden && hasStarted) {
        forceSettleToStableState();
      }
    };

    const onPageShow = (e) => {
      // Avoid interfering with the initial load (pageshow fires on first load too).
      // Only force-settle on BFCache restores.
      if (e && e.persisted) {
        forceSettleToStableState();
      }
    };

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
        description: 'GifSig is simply an excuse to scribble on your phone but you can also capture your signature as a once-looped high-quality GIF, ideal for email signatures.'
      },
      {
        number: '03',
        title: 'Nadette',
        logo: 'assets/nadette_project.jpg',
        link: 'nadette.html',
        description: 'Nadette is a personal assistant you can easily call to execute tasks using natural voice commands.'
      },
      {
        number: '04',
        title: 'TrueAutoColor',
        logo: 'assets/TrueAutoColor_project.jpg',
        link: 'trueautocolor.html',
        description: 'TrueAutoColor automatically colors your Ableton Live tracks and clips based on their names without using plugins.'
      }
    ];

    // Section timing using FRAME NUMBERS for accuracy
    // [startFrame, endFrame] - endFrame is the freeze frame
    const sectionFrames = {
      0: [0, 0],        // virtual section 0 for initial state (frame 0)
      1: [0, 23],       // frames 0-24 (0-1s), freeze at frame 24
      2: [23, 55],      // frames 24-55 (1-2.3s), freeze at frame 55
      3: [55, 168],     // frames 55-168 (2.3-7s), freeze at frame 168
      4: [168, 240]     // frames 168-240 (7-10s), freeze at frame 240
    };

    // Reverse video: frame N in forward = frame (totalFrames - N) in reverse
    // For frame-perfect alignment, reverse freeze frames must exactly match forward freeze frames
    // Forward freezes at: 24, 55, 168, 240 → Reverse freezes at: 216, 185, 72, 0
    const sectionFramesReverse = {
      1: [totalFrames - 24, totalFrames],         // frames 216-240, freeze at 216 (matches fwd frame 24)
      2: [totalFrames - 55, totalFrames - 24],    // frames 185-216, freeze at 185 (matches fwd frame 55)
      3: [totalFrames - 168, totalFrames - 55],   // frames 72-185, freeze at 72 (matches fwd frame 168)
      4: [totalFrames - 240, totalFrames - 168]   // frames 0-72, freeze at 0 (matches fwd frame 240)
    };

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
      // For initial 0→1 transition, use full duration for smoother blend from splash
      const gradientTransitionTime = fromSection === 0
        ? actualDuration
        : Math.max(0.4, actualDuration - 0.6);
      gradientAngle.value = '180deg';
      setTimeout(() => {
        gradientDuration.value = `${gradientTransitionTime}s`;
        gradientSection.value = targetSection;
      }, angleTransitionTime);
      setTimeout(() => {
        gradientAngle.value = '135deg';
      }, (actualDuration * 1000) - angleTransitionTime);

      const startPlayback = () => {
        videoFwd.play();

        // Sync reverse video position (using frame-accurate time)
        // DELAY this seek to ensure videoRev is fully hidden (opacity applied) before scrubbing
        setTimeout(() => {
          const revEndFrame = sectionFramesReverse[targetSection][0];
          if (videoRev) videoRev.currentTime = frameToTime(revEndFrame);
        }, 100);

        const checkTime = () => {
          if (videoFwd.currentTime >= endTime - 0.02) {
            videoFwd.pause();
            videoFwd.currentTime = endTime;

            exitingSection.value = null; // Clear exiting state
            showContent.value = true;
            if (!initialIntroDone.value && fromSection === 0) {
              initialIntroDone.value = true;
            }
            // Delay unlocking to allow content fade-in and prevent rapid re-trigger
            setTimeout(() => {
              isScrollLocked.value = false;
            }, 500);
          } else {
            requestAnimationFrame(checkTime);
          }
        };
        requestAnimationFrame(checkTime);
      };

      const onSeekReady = () => {
        // If we are currently showing Reverse, we need to swap
        if (isReversing.value) {
          // Mark switch in progress - keeps reverse video visible until forward is ready
          videoSwitchReady.value = false;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              videoSwitchReady.value = true;
              isReversing.value = false; // Swap to Forward
              startPlayback();
            });
          });
        } else {
          // Already on Forward, just play
          startPlayback();
        }
      };

      // Ensure start position and wait for seek to complete before playing
      // If already at position, seeked won't fire - call directly
      if (Math.abs(videoFwd.currentTime - startTime) < 0.05) {
        onSeekReady();
      } else {
        videoFwd.currentTime = startTime;
        videoFwd.addEventListener('seeked', onSeekReady, { once: true });
      }
    };

    // Play video in reverse (using the reversed video file)
    const playReverse = (fromSection, targetSection) => {
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;
      if (!videoRev) return;
      if (isScrollLocked.value) return;

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

         // Pre-seek forward video for next move (delayed)
         setTimeout(() => {
            if (videoFwd) videoFwd.currentTime = targetEndTime;
         }, 100);

        const checkTime = () => {
          if (videoRev.currentTime >= revEndTime - 0.02) {
            videoRev.pause();
            videoRev.currentTime = revEndTime;

            exitingSection.value = null; // Clear exiting state
            showContent.value = true;
            // Delay unlocking to allow content fade-in and prevent rapid re-trigger
            setTimeout(() => {
              isScrollLocked.value = false;
            }, 500);
            // STAY on Reverse video - no swap back!
          } else {
            requestAnimationFrame(checkTime);
          }
        };
        requestAnimationFrame(checkTime);
      };

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
          startPlayback();
        }
      };

      // Ensure start position and wait for seek to complete before playing
      // If already at position, seeked won't fire - call directly
      if (Math.abs(videoRev.currentTime - revStartTime) < 0.05) {
        onSeekReady();
      } else {
        videoRev.currentTime = revStartTime;
        videoRev.addEventListener('seeked', onSeekReady, { once: true });
      }
    };


    // Handle touch events for mobile
    let touchStartY = 0;

    function handleWheel(e) {
      resetBounceTimer();
      e.preventDefault();
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
    }

    function handleTouchStart(e) {
      touchStartY = e.touches[0].clientY;
    }

    function handleTouchEnd(e) {
      if (isScrollLocked.value) return;

      const touchEndY = e.changedTouches[0].clientY;
      const delta = touchStartY - touchEndY;

      if (delta > 50 && currentSection.value < 4) {
        resetBounceTimer();
        const fromSection = currentSection.value;
        currentSection.value++;
        playForward(fromSection, currentSection.value);
      } else if (delta < -50 && currentSection.value > 1) {
        resetBounceTimer();
        const fromSection = currentSection.value;
        currentSection.value--;
        playReverse(fromSection, currentSection.value);
      }
    }

    const scrollToSection = (sectionIndex) => {
      if (sectionIndex === currentSection.value) return;
      if (isScrollLocked.value) return;
      const fromSection = currentSection.value;
      currentSection.value = sectionIndex;
      if (sectionIndex > fromSection) {
        playForward(fromSection, sectionIndex);
      } else {
        playReverse(fromSection, sectionIndex);
      }
    };

    const tryStart = () => {
      if (!hasStarted && videoReady.value && windowLoaded.value && imagesReady.value) {
        hasStarted = true;
        // Signal to splash that app is truly ready for interaction
        document.querySelector('.scroll-container')?.classList.add('app-ready');

        // Check if we're returning from a project page
        const returnSection = sessionStorage.getItem('returnToSection');
        const isReturning = returnSection !== null;
        let targetReturnSection = 1;
        if (isReturning) {
          sessionStorage.removeItem('returnToSection');
          targetReturnSection = parseInt(returnSection, 10);
          if (targetReturnSection < 1 || targetReturnSection > 4) targetReturnSection = 1;
          currentSection.value = targetReturnSection;
        }

        // When site becomes visible, fade in video on frame 0
        window.addEventListener('site-reveal', () => {
          videoFadedIn.value = true;
        }, { once: true });

        // When splash is fully complete, start playback
        window.addEventListener('splash-complete', () => {
          isScrollLocked.value = false;
          if (isReturning) {
            playForward(0, targetReturnSection);
          } else {
            playForward(0, 1);
          }
        }, { once: true });
      }
    };

    onMounted(() => {
      // Prevent default scroll
      document.body.style.overflow = 'hidden';

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pageshow', onPageShow);

      // Add scroll listeners - isScrollLocked flag controls whether they act
      window.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });

      // Initialize both videos
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      // Track all assets that need to load
      let videosLoaded = 0;
      let imagesLoaded = 0;
      const totalVideos = 2;
      const totalImages = projects.length;

      const checkAllAssetsLoaded = () => {
        if (imagesLoaded === totalImages) {
          imagesReady.value = true;
          siteLoaded.value = true;
          tryStart();
        }
      };

      const onVideoReady = () => {
        videosLoaded++;
        if (videosLoaded === 2) {
          console.log('Both videos loaded');
          videoReady.value = true;
          siteLoaded.value = true; // Enable UI visibility immediately
          videoFwd.currentTime = 0;
          videoRev.currentTime = frameToTime(totalFrames); // End of reverse = start of forward
          tryStart();
        }
      };

      // Preload all project images
      projects.forEach((project) => {
        if (project.logo) {
          const img = new Image();
          img.onload = () => {
            imagesLoaded++;
            checkAllAssetsLoaded();
          };
          img.onerror = () => {
            imagesLoaded++;
            checkAllAssetsLoaded();
          };
          img.src = project.logo;
        } else {
          imagesLoaded++;
          checkAllAssetsLoaded();
        }
      });

      const onWindowLoad = () => {
        windowLoaded.value = true;
        tryStart();
      };

      if (document.readyState === 'complete') {
        windowLoaded.value = true;
      } else {
        window.addEventListener('load', onWindowLoad);
      }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (videoFwd) {
        videoFwd.muted = true;
        videoFwd.playsInline = true;
        videoFwd.addEventListener('canplaythrough', onVideoReady, { once: true });
        videoFwd.load();

        // iOS: force video to start loading by briefly playing (allowed for muted videos)
        if (isIOS) {
          videoFwd.play().then(() => videoFwd.pause()).catch(() => {});
        }
      }

      if (videoRev) {
        videoRev.muted = true;
        videoRev.playsInline = true;
        videoRev.addEventListener('canplaythrough', onVideoReady, { once: true });
        videoRev.load();

        if (isIOS) {
          videoRev.play().then(() => videoRev.pause()).catch(() => {});
        }
      }

      // iOS fallback: if videos haven't loaded in 4 seconds, proceed anyway
      if (isIOS) {
        setTimeout(() => {
          if (!videoReady.value) {
            console.warn('iOS: video load timeout, proceeding');
            videoReady.value = true;
            if (videoFwd) videoFwd.currentTime = 0;
            if (videoRev) videoRev.currentTime = frameToTime(totalFrames);
            tryStart();
          }
        }, 4000);
      }
    });

    onUnmounted(() => {
      document.body.style.overflow = '';
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('load', onWindowLoad);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    });

    const menuOpen = ref(false);
    const emailView = ref(false);
    const copyButtonText = ref('Copy Address');
    const isBouncing = ref(true);
    let bounceTimer = null;

    const resetBounceTimer = () => {
      isBouncing.value = false;
      if (bounceTimer) clearTimeout(bounceTimer);
      bounceTimer = setTimeout(() => {
        isBouncing.value = true;
      }, 9000);
    };

    const toggleMenu = () => {
      resetBounceTimer();
      menuOpen.value = !menuOpen.value;
      if (!menuOpen.value) {
        // Shorter delay if in email view (fast close), else normal delay
        const delay = emailView.value ? 600 : 500;
        setTimeout(() => {
          emailView.value = false;
          copyButtonText.value = 'Copy Address';
        }, delay);
      }
    };

    const showEmail = () => {
      emailView.value = true;
    };

    const hideEmail = () => {
      emailView.value = false;
    };

    const copyEmail = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('CoryWBoris@gmail.com').then(() => {
          copyButtonText.value = 'Copied!';
          setTimeout(() => {
            copyButtonText.value = 'Copy Address';
          }, 2000);
        }).catch(err => {
          console.error('Copy failed', err);
        });
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = 'CoryWBoris@gmail.com';
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          copyButtonText.value = 'Copied!';
          setTimeout(() => {
            copyButtonText.value = 'Copy Address';
          }, 2000);
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
      }
    };

    const handleProjectClick = (project, sectionIndex) => {
      // Save current section to sessionStorage before navigating
      sessionStorage.setItem('returnToSection', sectionIndex.toString());
      window.location.href = project.link;
    };

    return {
      videoForwardRef,
      videoReverseRef,
      scrollProgress,
      currentSection,
      gradientSection,
      gradientDuration,
      gradientAngle,
      angleDuration,
      projects,
      scrollToSection,
      showContent,
      exitingSection,
      isReversing,
      videoSwitchReady,
      videoReady,
      siteLoaded,
      videoFadedIn,
      menuOpen,
      emailView,
      copyButtonText,
      toggleMenu,
      showEmail,
      hideEmail,
      copyEmail,
      handleProjectClick,
      isBouncing,
      resetBounceTimer
    };
  },

  template: `
    <div class="scroll-container" :class="{ 'site-loaded': siteLoaded }">
      <!-- Progress bar -->
      <div class="progress-bar" :style="{ width: (scrollProgress * 100) + '%' }"></div>

      <!-- Video background with CSS-interpolated gradient -->
      <div class="video-container" :data-section="gradientSection" :style="{ '--gradient-duration': gradientDuration, '--gradient-angle': gradientAngle, '--angle-duration': angleDuration }">
        <!-- Forward video -->
        <video
          ref="videoForwardRef"
          muted
          playsinline
          preload="auto"
          :class="{ 'video-active': !(isReversing && videoSwitchReady), 'video-hidden': isReversing && videoSwitchReady, 'video-ready': videoFadedIn }"
        >
          <source src="assets/Coat_Unfolding.webm" type="video/webm">
          <source src="assets/Coat_Unfolding.mp4" type="video/mp4">
        </video>
        <!-- Reverse video -->
        <video
          ref="videoReverseRef"
          muted
          playsinline
          preload="auto"
          :class="{ 'video-active': isReversing && videoSwitchReady, 'video-hidden': !(isReversing && videoSwitchReady), 'video-ready': videoFadedIn }"
        >
          <source src="assets/Coat_Unfolding_Reverse.webm" type="video/webm">
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
      <div class="menu-overlay" :class="{ active: menuOpen, 'email-mode': emailView }">
        <div class="menu-content" :class="{ 'email-mode': emailView }">
          <nav class="menu-nav" :class="{ hidden: emailView }">
            <a href="#about">About Me</a>
            <a href="https://github.com/CoryWBoris" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://www.linkedin.com/in/coryboris" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="#" @click.prevent="showEmail">Email</a>
          </nav>

          <div class="email-view" :class="{ active: emailView }">
             <button class="menu-back-btn" @click="hideEmail">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M19 12H5M12 19l-7-7 7-7"/>
               </svg>
               Back
             </button>
             <a href="mailto:CoryWBoris@gmail.com" class="email-link">CoryWBoris@gmail.com</a>
             <button class="copy-btn" @click="copyEmail">{{ copyButtonText }}</button>
          </div>
        </div>
      </div>

      <!-- Header -->
      <div class="header-title">
        <h1>Cory Boris</h1>
      </div>

      <!-- Content overlay -->
      <div class="content-overlay">
        <div
          v-for="(project, index) in projects"
          :key="index"
          class="section-content"
          :class="['section-' + (index + 1), { active: currentSection === index + 1 && showContent, exiting: exitingSection === index + 1 }]"
        >
          <div class="project-link" @click="handleProjectClick(project, index + 1)">
            <img v-if="project.logo" :src="project.logo" :alt="project.title" class="project-logo">
            <h2 v-else>{{ project.title }}</h2>
            <div class="project-tooltip">{{ project.description }}</div>
          </div>
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
      <div class="scroll-indicator" :class="{ hidden: scrollProgress > 0.05, bouncing: isBouncing }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        <div>Scroll</div>
      </div>

    </div>
  `
};

createApp(App).mount('#app');