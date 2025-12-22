// About Page - Section Scrolling Controller
(function() {
  'use strict';

  // Preload all images before showing page
  const imagesToPreload = [
    'assets/main_logo.webp',
    'assets/Cory_Iceland.webp',
    'assets/Cory_Coffee.webp',
    'assets/Cory_Victoria.webp'
  ];

  // Hide page until images loaded
  document.body.style.opacity = '0';

  let loadedCount = 0;
  const totalImages = imagesToPreload.length;

  function checkAllLoaded() {
    loadedCount++;
    if (loadedCount >= totalImages) {
      // All images loaded, show page
      document.body.style.transition = 'opacity 0.3s ease';
      document.body.style.opacity = '1';
    }
  }

  imagesToPreload.forEach(src => {
    const img = new Image();
    img.onload = checkAllLoaded;
    img.onerror = checkAllLoaded; // Don't block on errors
    img.src = src;
  });

  // Fallback - show page after 3 seconds regardless
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.3s ease';
    document.body.style.opacity = '1';
  }, 3000);

  const container = document.getElementById('about-container');
  const sections = document.querySelectorAll('.about-section');
  const dots = document.querySelectorAll('.section-dot');
  const scrollIndicator = document.getElementById('scroll-indicator');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const menuOverlay = document.getElementById('menu-overlay');

  let currentSection = 0;
  const totalSections = sections.length;

  // Scroll indicator bounce timer - only bounce after 7 seconds of no scrolling
  let bounceTimer = null;
  const BOUNCE_DELAY = 7000;

  function startBounceTimer() {
    stopBounceTimer();
    if (scrollIndicator && currentSection === 0) {
      bounceTimer = setTimeout(() => {
        scrollIndicator.classList.add('bouncing');
      }, BOUNCE_DELAY);
    }
  }

  function stopBounceTimer() {
    if (bounceTimer) {
      clearTimeout(bounceTimer);
      bounceTimer = null;
    }
    if (scrollIndicator) {
      scrollIndicator.classList.remove('bouncing');
    }
  }

  // Start the initial bounce timer
  startBounceTimer();

  // Scroll to a specific section (for dots/keyboard)
  function scrollToSection(index) {
    if (index < 0 || index >= totalSections) return;
    sections[index].scrollIntoView({ behavior: 'smooth' });
  }

  // Update dots based on scroll position
  function updateActiveDot() {
    const scrollTop = container.scrollTop;
    const sectionHeight = window.innerHeight;
    const newSection = Math.round(scrollTop / sectionHeight);

    // Reset bounce timer on any scroll activity
    startBounceTimer();

    if (newSection !== currentSection && newSection >= 0 && newSection < totalSections) {
      currentSection = newSection;
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSection);
      });

      // Hide scroll indicator after first section
      if (currentSection > 0 && scrollIndicator) {
        scrollIndicator.classList.add('hidden');
        stopBounceTimer();
      } else if (currentSection === 0 && scrollIndicator) {
        scrollIndicator.classList.remove('hidden');
        startBounceTimer();
      }
    }
  }

  // Handle keyboard events
  function handleKeydown(e) {
    if (menuOverlay.classList.contains('active')) return;

    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      if (currentSection < totalSections - 1) {
        scrollToSection(currentSection + 1);
      }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      if (currentSection > 0) {
        scrollToSection(currentSection - 1);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToSection(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToSection(totalSections - 1);
    }
  }

  // Dot click handlers
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      scrollToSection(index);
    });
  });

  // Scroll indicator click
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
      scrollToSection(1);
    });
  }

  // Hamburger menu toggle - MATCHES MAIN SITE EXACTLY
  const menuContent = document.getElementById('menu-content');
  const menuNav = document.getElementById('menu-nav');
  const cvOverlay = document.getElementById('cv-overlay');
  let emailViewActive = false;
  let cvOverlayOpen = false;
  let menuClosing = false;

  function toggleMenu() {
    // If CV overlay is open, close everything
    if (cvOverlayOpen) {
      cvOverlayOpen = false;
      cvOverlay.classList.remove('active');
      hamburgerBtn.classList.remove('active');
      menuOverlay.classList.remove('active');
      setTimeout(() => {
        emailViewActive = false;
        hideEmail();
        document.body.classList.remove('menu-open');
      }, 300);
      return;
    }

    if (menuOverlay.classList.contains('active')) {
      // Menu is closing
      hamburgerBtn.classList.remove('active');
      menuOverlay.classList.remove('active');

      // If in email view, close faster (300ms), else wait for stagger (800ms)
      const closeDuration = emailViewActive ? 300 : 800;

      setTimeout(() => {
        emailViewActive = false;
        hideEmail();
        document.body.classList.remove('menu-open');
      }, closeDuration);
    } else {
      // Menu is opening
      hamburgerBtn.classList.add('active');
      menuOverlay.classList.add('active');
      document.body.classList.add('menu-open');
    }
  }

  hamburgerBtn.addEventListener('click', toggleMenu);

  // Email View
  const emailView = document.getElementById('email-view');
  const emailTrigger = document.getElementById('email-trigger');
  const emailBack = document.getElementById('email-back');
  const copyEmailBtn = document.getElementById('copy-email');

  function showEmail() {
    emailViewActive = true;
    menuNav.classList.add('hidden');
    emailView.classList.add('active');
    menuContent.classList.add('email-mode');
    menuOverlay.classList.add('email-mode');
  }

  function hideEmail() {
    emailViewActive = false;
    menuNav.classList.remove('hidden');
    emailView.classList.remove('active');
    menuContent.classList.remove('email-mode');
    menuOverlay.classList.remove('email-mode');
  }

  function copyEmail() {
    navigator.clipboard.writeText('CoryWBoris@gmail.com').then(() => {
      copyEmailBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyEmailBtn.textContent = 'Copy Address';
      }, 2000);
    });
  }

  if (emailTrigger) {
    emailTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      showEmail();
    });
  }

  if (emailBack) {
    emailBack.addEventListener('click', hideEmail);
  }

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', copyEmail);
  }

  // CV Overlay
  const cvTrigger = document.getElementById('cv-trigger');
  const cvBack = document.getElementById('cv-back');
  const cvDownload = document.getElementById('cv-download');

  function openCVOverlay() {
    cvOverlayOpen = true;
    menuOverlay.classList.remove('active');
    cvOverlay.classList.add('active');
    // Keep hamburger as X while CV is open
    hamburgerBtn.classList.add('active');
  }

  function closeCVOverlay() {
    cvOverlayOpen = false;
    cvOverlay.classList.remove('active');
    // Return to menu with hamburger still as X
    menuOverlay.classList.add('active');
    hamburgerBtn.classList.add('active');
  }

  function closeAllOverlays() {
    cvOverlayOpen = false;
    emailViewActive = false;
    cvOverlay.classList.remove('active');
    menuOverlay.classList.remove('active');
    hamburgerBtn.classList.remove('active');
    document.body.classList.remove('menu-open');
    hideEmail();
  }

  function downloadCV() {
    const link = document.createElement('a');
    link.href = 'assets/Cory Boris Curriculum Vitae.pdf';
    link.download = 'Cory Boris Curriculum Vitae.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (cvTrigger) {
    cvTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      openCVOverlay();
    });
  }

  if (cvBack) {
    cvBack.addEventListener('click', closeCVOverlay);
  }

  if (cvDownload) {
    cvDownload.addEventListener('click', downloadCV);
  }

  // Click outside CV overlay to close all
  cvOverlay.addEventListener('click', (e) => {
    if (e.target === cvOverlay) {
      closeAllOverlays();
    }
  });

  // Close menu when clicking navigation links
  menuNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      // CV and Email handled separately
      if (link.id === 'cv-trigger' || link.id === 'email-trigger') {
        return;
      }

      // If it's the "Back to Main" link, let it navigate
      if (link.classList.contains('go-home')) {
        hamburgerBtn.classList.remove('active');
        menuOverlay.classList.remove('active');
        document.body.classList.remove('menu-open');
        return;
      }

      // For external links, close menu
      if (link.getAttribute('target') === '_blank') {
        toggleMenu();
        return;
      }

      toggleMenu();
    });
  });

  // Close overlays on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (cvOverlayOpen) {
        closeCVOverlay();
      } else if (emailViewActive) {
        hideEmail();
      } else if (menuOverlay.classList.contains('active')) {
        toggleMenu();
      }
    }
  });

  // Event listeners - CSS scroll-snap handles wheel/touch, JS just tracks position
  container.addEventListener('scroll', updateActiveDot, { passive: true });
  document.addEventListener('keydown', handleKeydown);

  // Initial state - just set dots, don't scroll
  dots[0].classList.add('active');

})();
