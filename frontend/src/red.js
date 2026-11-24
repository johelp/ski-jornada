// Peticiones con reintentos para las pantallas que cargan datos al abrirse.
// En el móvil la red tarda en volver al reabrir la app y el servidor puede estar ocupado un instante: un fallo aislado
// no debe convertirse en un aviso de error. Se reintenta solo ante fallos de red, 429 y 5xx (nunca ante 400/401/403/404).
const pausa = ms => new Promise(r => setTimeout(r, ms));

export const esReintentable = e => !e.response || e.response.status === 429 || e.response.status >= 500;

export async function conReintentos(fn, { intentos = 3, espera = 700 } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); }
    catch (e) {
      ultimo = e;
      if (!esReintentable(e) || i === intentos - 1) break;
      await pausa(espera * (i + 1));
    }
  }
  throw ultimo;
}
