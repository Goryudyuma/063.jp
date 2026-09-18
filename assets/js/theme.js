// Runs before styles load; CSS follows the system if no choice is saved.
try {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch {
  // Browser storage is optional.
}
