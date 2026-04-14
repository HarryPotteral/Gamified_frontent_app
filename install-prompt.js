// PWA Installation Prompt
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Show the install button
  if (installBtn) installBtn.classList.add('show');
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // Hide the install button
    installBtn.classList.remove('show');
    // Clear the deferred prompt
    deferredPrompt = null;
  });
}

// Detect if app is installed
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  if (installBtn) installBtn.classList.remove('show');
});

// Check if running in standalone mode (already installed)
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('Running as installed PWA');
  if (installBtn) installBtn.style.display = 'none';
}