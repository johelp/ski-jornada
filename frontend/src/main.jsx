import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Retira la pantalla de apertura cuando la app está montada (mínimo ~1,3 s para que se vea la animación)
const splash = document.getElementById('splash');
if (splash) {
  const MIN = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 1300;
  const espera = Math.max(0, MIN - (Date.now() - (window.__inicio || Date.now())));
  setTimeout(() => { splash.classList.add('fuera'); setTimeout(() => splash.remove(), 500); }, espera);
}

// Service Worker (PWA): solo en producción. En desarrollo se desinstala el que hubiera para no servir contenido viejo.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW error:', err));
    });
  } else {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  }
}
