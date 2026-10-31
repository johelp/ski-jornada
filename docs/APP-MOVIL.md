# App en el móvil (PWA)

La plataforma es una **web app instalable**: instalada se abre **a pantalla completa**, sin barra de direcciones ni botones del navegador, con su icono y su pantalla de apertura.

## Instalar

| Dispositivo | Pasos |
|-------------|-------|
| **Android (Chrome)** | Entrar en la web → aparece el aviso **«Usa la app a pantalla completa»** → *Instalar*. También en *Más → Instalar la app* o en el menú ⋮ → *Instalar aplicación* |
| **iPhone (Safari)** | Entrar en la web con **Safari** → botón *Compartir* → **«Añadir a pantalla de inicio»**. El aviso de la app lo recuerda |
| **Escritorio (Chrome/Edge)** | Icono de instalar en la barra superior de la app o de la barra de direcciones |

> Un sitio abierto en una pestaña normal **no puede ocultar la barra de direcciones**: es una restricción de los navegadores. La forma de verlo a pantalla completa es instalarlo.

## Qué incluye

- **Pantalla completa** (`display: standalone`), color de barra de estado y de fondo de la marca, y respeto de las zonas seguras (notch, barra de gestos).
- **Pantalla de apertura animada**: el logo se dibuja y aparece el nombre; dura ~1,3 s la primera vez de cada sesión (si el usuario tiene activado «reducir movimiento», es instantánea y sin animación).
- **Sin comportamientos de página web**: sin «tirar para recargar», sin rebote, sin zoom por doble toque ni menú al mantener pulsado.
- **Atajos al mantener pulsado el icono** (Android): *Fichar* y *Cargar clase* (`/?vista=fichar`, `/?vista=misclases`).
- **Aviso de instalación** en móvil: se muestra si la app no está instalada y se oculta 14 días al descartarlo.
- **Navegación pensada para el pulgar**: barra inferior, botones de ≥ 44 px y formularios táctiles.

## Entrar y mantener la sesión (app instalada)

El enlace del correo se abre en el navegador del móvil y, en **iPhone**, la app instalada tiene su propio almacenamiento: la sesión iniciada en Safari no pasa a ella. Por eso el correo trae además un **código de 6 dígitos**: se pide el acceso **dentro de la app instalada** y se escribe el código allí mismo; no hace falta salir de la app.

Para que el profesor **no tenga que volver a entrar**:

- **Sesión de 90 días que se amplía con el uso:** al abrir la app y cada vez que vuelve a primer plano (como mucho una vez cada 6 h) se renueva por otros 90 días. Solo se pide un acceso nuevo si pasan 90 días sin abrirla.
- **Doble copia:** el token se guarda en `localStorage` y en IndexedDB (`src/sesion.js`). Si el sistema limpia uno, se restaura del otro al abrir. Además se pide al navegador almacenamiento persistente (`navigator.storage.persist()`).
- **Un fallo temporal no cierra la sesión:** solo una respuesta 401 real (token caducado, cuenta de baja) cierra la sesión. Sin cobertura o con el servidor caído la sesión se conserva; si la base de datos falla puntualmente la API responde 503, no 401.
- **Baja inmediata:** si administración da de baja a alguien, su sesión deja de valer en segundos.

Si un profesor se queda sin sesión: abrir la app → *Acceso profesores* → su email → código del correo.

## Para desarrolladores

- `frontend/public/manifest.json`: nombre, iconos (`any` y `maskable`), `display_override`, `shortcuts`.
- `frontend/index.html`: metas de iOS, estilos y marcado de la **pantalla de apertura** (`#splash`); `frontend/src/main.jsx` la retira cuando la app está montada.
- `frontend/src/InstalarBanner.jsx`: aviso de instalación (Android con evento `beforeinstallprompt`; iOS con instrucciones).
- `frontend/public/sw.js`: service worker (subir `CACHE_NAME` al cambiar el contenido cacheado).
- `frontend/src/theme.css` (sección «App a pantalla completa»): `overscroll-behavior`, `touch-action`, zonas seguras.
- Pruebas: Chrome DevTools → Application → Manifest (comprobar «Installable»); en iPhone, instalar y abrir desde el icono.
