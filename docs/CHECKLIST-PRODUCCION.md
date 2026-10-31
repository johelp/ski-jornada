# Lista de verificación para producción

Marca cada punto antes de abrir una instancia a usuarios reales. Estado al 30/10/2026 para la instancia de pruebas (`skijornada.johelpastorino.com`) y qué falta para la de **Snowmotion**.

Leyenda: ✅ hecho · 🔧 en el repositorio, falta activarlo en la instancia · ⬜ pendiente

## 1. Código y calidad
- [x] ✅ Prueba de humo automática (89 comprobaciones) y CI en cada PR
- [x] ✅ Dependencias sin vulnerabilidades conocidas (`npm audit --omit=dev` = 0 en API y frontend)
- [x] ✅ El arranque aborta ante configuración insegura (`JWT_SECRET` corto, `PASSWORD_LOGIN`, `FRONTEND_URL` sin https)
- [x] ✅ El seed demo no corre en producción; el frontend no compila sin `VITE_API_URL`
- [x] ✅ Código muerto retirado (contraseña inicial, cambio de contraseña)
- [ ] ⬜ Prueba en dispositivos reales (Android e iPhone): instalar la PWA, entrar, cargar una clase, fichar

## 2. Acceso y seguridad
- [x] ✅ Sin registro público; solo entra quien está en la lista; baja con revocación inmediata
- [x] ✅ Límite de enlaces por email e IP; enlaces de un solo uso (15 min); sesiones de 90 días
- [x] ✅ Cuenta principal, roles y registro de actividad
- [x] ✅ Archivos laborales protegidos; API de integraciones con claves por alcance; webhooks firmados
- [x] 🔧 Cabeceras de seguridad en la web (`frontend/public/_headers`): `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS y **CSP en modo solo-informe** → tras una semana sin avisos, pasar a `Content-Security-Policy` (ver `OPERACION.md`)
- [ ] ⬜ 2FA activado en las cuentas de GitHub, Railway, Cloudflare, Resend y en el **buzón de la cuenta de administración**
- [ ] ⬜ Doble verificación para administración en la app (roadmap)

## 3. Infraestructura
- [x] ✅ API en Railway con volumen, dominio propio y certificado; web en Cloudflare Pages con dominio propio
- [x] ✅ Correo con dominio verificado (Resend, `updates.johelpastorino.com`)
- [x] 🔧 Healthcheck con base de datos (`/api/salud`) y cierre ordenado
- [ ] ⬜ **Región UE** para la instancia de Snowmotion (`OPERACION.md`)
- [ ] ⬜ **Monitor externo** de disponibilidad (UptimeRobot/Better Stack) con aviso por correo
- [ ] ⬜ Variables de la instancia: `JWT_SECRET` ≥ 32 caracteres propio, `ADMIN_EMAIL` (cuenta de empresa), `FRONTEND_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `DOCUMENTOS_HABILITADOS=false` (nóminas fuera)

## 4. Datos y copias
- [x] 🔧 Copia diaria automática (14 días) y descarga manual por la cuenta principal
- [ ] ⬜ Guardar una copia **fuera** del servidor cada semana
- [ ] ⬜ Probar una **restauración** completa antes del primer día real
- [ ] ⬜ Plazos de conservación acordados; tarea anual de `purgar.js`

## 5. Protección de datos (RGPD)
- [ ] ⬜ Contrato de encargo de tratamiento firmado con Snowmotion (`RGPD.md`)
- [ ] ⬜ Política de privacidad entregada al personal; consulta a la representación de los trabajadores si procede
- [ ] ⬜ Decisión sobre GPS por zona documentada (preferir QR/NFC)
- [ ] ⬜ Revisión de `RGPD.md` por el asesor legal del cliente

## 6. Puesta en marcha de la instancia
- [ ] ⬜ Cargar disciplinas, primas con importes y tarifas por profesor
- [ ] ⬜ Importar la lista de profesores (*Usuarios → Importar lista*) y **probar con 2–3 personas** antes de invitar a todos
- [ ] ⬜ Crear zonas de fichaje e imprimir los QR
- [ ] ⬜ Probar la comparativa con el CSV del sistema de reservas del mes anterior
- [ ] ⬜ Mes piloto: horas → confirmación → revisión → liquidación

## 7. Después del lanzamiento
- [ ] ⬜ Revisar logs y correos rebotados la primera semana
- [ ] ⬜ Pasar la CSP de solo-informe a obligatoria
- [ ] ⬜ Recoger feedback de profesores y administración; priorizar el roadmap
