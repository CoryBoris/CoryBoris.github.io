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
    const siteLoaded = ref(false);
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

    // Track current animation to prevent race conditions
    let currentAnimationId = null;
    // Track CSS transition listener to remove if new animation starts
    let currentTransitionListener = null;
    let currentTransitionElement = null;

    // Convert frame number to timestamp
    // Add tiny epsilon to land solidly within the target frame, avoiding boundary rounding issues
    const frameToTime = (frame) => (frame / frameRate) + 0.001;

    const forceSettleToStableState = () => {
      if (needsTapToStart.value) return;

      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      // Ensure we are not stuck mid-transition (iOS/Chrome throttles RAF when backgrounded)
      isScrollLocked.value = false;
      exitingSection.value = null;
      showContent.value = true;
      videoSwitchReady.value = true;

      // Snap the currently visible video to the correct freeze frame for currentSection
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

      // Mark both videos as "ready" again for any CSS that depends on these flags
      forwardVideoReady.value = true;
      reverseVideoReady.value = true;
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        forceSettleToStableState();
      }
    };

    const onPageShow = () => {
      forceSettleToStableState();
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
        externalLink: 'https://www.newsway.ai',
        description: 'Newsway News Summary is a real-time news summary system utilizing Python RSS parsing via Google Gemini API to summarize breaking news every ten minutes at only the cost of the compute to run which is a simple pipeline script. Utilizing Gemini’s innate Sentiment Analysis combined with a backend promp, I can assign optimism scores to article summaries and as a result articles can be sorted by their optimism scores. Even as an approximate measure, it has proved to reliably separate out events, especially at the extremes.'
      },
      {
        number: '02',
        title: 'GifSig',
        logo: 'assets/gifsig_project.png',
        link: 'gifsig.html',
        externalLink: 'https://www.gifsig.com',
        description: 'GifSig High Fiedlity Loop-Once Signature Generator is just that. It is a faster way for someone to paste their actual dynamically drawn signature into an email, with the assurance that it only will play one time and hold at the end. This site was fun to make but also I find myself just scribbling on it a lot for the fun of scribbling. Because the brush implementation is responsive to drawing speed, making realistic looking strokes actually feels natural. This was made with javascript, and Vercel for the hosting and database, and resend for the account email communications and password resets.'
      },
      {
        number: '03',
        title: 'Nadette',
        logo: 'assets/nadette_project.png',
        link: 'nadette.html',
        externalLink: 'https://github.com/nadette-agent/nadette-adjoint',
        description: 'Nadette Ai is a virtual assistant powered by Google Gemini, and it can be called and spoken to with natural language and can execute specific tasks such as multiple emails and texts to different people, making calendar events on both google calendar and icalendar, and the ability to hang up after speaking with the assurance that your last spoken requests are captured, something OpenAi doesn\'t yet do in their call feature for their latest llms. Made with Python, Bash, and Html for the email formatting.'
      },
      {
        number: '04',
        title: 'TrueAutoColor',
        logo: 'assets/TrueAutoColor_project.JPG',
        link: 'trueautocolor.html',
        externalLink: 'https://coryboris.gumroad.com/l/TrueAutoColor',
        description: 'TrueAutoColor is a desktop App made with Electron which interacts with Ableton’s native Api creating real-time track and clip color changes from track name changes within Ableton Live. The reason for this was to solve a pain point for a product which does this exact thing, but only existing as a plugin, taking away precious cpu from music making. 55+ copies sold and counting!'
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

        // FRAME-BY-FRAME SCRUBBING: Instead of play(), animate currentTime directly
        const duration = actualDuration * 1000; // in ms
        const animStartTime = performance.now();

        // PRE-BUFFER reverse video while forward plays
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

        const animateFrame = () => {
          const elapsed = performance.now() - animStartTime;
          const progress = Math.min(elapsed / duration, 1);

          // Interpolate currentTime from startTime to endTime
          const currentTime = startTime + (progress * (endTime - startTime));
          videoFwd.currentTime = currentTime;

          if (progress < 1) {
            currentAnimationId = requestAnimationFrame(animateFrame);
          } else {
            // Animation complete - set final frame
            currentAnimationId = null;
            videoFwd.currentTime = endTime;
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
          }
        };
        currentAnimationId = requestAnimationFrame(animateFrame);
      };

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

      // Check if we're already at the correct position (within 0.1s tolerance)
      const alreadyAtPosition = Math.abs(videoFwd.currentTime - startTime) < 0.1;

      if (alreadyAtPosition && !isReversing.value) {
        // Already at position - wait one frame for decoder to be ready
        requestAnimationFrame(() => onSeekReady());
      } else {
        // Need to seek - wait for seek + one frame
        videoFwd.currentTime = startTime;
        videoFwd.addEventListener('seeked', () => {
          requestAnimationFrame(() => onSeekReady());
        }, { once: true });
      }
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

        // FRAME-BY-FRAME SCRUBBING: Instead of play(), animate currentTime directly
        const duration = actualDuration * 1000; // in ms
        const animStartTime = performance.now();

        // Pre-buffer forward video for next transition
        setTimeout(() => {
            forwardVideoReady.value = false;
            forwardTargetTime = targetEndTime;
            videoFwd.currentTime = targetEndTime;
            videoFwd.addEventListener('seeked', () => {
              forwardVideoReady.value = true;
            }, { once: true });
        }, 100);

        const animateFrame = () => {
          const elapsed = performance.now() - animStartTime;
          const progress = Math.min(elapsed / duration, 1);

          // Interpolate currentTime from revStartTime to revEndTime
          const currentTime = revStartTime + (progress * (revEndTime - revStartTime));
          videoRev.currentTime = currentTime;

          if (progress < 1) {
            currentAnimationId = requestAnimationFrame(animateFrame);
          } else {
            // Animation complete - set final frame
            currentAnimationId = null;
            videoRev.currentTime = revEndTime;
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
          }
        };
        currentAnimationId = requestAnimationFrame(animateFrame);
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
          // Already in reverse mode, just play (no visibility change needed)
          startPlayback();
        }
      };

      // Check if we're already at the correct position (within 0.1s tolerance)
      const alreadyAtPosition = Math.abs(videoRev.currentTime - revStartTime) < 0.1;

      if (alreadyAtPosition && isReversing.value) {
        // Already at position - wait one frame for decoder to be ready
        requestAnimationFrame(() => onSeekReady());
      } else {
        // Need to seek - wait for seek + one frame
        videoRev.currentTime = revStartTime;
        videoRev.addEventListener('seeked', () => {
          requestAnimationFrame(() => onSeekReady());
        }, { once: true });
      }
    };

    // Handle wheel events for section-by-section scrolling
    const handleWheel = (e) => {
      resetBounceTimer();
      if (needsTapToStart.value) {
        e.preventDefault();
        return; // Block scroll if tap-to-start is active
      }
      if (isScrollLocked.value) return; // Allow default scroll (for overlay), skip custom nav

      e.preventDefault(); // Prevent default only when handling custom section nav

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

      // iOS/Chrome: when the tab/app is backgrounded, RAF loops can stop mid-transition.
      // On resume, force-settle back to a stable state so the page is interactive.
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pageshow', onPageShow);

      // Add wheel listener with passive: false to allow preventDefault
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
        if (videosLoaded === totalVideos && imagesLoaded === totalImages) {
          siteLoaded.value = true;
        }
      };

      const onVideoReady = () => {
        videosLoaded++;
        if (videosLoaded === 2) {
          videoReady.value = true;
          tryStart();
        }
        checkAllAssetsLoaded();
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    });

    const menuOpen = ref(false);
    const menuClosing = ref(false);
    const emailView = ref(false);
    const copyButtonText = ref('Copy Address');
    const isBouncing = ref(true);
    let bounceTimer = null;
    const projectOverlay = ref(null); // Currently displayed project for overlay
    const overlayState = ref('closed'); // 'closed', 'opening', 'open', 'closing'
    const expandOrigin = ref({ x: 0, y: 0, width: 0, height: 0, logo: '' }); // Logo click position for expand origin

    const resetBounceTimer = () => {
      isBouncing.value = false;
      if (bounceTimer) clearTimeout(bounceTimer);
      bounceTimer = setTimeout(() => {
        isBouncing.value = true;
      }, 9000);
    };

    const toggleMenu = () => {
      resetBounceTimer();
      if (menuOpen.value) {
        // Menu is closing - set closing state and wait for animation
        menuClosing.value = true;
        menuOpen.value = false;

        // If in email view, we close faster (0.5s transition in CSS)
        // If in main menu, we wait for stagger (1.6s)
        const closeDuration = emailView.value ? 600 : 1600;

        setTimeout(() => {
          menuClosing.value = false;
          // Reset email view
          emailView.value = false;
          copyButtonText.value = 'Copy Address';
        }, closeDuration);
      } else {
        menuOpen.value = true;
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

    const openProjectOverlay = (project, event) => {
      // Get the logo element's position for the expand animation
      const logoEl = event.currentTarget.querySelector('.project-logo');
      if (logoEl) {
        const rect = logoEl.getBoundingClientRect();
        expandOrigin.value = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          logo: project.logo
        };
      }

      isScrollLocked.value = true;
      projectOverlay.value = project;
      overlayState.value = 'opening';

      // Allow a frame for render before starting animation if needed,
      // but CSS keyframes handle it.
      // We just need to switch to 'open' after animation.
      setTimeout(() => {
        overlayState.value = 'open';
      }, 470);
    };

    const closeProjectOverlay = () => {
      if (overlayState.value === 'closing') return;

      const performClose = () => {
        overlayState.value = 'closing';
        setTimeout(() => {
          projectOverlay.value = null;
          overlayState.value = 'closed';
          isScrollLocked.value = false;
        }, 650);
      };

      // Scroll to top before closing so the minimize animation aligns with the logo
      const contentEl = document.querySelector('.project-detail-content.open');
      if (contentEl && contentEl.scrollTop > 5) {
        contentEl.scrollTo({ top: 0, behavior: 'smooth' });

        // Wait for scroll to reach top (with timeout safety)
        let checkCount = 0;
        const checkScroll = () => {
          // Stop if at top or after ~60 frames (approx 1s)
          if (contentEl.scrollTop <= 2 || checkCount > 60) {
            contentEl.scrollTop = 0;
            performClose();
          } else {
            checkCount++;
            requestAnimationFrame(checkScroll);
          }
        };
        requestAnimationFrame(checkScroll);
      } else {
        performClose();
      }
    };

    const expandStyle = computed(() => {
      return {
        '--origin-x': expandOrigin.value.x + 'px',
        '--origin-y': expandOrigin.value.y + 'px',
        '--origin-width': expandOrigin.value.width + 'px',
        '--origin-height': expandOrigin.value.height + 'px'
      };
    });

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
      siteLoaded,
      needsTapToStart,
      handleTapToStart,
      initialFadeComplete,
      menuOpen,
      menuClosing,
      toggleMenu,
      showEmail,
      hideEmail,
      copyEmail,
      copyButtonText,
      emailView,
      projectOverlay,
      openProjectOverlay,
      closeProjectOverlay,
      overlayState,
      expandOrigin,
      expandStyle,
      isBouncing,
      resetBounceTimer
    };
  },

  template: `
    <div class="scroll-container" :class="{ 'site-loaded': siteLoaded }">
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
          <div class="project-link" @click="openProjectOverlay(project, $event)">
            <img v-if="project.logo" :src="project.logo" :alt="project.title" class="project-logo">
            <h2 v-else>{{ project.title }}</h2>
          </div>
        </div>
      </div>

      <!-- Project Detail Overlay (Mobile) -->
      <div
        v-if="projectOverlay"
        class="project-detail-overlay"
        :class="overlayState"
        @click.self="closeProjectOverlay"
      >
        <!-- The Content Card IS the unified matte -->
        <div
          class="project-detail-content"
          :class="overlayState"
          :style="expandStyle"
        >
          <!-- Single Animating Logo - stays visible throughout, no swap -->
          <img
            v-if="expandOrigin.logo"
            :src="expandOrigin.logo"
            class="animating-logo"
            :class="overlayState"
          >

          <!-- Content (fades in after open start) - logo is the animating-logo above -->
          <button class="project-detail-close" @click="closeProjectOverlay">&times;</button>
          <div class="content-inner" :class="{ visible: overlayState === 'open' }">
            <!-- Logo space placeholder to maintain layout -->
            <div class="project-detail-logo-spacer"></div>
            <h2 class="project-detail-title">{{ projectOverlay.title }}</h2>
            <p class="project-detail-description">{{ projectOverlay.description }}</p>
            <a :href="projectOverlay.externalLink" class="project-detail-link" target="_blank" rel="noopener noreferrer">View Project</a>
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
      <div class="scroll-indicator" :class="{ hidden: needsTapToStart || scrollProgress > 0.05, bouncing: isBouncing }">
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
