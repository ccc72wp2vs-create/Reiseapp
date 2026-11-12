// Applies the stored theme before first paint (avoids a flash of the wrong theme).
try {
  var p = localStorage.getItem('travio.theme');
  var light = p === 'light' || (p === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  if (light) document.documentElement.dataset.theme = 'light';
} catch (e) {
  /* storage unavailable */
}
