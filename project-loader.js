// Project page loader - handles image preloading and content reveal (desktop only)
(function() {
  // Only run on desktop (non-touch devices)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  if (isTouchDevice) return;

  // Get the hero image
  const heroImg = document.querySelector('.project-hero img');
  const projectPage = document.querySelector('.project-page');
  const projectContent = document.querySelector('.project-content');

  if (!heroImg || !projectPage || !projectContent) return;

  // Hide content initially
  projectContent.style.opacity = '0';
  projectContent.style.transition = 'opacity 0.5s ease-out';

  // Get the image source
  const imgSrc = heroImg.getAttribute('src');

  // Preload the image
  const preloader = new Image();

  const showContent = () => {
    // Small delay to ensure everything is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        projectContent.style.opacity = '1';
      });
    });
  };

  preloader.onload = () => {
    console.log('Project: Hero image loaded');
    showContent();
  };

  preloader.onerror = () => {
    console.warn('Project: Hero image failed to load, showing content anyway');
    showContent();
  };

  // If image is already cached, show immediately
  if (heroImg.complete && heroImg.naturalWidth > 0) {
    console.log('Project: Hero image already cached');
    showContent();
  } else {
    preloader.src = imgSrc;
  }
})();
