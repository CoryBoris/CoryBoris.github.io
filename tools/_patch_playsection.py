import io
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(REPO, "app.js")

NEW = '''    // Section freeze frames double as the rest positions we keep permanently
    // decoded as ImageBitmaps, so every settled state is a zero-cost GPU blit.
    const FREEZE_FRAMES = [0, 23, 55, 69, 168, 240];

    /**
     * Animate the coat between two sections, in either direction.
     *
     * This single function replaces the old playForward/playReverse pair. There
     * is no longer a reversed asset, no second decoder to swap to, and no seek
     * to wait on - going backwards just means counting the frame index down.
     */
    const playSection = (fromSection, targetSection) => {
      if (isScrollLocked.value) return;
      isScrollLocked.value = true;

      // Trigger exit animation on current section
      exitingSection.value = fromSection;
      showContent.value = false;

      const fromFrame = sectionFrames[fromSection][1];
      const toFrame = sectionFrames[targetSection][1];

      // Preserve the original pacing: the segment runs at 24fps, and segments
      // longer than 2s run at double speed (what video.playbackRate = 2 did).
      const spanSeconds = Math.abs(toFrame - fromFrame) / frameRate;
      const speed = spanSeconds > 2 ? 2 : 1;
      const actualDuration = spanSeconds / speed;

      _log(`playSection(${fromSection}\\u2192${targetSection}) frames ${fromFrame}\\u2192${toFrame} over ${actualDuration.toFixed(3)}s`);

      // Sync gradient with the animation: set duration, then trigger the colour
      // change on the next frame.
      gradientDuration.value = `${actualDuration}s`;
      // Double-RAF: first paints new duration, second triggers color change
      requestAnimationFrame(() => { requestAnimationFrame(() => { gradientSection.value = targetSection; }); });
      // Angle rotation: 135->180 at start, 180->135 near end
      gradientAngle.value = '180deg';
      const angleReturnMs = Math.max(0, (actualDuration * 1000) - 300);
      setTimeout(() => { gradientAngle.value = '135deg'; }, angleReturnMs);

      animateFrames(fromFrame, toFrame, actualDuration * 1000, () => {
        drawFrame(toFrame);
        exitingSection.value = null; // Clear exiting state
        showContent.value = true;
        if (!initialIntroDone.value && fromSection === 0) {
          initialIntroDone.value = true;
        }
        // Brief unlock delay for content fade-in
        setTimeout(() => {
          isScrollLocked.value = false;
        }, 200);
      });
    };

'''

src = io.open(PATH, encoding="utf-8").read()
start = src.index("    // Reverse video: frame N in forward")
end = src.index("    // Handle touch events for mobile")
removed = end - start
src = src[:start] + NEW + src[end:]
io.open(PATH, "w", encoding="utf-8").write(src)
print("replaced %d chars with %d chars" % (removed, len(NEW)))

# Repoint every call site at the unified animator.
src = io.open(PATH, encoding="utf-8").read()
for old, new in [
    ("playForward(fromSection, currentSection.value);", "playSection(fromSection, currentSection.value);"),
    ("playReverse(fromSection, currentSection.value);", "playSection(fromSection, currentSection.value);"),
    ("playForward(fromSection, sectionIndex);", "playSection(fromSection, sectionIndex);"),
    ("playReverse(fromSection, sectionIndex);", "playSection(fromSection, sectionIndex);"),
    ("playForward(0, 1);", "playSection(0, 1);"),
]:
    print("%-52s x%d" % (old, src.count(old)))
    src = src.replace(old, new)
io.open(PATH, "w", encoding="utf-8").write(src)

leftover = [n for n in ("playForward", "playReverse", "sectionFramesReverse",
                        "videoForwardRef", "videoReverseRef", "isReversing",
                        "videoSwitchReady", "frameToTime", "wakeVideo")
            if n in io.open(PATH, encoding="utf-8").read()]
print("remaining old-pipeline references:", leftover or "none")
