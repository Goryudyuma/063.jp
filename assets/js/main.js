const themeButton = document.querySelector('[data-theme-toggle]');
const root = document.documentElement;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function updateThemeButton() {
  const dark = (root.dataset.theme || (systemTheme.matches ? 'dark' : 'light')) === 'dark';
  themeButton?.setAttribute('aria-pressed', String(dark));
  themeButton?.setAttribute('aria-label', dark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#20251f' : '#f5f2eb');
}

if (themeButton) {
  themeButton.hidden = false;
  themeButton.addEventListener('click', () => {
    const current = root.dataset.theme || (systemTheme.matches ? 'dark' : 'light');
    root.dataset.theme = current === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', root.dataset.theme);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
    updateThemeButton();
  });
}
updateThemeButton();
systemTheme.addEventListener('change', updateThemeButton);
window.addEventListener('storage', (event) => {
  if (event.key !== 'theme' && event.key !== null) return;
  if (event.newValue === 'dark' || event.newValue === 'light') root.dataset.theme = event.newValue;
  else delete root.dataset.theme;
  updateThemeButton();
});

const navLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const sections = navLinks.map((link) => document.querySelector(link.hash)).filter(Boolean);
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visible.add(entry.target.id);
      else visible.delete(entry.target.id);
    });
    const activeSection = sections.find((section) => visible.has(section.id));
    navLinks.forEach((link) => {
      if (activeSection && link.hash === `#${activeSection.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -45% 0px', threshold: 0 });
  sections.forEach((section) => observer.observe(section));
}
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

// Print the complete history, then restore the reader's disclosure choices.
let printDetails = [];
window.addEventListener('beforeprint', () => {
  if (printDetails.length) return;
  printDetails = [...document.querySelectorAll('details:not([open])')];
  printDetails.forEach((details) => { details.open = true; });
});
window.addEventListener('afterprint', () => {
  printDetails.forEach((details) => { details.open = false; });
  printDetails = [];
});
