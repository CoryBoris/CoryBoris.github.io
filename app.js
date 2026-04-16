const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

// Clean up stale service worker from previous approach
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(r) { r.unregister(); });
  });
}

const _t0 = performance.now();
const _log = (msg) => console.log(`[${(performance.now() - _t0).toFixed(0)}ms] ${msg}`);

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

    // Wake suspended video decoders (browsers suspend when tab is backgrounded)
    // A play→pause cycle forces the decoder to reactivate and render the current frame
    const wakeVideo = (video) => {
      if (!video) return;
      try {
        const p = video.play();
        if (p && p.then) {
          p.then(() => video.pause()).catch(() => {});
        } else {
          video.pause();
        }
      } catch (_) {}
    };

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

      // Wake suspended decoders so the frame actually renders
      wakeVideo(videoFwd);
      wakeVideo(videoRev);
    };

    const onVisibilityChange = () => {
      if (!document.hidden && hasStarted) {
        forceSettleToStableState();
        // Restore scroll lock if an overlay was open when we left
        if (isScrollLocked.value) {
          lockBodyScroll();
        }
      }
    };

    const onPageShow = (e) => {
      if (!hasStarted) return;
      forceSettleToStableState();
      if (isScrollLocked.value) {
        lockBodyScroll();
      }
    };

    // Gradient section is now controlled via data-section attribute on .video-container
    // CSS handles the smooth color interpolation via @property

    // Project content for each section
    const projects = [
      {
        number: '01',
        title: 'Newsway',
        logo: 'assets/newsway_project.webp',
        link: 'newsway.html',
        externalLink: 'https://www.newsway.ai',
        description: 'Newsway News Summary is a real-time news summary system utilizing Python RSS parsing via Google Gemini API to summarize breaking news every ten minutes at only the cost of the compute to run which is a simple pipeline script. Utilizing Gemini\'s innate Sentiment Analysis combined with a backend prompt, I can assign optimism scores to article summaries and as a result articles can be sorted by their optimism scores. Even as an approximate measure, it has proved to reliably separate out events, especially at the extremes.'
      },
      {
        number: '02',
        title: 'GifSig',
        logo: 'assets/gifsig_project.webp',
        link: 'gifsig.html',
        externalLink: 'https://www.gifsig.com',
        description: 'GifSig High Fidelity Loop-Once Signature Generator is just that. It is a faster way for someone to paste their actual dynamically drawn signature into an email, with the assurance that it only will play one time and hold at the end. This site was fun to make but also I find myself just scribbling on it a lot for the fun of scribbling. Because the brush implementation is responsive to drawing speed, making realistic looking strokes actually feels natural. This was made with javascript, and Vercel for the hosting and database, and resend for the account email communications and password resets.'
      },
      {
        number: '03',
        title: 'iDrawMap',
        logo: 'assets/idrawmap_project.png',
        link: 'idrawmap.html',
        externalLink: 'https://www.idrawmap.com',
        description: 'iDrawMap is a draw-to-search map app that lets you find locations strictly within any polygon you draw, giving you granular proximity search that typical radius-based tools can\'t. It also features three- and four-stop direction routing via Google Maps deep links, with full route details encoded into shareable URLs. Built on OpenStreetMap with Leaflet.js, the Overpass API, and the Gemini API on the backend. No account needed to use it.'
      },
      {
        number: '04',
        title: 'Nadette',
        logo: 'assets/nadette_project.webp',
        link: 'nadette.html',
        externalLink: 'https://github.com/nadette-agent/nadette-adjoint',
        description: 'Nadette Ai is a virtual assistant powered by Google Gemini, and it can be called and spoken to with natural language and can execute specific tasks such as multiple emails and texts to different people, making calendar events on both google calendar and icalendar, and the ability to hang up after speaking with the assurance that your last spoken requests are captured, something OpenAi doesn\'t yet do in their call feature for their latest llms. Made with Python, Bash, and Html for the email formatting.'
      },
      {
        number: '05',
        title: 'TrueAutoColor',
        logo: 'assets/TrueAutoColor_project.webp',
        link: 'trueautocolor.html',
        externalLink: 'https://coryboris.gumroad.com/l/TrueAutoColor',
        description: 'TrueAutoColor is a desktop App made with Electron which interacts with Ableton\'s native Api creating real-time track and clip color changes from track name changes within Ableton Live. The reason for this was to solve a pain point for a product which does this exact thing, but only existing as a plugin, taking away precious cpu from music making. 55+ copies sold and counting!'
      }
    ];

    // Section timing using FRAME NUMBERS for accuracy
    // [startFrame, endFrame] - endFrame is the freeze frame
    const sectionFrames = {
      0: [0, 0],        // virtual section 0 for initial state (frame 0)
      1: [0, 23],       // frames 0-23 (0-1s), freeze at frame 23
      2: [23, 55],      // frames 23-55 (1-2.3s), freeze at frame 55
      3: [55, 69],      // frames 55-69 (2.3-2.875s), freeze at frame 69
      4: [69, 168],     // frames 69-168 (2.875-7s), freeze at frame 168
      5: [168, 240]     // frames 168-240 (7-10s), freeze at frame 240
    };

    // Reverse video: frame N in forward = frame (totalFrames - N) in reverse
    // For frame-perfect alignment, reverse freeze frames must exactly match forward freeze frames
    // Forward freezes at: 23, 55, 69, 168, 240 → Reverse freezes at: 217, 185, 171, 72, 0
    const sectionFramesReverse = {
      1: [totalFrames - 24, totalFrames],         // frames 217-240, freeze at 217 (matches fwd frame 23)
      2: [totalFrames - 56, totalFrames - 24],    // frames 185-217, freeze at 185 (matches fwd frame 55)
      3: [totalFrames - 70, totalFrames - 56],    // frames 171-185, freeze at 171 (matches fwd frame 69)
      4: [totalFrames - 169, totalFrames - 70],   // frames 72-171, freeze at 72 (matches fwd frame 168)
      5: [totalFrames - 240, totalFrames - 169]   // frames 0-72, freeze at 0 (matches fwd frame 240)
    };

    // Play video forward (supports multi-section jumps)
    const playForward = (fromSection, targetSection) => {
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;
      if (!videoFwd) return;
      if (isScrollLocked.value) return;

      _log(`playForward(${fromSection}→${targetSection}) readyState=${videoFwd.readyState} buffered=${videoFwd.buffered.length ? videoFwd.buffered.end(0).toFixed(2) : 'none'}/${videoFwd.duration?.toFixed(2)}`);
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

      // Gradient duration matches exact video segment duration
      const actualDuration = segmentLength / playbackRate;

      const startPlayback = () => {
        _log(`playForward: startPlayback (currentTime=${videoFwd.currentTime.toFixed(3)}, target endTime=${endTime.toFixed(3)}, rate=${playbackRate}, gradientDur=${actualDuration.toFixed(3)}s)`);
        // Sync gradient with video: set duration, then trigger color change on next frame
        gradientDuration.value = `${actualDuration}s`;
        // Double-RAF: first paints new duration, second triggers color change
        requestAnimationFrame(() => { requestAnimationFrame(() => { gradientSection.value = targetSection; }); });
        // Angle rotation: 135→180 at start, 180→135 near end
        gradientAngle.value = '180deg';
        const angleReturnMs = Math.max(0, (actualDuration * 1000) - 300);
        setTimeout(() => { gradientAngle.value = '135deg'; }, angleReturnMs);
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
            // Brief unlock delay for content fade-in
            setTimeout(() => {
              isScrollLocked.value = false;
            }, 200);
          } else {
            requestAnimationFrame(checkTime);
          }
        };
        requestAnimationFrame(checkTime);
      };

      const onSeekReady = () => {
        // If we are currently showing Reverse, we need to swap
        if (isReversing.value) {
          videoSwitchReady.value = false;
          requestAnimationFrame(() => {
            videoSwitchReady.value = true;
            isReversing.value = false; // Swap to Forward
            startPlayback();
          });
        } else {
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

      _log(`playReverse(${fromSection}→${targetSection}) readyState=${videoRev.readyState} buffered=${videoRev.buffered.length ? videoRev.buffered.end(0).toFixed(2) : 'none'}/${videoRev.duration?.toFixed(2)}`);
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

      // Gradient duration matches exact video segment duration
      const actualDuration = segmentLength / playbackRate;

      const startPlayback = () => {
         _log(`playReverse: startPlayback (currentTime=${videoRev.currentTime.toFixed(3)}, target revEndTime=${revEndTime.toFixed(3)}, rate=${playbackRate}, gradientDur=${actualDuration.toFixed(3)}s)`);
         // Sync gradient with video: set duration, then trigger color change on next frame
         gradientDuration.value = `${actualDuration}s`;
         // Double-RAF: first paints new duration, second triggers color change
         requestAnimationFrame(() => { requestAnimationFrame(() => { gradientSection.value = targetSection; }); });
         // Angle rotation: 135→180 at start, 180→135 near end
         gradientAngle.value = '180deg';
         const angleReturnMs = Math.max(0, (actualDuration * 1000) - 300);
         setTimeout(() => { gradientAngle.value = '135deg'; }, angleReturnMs);
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
            // Brief unlock delay for content fade-in
            setTimeout(() => {
              isScrollLocked.value = false;
            }, 200);
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
          videoSwitchReady.value = false;
          requestAnimationFrame(() => {
            videoSwitchReady.value = true;
            isReversing.value = true; // Swap to Reverse
            startPlayback();
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
      e.preventDefault();
      if (isScrollLocked.value) return;

      // Only reset bounce timer when actually scrolling (not blocked)
      resetBounceTimer();
      const delta = e.deltaY;
      if (delta > 20 && currentSection.value < 5) {
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

      if (delta > 50 && currentSection.value < 5) {
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
      _log(`tryStart: videoReady=${videoReady.value} windowLoaded=${windowLoaded.value} imagesReady=${imagesReady.value} hasStarted=${hasStarted}`);
      if (!hasStarted && videoReady.value && windowLoaded.value && imagesReady.value) {
        hasStarted = true;
        _log('tryStart: ALL CONDITIONS MET — signaling app-ready');
        // Signal to splash that app is truly ready for interaction
        document.querySelector('.scroll-container')?.classList.add('app-ready');
        window.dispatchEvent(new CustomEvent('app-ready'));

        // When site becomes visible, fade in video on frame 0
        window.addEventListener('site-reveal', () => {
          _log('EVENT: site-reveal received → fading in video');
          videoFadedIn.value = true;
        }, { once: true });

        // When splash is fully complete, start playback
        window.addEventListener('splash-complete', () => {
          _log('EVENT: splash-complete received → unlocking + playForward(0,1)');
          isScrollLocked.value = false;
          playForward(0, 1);
        }, { once: true });
      }
    };

    onMounted(() => {
      // Prevent default scroll
      document.body.style.overflow = 'hidden';

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pageshow', onPageShow);
      window.addEventListener('focus', onVisibilityChange);

      // Add scroll listeners - isScrollLocked flag controls whether they act
      window.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });

      // Initialize both videos
      const videoFwd = videoForwardRef.value;
      const videoRev = videoReverseRef.value;

      // Track all assets that need to load
      let imagesLoaded = 0;
      const totalImages = projects.length;

      const checkAllAssetsLoaded = () => {
        if (imagesLoaded === totalImages) {
          imagesReady.value = true;
          siteLoaded.value = true;
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

      // Detect Safari/WebKit — they need HEVC alpha MOV; everyone else uses VP9 WebM
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
                     || (navigator.userAgent.includes('AppleWebKit') && !navigator.userAgent.includes('Chrome'));
      const ext = isSafari ? 'mov' : 'webm';
      _log(`using .${ext} sources (Safari=${isSafari})`);

      // Fully download video into memory via fetch, then assign as blob URL.
      // This guarantees 100% buffered before playback — no streaming stalls.
      const preloadVideoBlob = (video, url, label) => {
        _log(`${label}: fetch start → ${url}`);
        return fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
            _log(`${label}: fetch response received, reading blob...`);
            return r.blob();
          })
          .then(blob => {
            _log(`${label}: blob ready (${(blob.size / 1024 / 1024).toFixed(1)} MB), assigning to video`);
            const blobUrl = URL.createObjectURL(blob);
            video.src = blobUrl;
            video.muted = true;
            video.playsInline = true;
            // Wait for browser to fully parse blob and have enough data to play without stalling
            return new Promise((resolve) => {
              video.addEventListener('loadeddata', () => {
                _log(`${label}: loadeddata (readyState=${video.readyState}, duration=${video.duration})`);
              }, { once: true });
              video.addEventListener('canplaythrough', () => {
                _log(`${label}: canplaythrough (readyState=${video.readyState}, duration=${video.duration})`);
                // Prime the decoder — forces Safari HEVC to actually decode a frame
                const p = video.play();
                if (p && p.then) {
                  p.then(() => {
                    video.pause();
                    video.currentTime = 0;
                    _log(`${label}: decoder primed`);
                    resolve();
                  }).catch(() => {
                    _log(`${label}: decoder prime failed (autoplay blocked?), proceeding`);
                    resolve();
                  });
                } else {
                  video.pause();
                  video.currentTime = 0;
                  resolve();
                }
              }, { once: true });
              video.load();
            });
          });
      };

      Promise.all([
        preloadVideoBlob(videoFwd, `assets/Coat_Unfolding.${ext}`, 'Forward video'),
        preloadVideoBlob(videoRev, `assets/Coat_Unfolding_Reverse.${ext}`, 'Reverse video')
      ]).then(() => {
        _log('Both videos fully loaded into memory');
        videoReady.value = true;
        siteLoaded.value = true;
        videoFwd.currentTime = 0;
        videoRev.currentTime = frameToTime(totalFrames);
        _log(`videoReady=${videoReady.value} windowLoaded=${windowLoaded.value} imagesReady=${imagesReady.value}`);
        tryStart();
      }).catch(err => {
        _log(`Video preload FAILED: ${err}`);
        console.error('Desktop: Video preload failed', err);
        // Fallback: proceed anyway so the site isn't permanently stuck
        videoReady.value = true;
        siteLoaded.value = true;
        tryStart();
      });
    });

    onUnmounted(() => {
      document.body.style.overflow = '';
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('load', onWindowLoad);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onVisibilityChange);
    });

    const menuOpen = ref(false);
    const emailView = ref(false);
    const cvView = ref(false);
    const cvOverlayOpen = ref(false);
    const cvPdfReady = ref(true);
    const cvPdfUrl = ref('');
    const copyButtonText = ref('Copy Address');
    const isBouncing = ref(true);
    let bounceTimer = null;
    const projectOverlay = ref(null); // Currently displayed project for overlay
    const overlayState = ref('closed'); // 'closed', 'opening', 'open', 'closing'
    const expandOrigin = ref({ x: 0, y: 0, width: 0, height: 0, logo: '' }); // Logo click position for expand origin
    const targetHeight = ref(500); // Calculated target height for overlay

    const resetBounceTimer = () => {
      isBouncing.value = false;
      if (bounceTimer) clearTimeout(bounceTimer);
      bounceTimer = setTimeout(() => {
        isBouncing.value = true;
      }, 9000);
    };

    const lockBodyScroll = () => {
      document.body.style.overflow = 'hidden';
    };

    const unlockBodyScroll = () => {
      document.body.style.overflow = '';
    };

    const toggleMenu = () => {
      // Don't reset bounce timer here - only actual scrolling should reset it
      // If CV overlay is open, close everything
      if (cvOverlayOpen.value) {
        cvOverlayOpen.value = false;
        menuOpen.value = false;
        setTimeout(() => {
          emailView.value = false;
          cvView.value = false;
          copyButtonText.value = 'Copy Address';
          unlockBodyScroll();
          isScrollLocked.value = false;
        }, 300);
        return;
      }

      if (menuOpen.value) {
        menuOpen.value = false;
        // Shorter delay if in email/cv view (fast close), else normal delay (halved)
        const delay = (emailView.value || cvView.value) ? 300 : 400;
        setTimeout(() => {
          emailView.value = false;
          cvView.value = false;
          copyButtonText.value = 'Copy Address';
          unlockBodyScroll();
          isScrollLocked.value = false;
        }, delay);
      } else {
        menuOpen.value = true;
        lockBodyScroll();
        isScrollLocked.value = true;
      }
    };

    const showEmail = () => {
      emailView.value = true;
    };

    const hideEmail = () => {
      emailView.value = false;
    };

    const showCV = () => {
      cvView.value = true;
    };

    const hideCV = () => {
      cvView.value = false;
    };


    const openCVOverlay = () => {
      cvOverlayOpen.value = true;
      menuOpen.value = false;
      // Keep scroll locked
      lockBodyScroll();
      isScrollLocked.value = true;
      // Reset menu states after close animation
      setTimeout(() => {
        emailView.value = false;
        cvView.value = false;
      }, 250);
    };

    const returningFromCV = ref(false);

    const closeCVOverlay = () => {
      cvOverlayOpen.value = false;
      // Return to hamburger menu instantly (no animation)
      returningFromCV.value = true;
      menuOpen.value = true;
      // Keep scroll locked (going back to menu)
      lockBodyScroll();
      isScrollLocked.value = true;
      // Reset flag after menu is shown
      setTimeout(() => {
        returningFromCV.value = false;
      }, 50);
    };

    // Close CV overlay and menu entirely, return to body
    const closeAllOverlays = () => {
      cvOverlayOpen.value = false;
      menuOpen.value = false;
      // Fast close since coming from CV
      setTimeout(() => {
        emailView.value = false;
        cvView.value = false;
        copyButtonText.value = 'Copy Address';
        unlockBodyScroll();
        isScrollLocked.value = false;
      }, 300);
    };

    const downloadCV = () => {
      const link = document.createElement('a');
      link.href = cvPdfUrl.value || 'assets/Cory Boris Curriculum Vitae.pdf';
      link.download = 'Cory Boris Curriculum Vitae.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const downloadDocx = () => {
      const link = document.createElement('a');
      link.href = 'assets/Cory Boris Curriculum Vitae.docx';
      link.download = 'Cory Boris Curriculum Vitae.docx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const copyEmail = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('CoryBoris@CoryBoris.com').then(() => {
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
        textArea.value = 'CoryBoris@CoryBoris.com';
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

    // Project overlay functions
    let openOverlayToken = 0;
    let pendingOpenAnimations = 0;
    let openOverlayFallbackTimer = null;
    let closeOverlayToken = 0;
    let pendingCloseAnimations = 0;
    let closeOverlayFallbackTimer = null;

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

      // Calculate target height based on content
      // Logo area: 1.5rem (24px) top + 120px logo + 1rem (16px) bottom margin = 160px
      // Title: ~45px, Description: estimate based on character count, Button: ~60px, Padding: ~48px
      const descLength = project.description ? project.description.length : 0;
      const descLines = Math.ceil(descLength / 55); // ~55 chars per line at 600px width
      const descHeight = descLines * 28; // ~28px per line
      const calculatedHeight = 160 + 45 + descHeight + 60 + 48;
      // Clamp between 400 and 80vh
      const maxVh = window.innerHeight * 0.8;
      targetHeight.value = Math.min(Math.max(calculatedHeight, 400), maxVh);

      isScrollLocked.value = true;
      projectOverlay.value = project;
      overlayState.value = 'opening';

      openOverlayToken++;
      const token = openOverlayToken;
      pendingOpenAnimations = expandOrigin.value.logo ? 2 : 1;

      if (openOverlayFallbackTimer) clearTimeout(openOverlayFallbackTimer);
      openOverlayFallbackTimer = setTimeout(() => {
        if (token !== openOverlayToken) return;
        if (overlayState.value !== 'opening') return;
        overlayState.value = 'open';
      }, 950);
    };

    const finishOneOpenAnimation = (token) => {
      if (token !== openOverlayToken) return;
      if (overlayState.value !== 'opening') return;

      pendingOpenAnimations = Math.max(0, pendingOpenAnimations - 1);
      if (pendingOpenAnimations !== 0) return;

      if (openOverlayFallbackTimer) {
        clearTimeout(openOverlayFallbackTimer);
        openOverlayFallbackTimer = null;
      }
      overlayState.value = 'open';
    };

    const finishOneCloseAnimation = (token) => {
      if (token !== closeOverlayToken) return;
      if (overlayState.value !== 'closing') return;

      pendingCloseAnimations = Math.max(0, pendingCloseAnimations - 1);
      if (pendingCloseAnimations !== 0) return;

      if (closeOverlayFallbackTimer) {
        clearTimeout(closeOverlayFallbackTimer);
        closeOverlayFallbackTimer = null;
      }

      projectOverlay.value = null;
      overlayState.value = 'closed';
      isScrollLocked.value = false;
    };

    const onProjectDetailAnimationEnd = (event) => {
      if (overlayState.value === 'opening' && event.animationName === 'expandMatte') {
        finishOneOpenAnimation(openOverlayToken);
        return;
      }
      if (overlayState.value === 'closing' && event.animationName === 'collapseMatte') {
        finishOneCloseAnimation(closeOverlayToken);
      }
    };

    const onAnimatingLogoAnimationEnd = (event) => {
      if (overlayState.value === 'opening' && event.animationName === 'logoPopIntoPlace') {
        finishOneOpenAnimation(openOverlayToken);
        return;
      }
      if (overlayState.value === 'closing' && event.animationName === 'logoPopBack') {
        finishOneCloseAnimation(closeOverlayToken);
      }
    };

    const closeProjectOverlay = () => {
      if (overlayState.value === 'closing') return;

      const performClose = () => {
        overlayState.value = 'closing';

        closeOverlayToken++;
        const token = closeOverlayToken;
        pendingCloseAnimations = expandOrigin.value.logo ? 2 : 1;

        if (closeOverlayFallbackTimer) clearTimeout(closeOverlayFallbackTimer);
        closeOverlayFallbackTimer = setTimeout(() => {
          if (token !== closeOverlayToken) return;
          if (overlayState.value !== 'closing') return;
          projectOverlay.value = null;
          overlayState.value = 'closed';
          isScrollLocked.value = false;
        }, 950);
      };

      // Scroll to top before closing so the minimize animation aligns with the logo
      const contentEl = document.querySelector('.project-detail-content.open');
      if (contentEl && contentEl.scrollTop > 5) {
        contentEl.scrollTo({ top: 0, behavior: 'smooth' });

        let checkCount = 0;
        const checkScroll = () => {
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
        '--origin-height': expandOrigin.value.height + 'px',
        '--target-height': targetHeight.value + 'px'
      };
    });

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
      cvView,
      cvOverlayOpen,
      cvPdfReady,
      cvPdfUrl,
      returningFromCV,
      copyButtonText,
      toggleMenu,
      showEmail,
      hideEmail,
      showCV,
      hideCV,
      openCVOverlay,
      closeCVOverlay,
      closeAllOverlays,
      downloadCV,
      downloadDocx,
      copyEmail,
      projectOverlay,
      openProjectOverlay,
      closeProjectOverlay,
      overlayState,
      onProjectDetailAnimationEnd,
      onAnimatingLogoAnimationEnd,
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
      <div class="video-container" :data-section="gradientSection" :style="{ '--gradient-duration': gradientDuration, '--gradient-angle': gradientAngle, '--angle-duration': angleDuration }">
        <!-- Forward video -->
        <video
          ref="videoForwardRef"
          muted
          playsinline
          preload="auto"
          :class="{ 'video-active': !(isReversing && videoSwitchReady), 'video-hidden': isReversing && videoSwitchReady, 'video-ready': videoFadedIn }"
        ></video>
        <!-- Reverse video -->
        <video
          ref="videoReverseRef"
          muted
          playsinline
          preload="auto"
          :class="{ 'video-active': isReversing && videoSwitchReady, 'video-hidden': !(isReversing && videoSwitchReady), 'video-ready': videoFadedIn }"
        ></video>
      </div>

      <!-- Hamburger Menu Button -->
      <button class="hamburger-btn" :class="{ active: menuOpen || cvOverlayOpen }" @click="toggleMenu">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <!-- Menu Overlay -->
      <div class="menu-overlay" :class="{ active: menuOpen, 'email-mode': emailView, 'cv-mode': cvView, 'instant': returningFromCV }">
        <div class="menu-content" :class="{ 'email-mode': emailView, 'cv-mode': cvView }">
          <nav class="menu-nav" :class="{ hidden: emailView || cvView }">
          <a href="#" @click.prevent="openCVOverlay">Curriculum Vitae</a>
            <a href="about.html">About Me</a>
            <a href="https://www.linkedin.com/in/coryboris" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://github.com/CoryWBoris" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#" @click.prevent="showEmail">Email</a>
          </nav>

          <div class="email-view" :class="{ active: emailView }">
             <button class="menu-back-btn" @click="hideEmail">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M19 12H5M12 19l-7-7 7-7"/>
               </svg>
               Back
             </button>
             <a href="mailto:CoryBoris@CoryBoris.com" class="email-link">CoryBoris@CoryBoris.com</a>
             <button class="copy-btn" @click="copyEmail">{{ copyButtonText }}</button>
          </div>

          <div class="cv-view" :class="{ active: cvView }">
             <button class="menu-back-btn" @click="hideCV">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M19 12H5M12 19l-7-7 7-7"/>
               </svg>
               Back
             </button>
             <div class="cv-title">Curriculum Vitae</div>
             <button class="cv-open-btn" @click="openCVOverlay">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                 <polyline points="14 2 14 8 20 8"/>
                 <line x1="16" y1="13" x2="8" y2="13"/>
                 <line x1="16" y1="17" x2="8" y2="17"/>
                 <polyline points="10 9 9 9 8 9"/>
               </svg>
               View Resume
             </button>
          </div>
        </div>
      </div>

      <!-- CV Overlay -->
      <div class="cv-overlay" :class="{ active: cvOverlayOpen }" @click.self="closeAllOverlays">
        <div class="cv-overlay-content">
          <div class="cv-overlay-header">
            <button class="cv-overlay-back" @click="closeCVOverlay">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="cv-download-group">
              <button class="cv-overlay-download" @click="downloadCV">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                PDF
              </button>
              <button class="cv-overlay-download" @click="downloadDocx">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                .docx
              </button>
            </div>
          </div>
          <div class="cv-pdf-container" v-if="cvPdfReady">
            <iframe
              src="cv-content.html"
              class="cv-pdf-iframe"
            ></iframe>
          </div>
          <div class="cv-loading" v-else>
            <div class="cv-loading-spinner"></div>
            <span>Loading CV...</span>
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

      <!-- Project Detail Overlay -->
      <div
        v-if="projectOverlay"
        class="project-detail-overlay"
        :class="overlayState"
        @click.self="closeProjectOverlay"
      >
        <div
          class="project-detail-content"
          :class="overlayState"
          :style="expandStyle"
          @animationend.self="onProjectDetailAnimationEnd"
        >
          <img
            v-if="expandOrigin.logo"
            :src="expandOrigin.logo"
            class="animating-logo"
            :class="overlayState"
            @animationend.self="onAnimatingLogoAnimationEnd"
          >
          <button class="project-detail-close" @click="closeProjectOverlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="content-inner" :class="{ visible: overlayState === 'open' }">
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
          v-for="i in 5"
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