// Arranque mínimo (archivo externo para poder usar una Content-Security-Policy estricta sin scripts en línea).
// La pantalla de apertura solo se muestra en el primer arranque de cada sesión.
try {
  var splash = document.getElementById('splash');
  if (splash) { if (sessionStorage.getItem('splash')) splash.remove(); else sessionStorage.setItem('splash', '1'); }
} catch (e) { /* sin sessionStorage: se muestra igualmente */ }
window.__inicio = Date.now();
