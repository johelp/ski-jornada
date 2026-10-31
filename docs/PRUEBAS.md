# Pruebas

## Prueba de humo automática (API)

`backend/scripts/smoke.js` recorre el proceso completo con una cuenta de administración y dos de profesor: permisos, carga de clases, importes, confirmación y bloqueo, revisión (discrepancia, corrección, aprobación), anotaciones por clase, notificaciones, documentos (subida, firma y acceso protegido) y limpieza. **149 verificaciones** (incluye correcciones trazables de fichajes, API keys, planning, exportación de datos, comparativa con reservas, control de acceso, salud y copia de seguridad, subidas y límites, código de 6 dígitos con `API_LOG`, y panel de administración). Sin `API_LOG` (registro de la API local) se omiten las pruebas con código real. Se ejecuta en cada PR con GitHub Actions (`.github/workflows/ci.yml`).

```bash
# Backend local con datos demo
cd backend
export DATABASE_URL=file:./prisma/dev.db JWT_SECRET=prueba PASSWORD_LOGIN=true SMTP_USER= SMTP_PASS=
node prisma/seed.js && node index.js &
node scripts/smoke.js
```

Contra un entorno de **prueba** remoto (nunca producción; crea y borra datos y modifica primas/tarifa de las cuentas usadas):

```bash
BASE_URL=https://api-prueba.ejemplo.com ADMIN_TOKEN=<jwt> PROF_TOKEN=<jwt> PROF2_TOKEN=<jwt> node backend/scripts/smoke.js
```

Los JWT se obtienen entrando con enlace mágico y leyendo `localStorage.token`, o con `POST /api/auth/renovar`.
Variables: `BASE_URL`, `SMOKE_MES` (def. `2031-03`), `ADMIN_EMAIL`, `PROF_EMAIL`, `PROF2_EMAIL`, `PASSWORD`.
Sale con código 1 si algo falla.

## Lista de comprobación manual (pantallas)

**Profesor** (móvil y escritorio)
- [ ] Landing → “Acceso profesores” → email → llega el enlace → entra y queda en sesión.
- [ ] Mis Clases: cargar 2 h + Idioma + Repetida; ver el importe; editar y borrar.
- [ ] Confirmar el mes: queda bloqueado y aparece “En espera de revisión”.
- [ ] Tras la revisión del admin: ve el estado, la nota y las marcas por clase; recibe la notificación.
- [ ] “Corrección solicitada”: puede editar de nuevo y reconfirmar.
- [ ] Descargar el informe PDF (con y sin importes).
- [ ] Mis Docs: abrir el original, subir el firmado.
- [ ] Fichar y desfichar; solicitar días libres.
- [ ] Instalar la app en el móvil.

**Administración**
- [ ] Landing → “Acceso administración” → entra.
- [ ] Usuarios: alta de profesor (llega la invitación), tarifa por hora, baja.
- [ ] Clases → Disciplinas y primas: alta, importes y modo.
- [ ] Clases → resumen del mes: estados y exportación CSV.
- [ ] Detalle de un profesor: anotar clases (OK / Revisar / nota); aprobar, marcar discrepancia, pedir corrección y comentar; reabrir mes.
- [ ] Documentos: subir una nómina a un profesor y ver su estado de firma; abrir original y firmado.
- [ ] Informes de jornada, planilla, ausencias; aprobar días libres.
- [ ] Zonas: alta, QR, regenerar secreto.

## Resultado de la última ejecución

Probado en local el 29/10/2026: prueba de humo **89/89 correctas**. Pantallas verificadas en navegador: landing (375 px y 1024 px), acceso por enlace mágico, carga y consulta de clases del profesor, resumen y detalle de administración, revisión con discrepancia y anotación de una clase (visible luego en la cuenta del profesor) y apertura protegida de un documento. Sin verificar todavía: envío real de correos, instalación de la PWA en un móvil, fichaje por QR/GPS/NFC en dispositivo.
