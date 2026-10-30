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

## Entrar desde la app instalada

El enlace del correo se abre en el navegador del móvil. En **iPhone** la app instalada tiene su propio almacenamiento, así que la sesión iniciada en Safari no pasa a ella: hay que **pedir el enlace desde la app instalada** y abrirlo (el enlace puede abrirse en Safari igualmente). Para evitarlo está previsto el **código de 6 dígitos** (`ROADMAP.md`).

## Para desarrolladores

- `frontend/public/manifest.json`: nombre, iconos (`any` y `maskable`), `display_override`, `shortcuts`.
- `frontend/index.html`: metas de iOS, estilos y marcado de la **pantalla de apertura** (`#splash`); `frontend/src/main.jsx` la retira cuando la app está montada.
- `frontend/src/InstalarBanner.jsx`: aviso de instalación (Android con evento `beforeinstallprompt`; iOS con instrucciones).
- `frontend/public/sw.js`: service worker (subir `CACHE_NAME` al cambiar el contenido cacheado).
- `frontend/src/theme.css` (sección «App a pantalla completa»): `overscroll-behavior`, `touch-action`, zonas seguras.
- Pruebas: Chrome DevTools → Application → Manifest (comprobar «Installable»); en iPhone, instalar y abrir desde el icono.
