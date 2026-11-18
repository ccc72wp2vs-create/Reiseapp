// Applies the stored theme before first paint (avoids a flash of the wrong theme).
try {
  var p = localStorage.getItem('travio.theme');
  var light = p === 'light' || (p === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  if (light) document.documentElement.dataset.theme = 'light';
} catch (e) {
  /* storage unavailable */
}
// Installed on iPhone (iOS 26+): the system blurs ~40pt below the status bar
// over whatever scrolls there – keep that zone calm (see .ios-standalone in CSS).
try {
  if (navigator.standalone === true) document.documentElement.classList.add('ios-standalone');
} catch (e) {
  /* ignore */
}
