# ⛷️ Ski Jornada

Web app instalable (PWA) para escuelas de esquí: **fichaje de jornada**, **carga de clases con primas**, **informes mensuales y económicos** y **gestión de profesores**. El acceso es por **enlace mágico** (sin contraseñas) y la sesión queda abierta en el dispositivo. **La escuela crea su cuenta de administración (puede ser de empresa), carga la lista de profesores y los invita**: solo entra quien está en la lista.

## Qué hace

| Rol | Funciones |
|-----|-----------|
| **Profesor** | Fichar/desfichar (QR TOTP, GPS o NFC) · Cargar clases dadas (horas + disciplina + primas) · Consultar sus horas · Confirmar el mes · Descargar su informe mensual y económico en PDF · Pedir días libres · Ver nóminas/documentos |
| **Administrador** | Gestionar la lista de profesores (alta por email o CSV, tarifa por hora) · **Revisar las horas**: aprobar, marcar discrepancia, pedir corrección o dejar notas que ve el profesor · Configurar disciplinas y primas con importes · Ver horas por profesor para **cotejar con el planning de reservas** · Reabrir meses · Informes de jornada (RD 8/2019) · Solicitudes de días libres · Documentos/legajo · Avisos |

Ejemplo de carga: *“Hoy 2 h de Clase de Esquí + prima Idioma + prima Repetida”*.

## Stack

- **Backend:** Node 20 · Express · Prisma 5 · SQLite · JWT · Resend (correo)
- **Frontend:** React 19 · Vite · jsPDF · jsQR · PWA (manifest + service worker)
- **Hosting:** Railway (API + volumen) · Cloudflare Pages (frontend) · Resend (email)

## Estructura

```
backend/            API Express + Prisma
  index.js          Todos los endpoints (ver docs/API.md)
  whatsapp.js       Módulo opcional Baileys
  prisma/           schema, migraciones, seed demo, bootstrap de producción
  railway.json      Configuración de deploy
frontend/           SPA React
  src/App.jsx       Shell, login, fichaje, informes, usuarios, zonas…
  src/VistaMisClases.jsx    Profesor: cargar/consultar/confirmar clases
  src/VistaAdminClases.jsx  Admin: resumen por profesor + disciplinas y primas
  src/pdfClases.js, pdfRegistro.js   Generación de PDFs
  public/           manifest, service worker, íconos
docs/               Documentación técnica
CLAUDE.md           Guía para continuar el desarrollo con Claude Code
```

## Empezar en local

Requisitos: Node 20+.

```bash
# Backend
cd backend
cp .env.example .env            # completar JWT_SECRET; PASSWORD_LOGIN=true para entrar sin email
npm install
npx prisma migrate deploy
node prisma/seed.js             # datos demo (usuarios, zonas, catálogo)
node index.js                   # http://localhost:3000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

- Sin `RESEND_API_KEY` ni SMTP, el **enlace de acceso se imprime en la consola del backend**: cópialo en el navegador.
- Con `PASSWORD_LOGIN=true` el login de desarrollo acepta las cuentas del seed (`admin@escuela.com`, `profesor@escuela.com`, clave `ski123`).

## Documentación

- [docs/ACCESO-Y-ALTAS.md](docs/ACCESO-Y-ALTAS.md) — quién puede entrar: cuenta de administración, lista de profesores, invitaciones y bajas
- [docs/APP-MOVIL.md](docs/APP-MOVIL.md) — instalar la app, pantalla completa, atajos y pantalla de apertura
- [docs/PUESTA-EN-MARCHA.md](docs/PUESTA-EN-MARCHA.md) — guía paso a paso: correo, dominios, DNS y datos de prueba
- [docs/ALCANCE-MVP.md](docs/ALCANCE-MVP.md) — alcance, estado, riesgos y decisiones pendientes del MVP
- [docs/COMPARATIVA.md](docs/COMPARATIVA.md) — comparar el resumen de instructores del sistema de reservas con las horas cargadas
- [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md) — API con keys, webhooks e importación de planning
- [docs/RGPD.md](docs/RGPD.md) — protección de datos: registro, política, contrato de encargo, medidas, brechas
- [docs/FUNCIONES.md](docs/FUNCIONES.md) — catálogo de funciones por rol y su estado
- [docs/MULTI-DESPLIEGUE.md](docs/MULTI-DESPLIEGUE.md) — alta de un cliente nuevo (plantillas en `deploy/`)
- [docs/PILOTO-SNOWMOTION.md](docs/PILOTO-SNOWMOTION.md) — piloto, gestión documental e integración con Drive
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — prueba de humo automática y lista de comprobación
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — modelo de datos, flujos y decisiones
- [docs/API.md](docs/API.md) — referencia de endpoints
- [docs/DEPLOY.md](docs/DEPLOY.md) — producción paso a paso (Railway, Cloudflare Pages, Resend, DNS)
- [docs/ROADMAP.md](docs/ROADMAP.md) — estado, deuda técnica y próximos pasos
- [CLAUDE.md](CLAUDE.md) — convenciones y trampas conocidas para quien continúe el desarrollo

## Estado

MVP funcional. Pendiente de cierre: verificación del envío de correos en producción, instalación de la PWA en móviles reales y revisión UX/UI (ver roadmap).
