# Plan de pruebas del MVP

Lo necesario para dar el MVP por probado antes de abrirlo a un cliente real. Complementa `PRUEBAS.md` (pruebas automáticas) y `DATOS-DE-PRUEBA.md` (cuentas y guion por función).

Estado: ☐ pendiente · ✅ hecho. Quién: **Auto** (ya lo ejecuta el CI), **Dev** (quien implanta), **Cliente** (la escuela).

## 0. Preparación

| | Qué | Quién |
|-|-----|-------|
| ☐ | Entorno de pruebas desplegado (API + web) con `PASSWORD_LOGIN` **desactivado** y el seed completo, en una instancia **aparte de producción** | Dev |
| ☐ | Correo real configurado (Resend) con un buzón de prueba que recibe enlace y código | Dev |
| ☐ | 1 iPhone, 1 Android y 1 ordenador; una cuenta de correo por cada uno | Dev |
| ☐ | Datos reales del cliente cargados **solo después** de esta lista | Cliente |

## 1. Automáticas (cada PR)

| Estado | Qué | Cómo |
|--------|-----|------|
| ✅ Auto | 189 comprobaciones: colaboradores y módulos, correcciones trazables de fichajes, permisos, clases e importes, confirmación y revisión, comparativa, integraciones, acceso por invitación y código, límites, subidas, panel, WhatsApp (sin conexión) | `node backend/scripts/smoke.js` (con `API_LOG` para las del código) |
| ✅ Auto | Compilación del frontend y `npm audit` | CI |
| ☐ Dev | Ejecutar el smoke contra el entorno de pruebas desplegado, no solo en local | `BASE_URL=… ADMIN_TOKEN=… PROF_TOKEN=… PROF2_TOKEN=…` |

## 2. Funcionales por rol (guion de `DATOS-DE-PRUEBA.md`)

**Profesor (en el móvil)**
- ☐ Entrar por enlace y por código de 6 dígitos; aceptar la información de privacidad.
- ☐ Fichar entrada y salida (QR, GPS y la zona que use el cliente); fichar fuera de zona (incidencia).
- ☐ Cargar, editar y borrar clases con primas; ver totales del mes y de la temporada.
- ☐ Carga rápida en el móvil: «hoy, 1,5 h, misma disciplina» en menos de 10 segundos y 3 toques; **Deshacer**; cargar «Ayer» y «Otro día»; el aviso de mes anterior sin confirmar a principios de mes; confirmar el mes con el aviso en pantalla; lectura con VoiceOver/TalkBack de los botones de horas, disciplinas y primas.
- ☐ Confirmar el mes y ver que ya no se edita; ver el resultado de la revisión.
- ☐ Descargar su informe de jornada y de clases (PDF) y abrirlo en el móvil.
- ☐ Pedir días libres (fechas inválidas rechazadas); ver la respuesta.
- ☐ Firmar un documento (si el módulo está activo); exportar mis datos.

**Administración**
- ☐ Panel: contadores correctos tras cada acción anterior; aprobar una solicitud desde el panel.
- ☐ Usuarios: importar CSV, invitar, reenviar, dar de baja (acceso cortado en segundos), roles (solo la cuenta principal).
- ☐ Revisión: aprobar, discrepancia, corrección (reabre el mes), notas por clase; planificado frente a cargado.
- ☐ Comparar con reservas con un CSV real del cliente; vincular nombres; revisar «NO ASIGNADO».
- ☐ Carga rápida del día en el móvil: cargar 6 movimientos de varios colaboradores en menos de 2 minutos; quitar uno equivocado; cargar el día anterior con ◀.
- ☐ Colaboradores: crear uno, cargar 5 h dadas y 2 recibidas (saldo 3 h = 90 € al valor hora), saldar parcial y total, imprimir el extracto PDF y abrirlo en el móvil.
- ☐ Portal del colaborador: darle acceso con un correo real, entrar por enlace y por código, aceptar unas horas y pedir revisión de otras; el panel de administración lo refleja; quitar el acceso corta la sesión.
- ☐ Módulos: apagar y encender cada módulo; el menú, el panel y la API se comportan igual en móvil y escritorio.
- ☐ Corregir un fichaje (añadir, modificar, anular, siempre con motivo): queda el historial y la persona recibe el aviso; el informe cambia.
- ☐ Informes de jornada (PDF oficial), planilla y ausencias; los datos legales de la escuela salen bien.
- ☐ Zonas, QR imprimible, avisos, configuración.
- ☐ Registro de actividad y aceptaciones legales.

## 3. Instalación y sesión (dispositivos reales)

- ☐ iPhone: «Añadir a pantalla de inicio», abrir, pedir acceso **dentro** de la app y entrar con el código; cerrar la app del todo y reabrirla a las 24 h y a los 7 días: sigue la sesión.
- ☐ iPhone: la cabecera no queda bajo el reloj ni la batería.
- ☐ Android: instalar desde el aviso, atajos Fichar y Cargar clase, sesión mantenida.
- ☐ Sin cobertura: abrir la app no cierra la sesión; al volver la red funciona.
- ☐ Baja de un usuario con la app abierta: la siguiente acción pide acceso.
- ☐ Abrir un PDF (informe, nómina) desde la app instalada en iPhone y Android.

## 4. Integraciones

- ☐ Clave de solo lectura: `GET /api/v1/informe/AAAA-MM` responde; `POST /api/v1/planning` da 403.
- ☐ Planning por API y por CSV; reemplazo de mes; cotejo en el detalle del profesor.
- ☐ Webhook real (un Make/Zapier de prueba): recibe `clases.mes_confirmado` y `solicitud.creada` con la firma correcta; un destino interno se rechaza.
- ☐ Pausar y eliminar claves y webhooks surte efecto de inmediato.

## 5. WhatsApp (si el cliente lo quiere)

- ☐ Con un **número dedicado**: *Generar QR* → escanear → *Conectado*; reiniciar la API y comprobar que reconecta sola.
- ☐ Mensaje de prueba; activar los avisos en el perfil de un profesor de prueba y comprobar solicitud respondida, revisión de horas y aviso masivo.
- ☐ Quien no activó los avisos **no** recibe nada; *Desactivar* detiene los envíos; *Desvincular* pide un QR nuevo.
- ☐ Decisión informada del cliente sobre el riesgo de bloqueo del número (`INTEGRACIONES.md`, sección 6).

## 6. Seguridad y legal

- ☐ `AUDITORIA-SEGURIDAD.md` con todos los hallazgos cerrados; pasada rápida sobre lo nuevo (integraciones y WhatsApp).
- ☐ Sin `PASSWORD_LOGIN` ni seed en producción; el arranque no muestra advertencias.
- ☐ Contrato de encargo y política de privacidad revisados por el asesor del cliente; aceptación registrada.
- ☐ Registro de jornada: consulta a la representación de los trabajadores y política de fichaje comunicada (ver `CUMPLIMIENTO-REGISTRO-JORNADA.md` y `legal/POLITICA-INTERNA-FICHAJE.md`).

## 7. Operación

- ☐ `/api/salud` en verde y un monitor externo avisando.
- ☐ Copia diaria generada y **restauración probada** en un entorno limpio.
- ☐ Región UE en Railway; secretos propios de la instancia.
- ☐ Correo: SPF, DKIM y DMARC; enlace y código llegan a bandeja (no a spam) en Gmail, Outlook e iCloud.
- ☐ Carga: 70 usuarios entrando a la vez (día de las invitaciones) sin errores.

## 8. Criterio de salida

El MVP está listo para el piloto cuando las secciones 1 a 4, 6 y 7 están completas sin errores abiertos de gravedad alta o media; la sección 5 está completa **o** el módulo apagado; y el piloto de un mes (`MANUAL-IMPLEMENTACION.md`, fases 4–5) tiene fecha.

## 9. Qué falta aportar

| De quién | Qué |
|----------|-----|
| Cliente | Lista de profesores (nombre, apellidos, email, teléfono, jornada, tarifa) · disciplinas, primas y tarifas · zonas · muestra del CSV de reservas del mes · convenio aplicable y si hay representación legal · decisión sobre WhatsApp y número dedicado |
| Dev | Entorno de pruebas, dominio y correo, dispositivos |
| Asesor del cliente | Revisar `legal/` (contrato de encargo, información al personal, política de fichaje) y las decisiones 4–6 de `CUMPLIMIENTO-REGISTRO-JORNADA.md` |
