# Alcance del MVP — estado al 29/10/2026

> **Actualización 30/10/2026:** la API y la web están en producción con dominio propio y correo operativo; acceso por invitación, cuenta de empresa, app a pantalla completa, landing nueva y endurecimiento de producción (CI, copias, salud, cabeceras) ya están hechos. Lo que falta para abrir a usuarios reales está en `CHECKLIST-PRODUCCION.md`.

Documento para evaluar cómo seguimos. Resume qué está entregado, qué está verificado, qué falta, los riesgos y las decisiones que hacen falta.

**Resumen en una línea:** el núcleo funcional (control horario, carga de clases con primas e importes, revisión de administración, informes, acceso por enlace mágico, PWA) está construido y probado en local; el backend está desplegado en Railway. **Aún no hay frontend público ni correo operativo**, y la interfaz necesita un rediseño mobile-first antes de abrir el piloto a los profesores.

Leyenda: ✅ hecho y verificado · 🟡 hecho, verificación parcial · 🔧 en una rama / en curso · ⬜ pendiente.

---

## 1. Objetivo del MVP

Plataforma instalable para escuelas de esquí, con **dos accesos** (profesor y administración), que permite:
1. Fichar y desfichar (control horario legal).
2. Cargar clases dadas: horas, disciplina y primas configurables por el administrador.
3. Consultar las horas cargadas y generar informes mensuales y económicos.
4. Que administración revise el detalle, **apruebe, marque discrepancias o anote** y que el profesor lo vea.
5. Gestión documental y **acceso por enlace mágico** (sin contraseñas, sesión persistente).
6. Desplegable **por cliente** (multi-despliegue). Primera escuela piloto: **Snowmotion**.

## 2. Qué incluye (entregado)

### Profesor
| Función | Estado |
|---------|--------|
| Acceso por enlace mágico, sesión de 90 días | ✅ |
| Fichar/desfichar (QR rotativo, GPS, NFC), hora del servidor | 🟡 (API y lógica; sin prueba en dispositivo real) |
| Cargar clase (horas, disciplina, varias primas, notas), editar, borrar | ✅ |
| Consultar horas del mes, importe (si hay tarifa) y desglose | ✅ |
| Confirmar el mes (bloquea, congela tarifas, avisa al admin) | ✅ |
| Ver revisión de administración (estado, nota, marcas por clase) | ✅ |
| Informe mensual y económico en PDF | ✅ |
| Días libres, notificaciones, perfil | ✅ (heredado, sin rediseñar) |
| Exportar mis datos (RGPD) | 🔧 |
| App instalable (PWA) | 🟡 (manifiesto y service worker; sin prueba en móvil) |

### Administración
| Función | Estado |
|---------|--------|
| Alta de profesores por email (invitación por enlace) y baja lógica | ✅ |
| Alta masiva por CSV | ✅ (`import-profesores.js`) |
| Disciplinas y primas con importe (€/hora o €/clase) y tarifa por profesor | ✅ |
| Resumen mensual por profesor, exporta CSV | ✅ |
| Detalle día a día para cotejar con reservas | ✅ |
| Aprobar / discrepancia / pedir corrección / comentar + anotaciones por clase | ✅ |
| Cotejo planificado vs. cargado por día | ✅ (en el detalle de cada profesor) |
| Comparativa mensual con el resumen de instructores del sistema de reservas (CSV) | ✅ (`COMPARATIVA.md`) |
| Informes de jornada (RD 8/2019), planilla, ausencias, días libres | ✅ (heredado) |
| Zonas de fichaje, QR, presencia en tiempo real, avisos | ✅ (heredado) |
| Documentos (subida, firma del profesor, descarga protegida) | ✅ |

### Plataforma
| Función | Estado |
|---------|--------|
| Landing pública con accesos profesor / administración, marca por variables | ✅ |
| Multi-despliegue: plantillas de variables, checklist de alta | ✅ (`deploy/`, `MULTI-DESPLIEGUE.md`) |
| Archivos laborales protegidos (solo admin y dueño) | ✅ |
| API para integraciones (API keys con alcances), webhooks firmados, importación de planning | ✅ con pantalla de gestión (*Integraciones*) |
| Interruptor del módulo de documentos por despliegue | 🔧 |
| RGPD: documentación base, exportación de datos, retención/purga | 🔧 (`RGPD.md`, `purgar.js`) |
| Pruebas: prueba de humo de 59 comprobaciones | ✅ |
| Documentación (README, funciones, API, arquitectura, deploy, integraciones, RGPD, piloto) | ✅ |

🔧 = incluido en la rama `feat/rgpd-integraciones` (aún no mergeada a `main`).

## 3. Estado de despliegue

| Componente | Estado |
|------------|--------|
| Backend (Railway, `ski-jornada` / `api`) | ✅ en línea; despliega desde `main`. Región actual `us-west2` ⚠ (para datos reales: `europe-west4`) |
| Dominio de la API (`api.skijornada.johelpastorino.com`) | ⬜ el DNS de `johelpastorino.com` no está en Cloudflare; faltan los registros |
| Frontend (Cloudflare Pages, `ski-jornada`) | 🟡 proyecto creado y conectado al repo; sin dominio propio y sin conexión útil con la API hasta tener DNS |
| Correo (Resend) | ⬜ falta verificar el dominio y la API key; **sin esto no llegan los enlaces de acceso** |
| Instancia de Snowmotion | ⬜ no creada |

## 4. Verificación realizada

- Prueba de humo de la API en local: **59/59 correctas** (permisos, clases, importes, confirmación y bloqueo, revisión, documentos, API keys, planning, exportación).
- Pantallas probadas en navegador en local: landing (móvil y escritorio), acceso por enlace, cargar y consultar clases (profesor), resumen, detalle y revisión (administración), apertura protegida de documentos.
- **No verificado:** envío real de correos, instalación y uso de la PWA en móvil, fichaje por QR/GPS/NFC en dispositivo, carga con muchos usuarios, restauración de copias.

## 5. Fuera del alcance actual (explícito)

- **Nóminas firmadas:** por ahora se firman y cargan en una **plataforma externa** (decisión del cliente). El módulo existe y se apaga con `DOCUMENTOS_HABILITADOS=false`.
- Integración con Google Drive (análisis en `PILOTO-SNOWMOTION.md`).
- Firma electrónica con validez legal.
- Importación automática del planning desde el gestor de reservas (la API está lista; falta el conector concreto).
- Multi-escuela en un solo despliegue.
- Notificaciones push en iPhone, biometría, integración con software de nóminas.

## 6. Pendientes para abrir el piloto

**Bloqueantes**
1. **Rediseño de la interfaz, mobile-first** (en especial profesor): hoy el diseño es anticuado y poco optimizado para móvil, y muchos profesores no tienen ordenador. Incluye navegación inferior, formularios táctiles, tarjetas en vez de tablas y las pantallas de administración.
2. **DNS y dominios** (API y app) y **correo** (Resend).
3. **Región UE** y firma de los contratos de tratamiento (`RGPD.md`).
4. **Instancia propia de Snowmotion** con su administrador, disciplinas, primas y profesores (lista en CSV).
5. **Prueba real en móviles**: instalar la PWA, entrar por enlace (iPhone y Android), cargar una clase, fichar.

**Importantes**
6. Pantalla de gestión de **API keys, webhooks e importación de planning** y mostrar el cotejo con el planning en el detalle.
7. **Copias de seguridad** automáticas y restauración probada.
8. Pantalla pública de **política de privacidad**.
9. Código de 6 dígitos para iPhone (la PWA instalada no comparte sesión con Safari).
10. Registro de auditoría y 2FA para administración.

**Deuda técnica**
11. `App.jsx` (~2.300 líneas) y `index.js` (~1.900) monolíticos; sin pruebas de frontend; vulnerabilidades reportadas por `npm audit` en el backend; reintentos de webhooks.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Sin correo operativo no se puede entrar | Bloquea todo | Resend + dominio antes del piloto; plan B: Gmail SMTP o enlace manual |
| iPhone: enlace abre Safari, la PWA instalada no queda con sesión | Fricción de acceso | Código de 6 dígitos; indicar “entra desde la app instalada” |
| Datos personales en región fuera de la UE | Incumplimiento RGPD | Crear el servicio en `europe-west4` |
| SQLite en un volumen sin copias | Pérdida de datos | Backups automáticos antes de datos reales |
| GPS al fichar | Sensibilidad laboral | Preferir QR/NFC; GPS por zona; informar al personal |
| Interfaz actual poco usable en móvil | Baja adopción | Rediseño mobile-first antes del piloto |
| Un `main` actualiza todos los clientes a la vez | Regresiones | Migraciones aditivas; pruebas antes del merge; poder fijar versión por cliente |

## 8. Plan propuesto

| Fase | Contenido | Dependencias |
|------|-----------|--------------|
| **1. Interfaz mobile-first** | Sistema de diseño, navegación inferior, flujo del profesor (fichar, cargar clase, mis horas, informes), panel de administración responsive | — |
| **2. Puesta en marcha técnica** | DNS, Resend, dominios, región UE, instancia de Snowmotion, importar profesores | Datos de Snowmotion y acceso al DNS |
| **3. Prueba cerrada** | 2–3 profesores durante un mes completo: horas → confirmación → revisión → liquidación | Fases 1 y 2 |
| **4. Integraciones** | Pantalla de API keys/webhooks, conector con reservas, Drive (archivado y copias) | Feedback del piloto |
| **5. Escala** | Código de 6 dígitos, auditoría, 2FA, más clientes o multi-escuela | Resultados del piloto |

## 9. Decisiones que necesito de ti

1. ¿Priorizamos el **rediseño de la interfaz** antes de abrir el piloto? (recomendado)
2. ¿Dónde está hoy el **DNS** de `johelpastorino.com`, y quién puede crear registros? ¿O usamos un dominio de Snowmotion?
3. ¿Aprobamos **Resend** como proveedor de correo y verificamos su dominio?
4. **Lista de profesores de Snowmotion** (CSV) y quién será administrador.
5. Disciplinas, **primas e importes**, y **tarifa por profesor** (o por titulación) de Snowmotion.
6. ¿Se activa **GPS** en alguna zona o fichan solo con QR/NFC?
7. ¿Qué **sistema de reservas** usan, para planificar el conector del planning?
8. ¿Mergeamos ya la rama de **integraciones y RGPD** (`feat/rgpd-integraciones`)?

## 10. Referencias

`FUNCIONES.md` (catálogo detallado) · `ARQUITECTURA.md` · `API.md` · `INTEGRACIONES.md` · `RGPD.md` · `DEPLOY.md` · `MULTI-DESPLIEGUE.md` · `PILOTO-SNOWMOTION.md` · `PRUEBAS.md` · `ROADMAP.md`
