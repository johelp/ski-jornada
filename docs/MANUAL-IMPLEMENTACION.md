# Manual de implementación para un cliente real

Guía de extremo a extremo para poner en marcha la plataforma en una escuela, con **Snowmotion** como ejemplo. Está pensada para quien implanta (el proveedor) y para el responsable del cliente. Complementa `MULTI-DESPLIEGUE.md` (parte técnica), `OPERACION.md` (día a día), `RGPD.md` y `CHECKLIST-PRODUCCION.md`.

**Duración típica:** 2–3 semanas hasta abrir al equipo (1 de preparación técnica y legal, 1 de piloto cerrado, 1 de despliegue general) y **un mes completo** de piloto de liquidación antes de dar el proceso por cerrado.

---

## 0. Qué se entrega

| Pieza | Descripción |
|-------|-------------|
| Instancia propia | API y base de datos aisladas, web con dominio propio y correo desde su dominio |
| Cuenta de administración | Cuenta de la escuela (puede ser de empresa) que invita al equipo |
| Configuración inicial | Datos de la escuela, disciplinas, primas, tarifas, zonas de fichaje |
| Equipo cargado | Lista de profesores importada e invitada |
| Documentación legal | Contrato de encargo aceptado en la app, información de privacidad para el personal |
| Formación | Guías de administración y de profesor, sesión de 45 min con cada grupo |
| Soporte | Canal acordado durante el piloto y manual de operación |

## 1. Roles del proyecto

| Rol | Responsabilidad |
|-----|-----------------|
| **Responsable del cliente** (p. ej. dirección de Snowmotion) | Decide reglas (primas, tarifas, GPS), firma el contrato de encargo, cita al equipo |
| **Administración del cliente** | Cuenta principal: carga equipo, revisa horas, liquida |
| **Implantador** | Monta la instancia, forma, acompaña el piloto |
| **Asesor legal / laboral del cliente** | Revisa privacidad y contrato; valida cómo se firman las nóminas |

## 2. Información que hay que pedir al cliente (semana 0)

- [ ] **Datos de la escuela:** nombre legal, CIF, dirección, teléfono, email de contacto de privacidad, logotipo y color.
- [ ] **Cuenta de administración:** correo de empresa (p. ej. `administracion@escuela.com`) con 2FA y quién tiene acceso al buzón; opcionalmente cuentas personales para más administradores.
- [ ] **Dominio:** subdominio para la app (`<escuela>.<dominio>`) y quién gestiona su DNS.
- [ ] **Lista de profesores:** nombre, apellidos, **email personal que usan**, teléfono (opcional), jornada, horas semanales y **tarifa por hora** (CSV: `deploy/profesores.csv.example`).
- [ ] **Disciplinas** (esquí, snowboard…) y **primas** con su regla: importe y si es *por hora* o *por clase* (idioma, disca, repetida…).
- [ ] **Zonas de fichaje:** ubicaciones y modo (QR rotativo, GPS, NFC). Decidir si se usa **GPS** (ver `RGPD.md`, apartado 8; preferir QR/NFC).
- [ ] **Sistema de reservas:** cuál usan y si pueden exportar el **resumen mensual por instructor** (CSV) y el planning.
- [ ] **Nóminas:** ¿firmadas fuera de la plataforma (como en el piloto)? ¿se activará el módulo de documentos? Tamaño aproximado de sus PDF (ver `DIMENSIONAMIENTO.md`).
- [ ] **Conservación:** plazos acordados (4 años para el registro de jornada).
- [ ] **Calendario:** fecha de inicio de temporada, mes piloto y quiénes participan.

## 3. Fase 1 — Preparación legal y de datos (semana 1)

1. **Contrato de encargo del tratamiento.** Entregar `docs/legal/CONTRATO-ENCARGO-TRATAMIENTO.md` completado con los datos del proveedor y del cliente. Además de la firma en papel o electrónica, la cuenta principal **lo acepta en la app** en su primer acceso (queda constancia con fecha y versión).
2. **Información de privacidad al personal.** La app la muestra a cada persona en su primer acceso y la guarda como constancia; es una **información (art. 13), no un consentimiento** (la base es el contrato y la obligación legal). Entregar también `docs/legal/INFORMACION-PRIVACIDAD-PERSONAL.md` impresa o por correo, y comunicarlo a la representación legal de los trabajadores si la hay.
3. **Revisión por el asesor legal** del cliente de ambos textos y del tratamiento del GPS (si se usa).
4. **Variables legales de la instancia:** `PROVEEDOR_NOMBRE`, `PROVEEDOR_CIF`, `PROVEEDOR_EMAIL` y `DATOS_REGION` (aparecen en los textos).
5. **Decisión del módulo de documentos:** si las nóminas se firman fuera → `DOCUMENTOS_HABILITADOS=false`.

## 4. Fase 2 — Montaje técnico (semana 1)

Seguir `MULTI-DESPLIEGUE.md` y `PUESTA-EN-MARCHA.md`. Resumen:

1. **Backend** (Railway, **región UE**): servicio `api` desde el repositorio (`/backend`), volumen en `/data`, variables de `deploy/cliente.backend.env.template`. `JWT_SECRET` propio de la instancia; `ADMIN_EMAIL` = cuenta de administración; `ADMIN_NOMBRE=Administración` y `ADMIN_APELLIDOS` vacío si es de empresa.
2. **Frontend** (Cloudflare Pages): variables de `deploy/cliente.pages.env.template` (`VITE_API_URL`, `VITE_APP_NAME`, `VITE_COLOR_PRIMARIO`…).
3. **DNS:** `api.<escuela>` (solo DNS) y `<escuela>` (con proxy) hacia Railway y Pages.
4. **Correo:** dominio verificado en Resend (SPF/DKIM) y `EMAIL_FROM` del cliente.
5. **Comprobaciones:** `/api/salud` en verde, entrar con la cuenta de administración, recibir el enlace y el código, instalar la app.
6. **Copia de seguridad:** verificar la copia diaria y **probar una restauración** (`OPERACION.md`).

## 5. Fase 3 — Configuración con el cliente (semana 1–2, sesión de 90 min)

Con la administración del cliente, en la app, en este orden:

1. **Config:** nombre legal, CIF, dirección, teléfono y email de contacto. *Estos datos salen impresos en los registros de jornada (documento legal)*: no continuar sin completarlos.
2. **Aceptar** la información de privacidad y el contrato de encargo (pantalla en el primer acceso).
3. **Clases → Disciplinas y primas:** disciplinas y primas con importes y modo.
4. **Zonas:** crear las zonas, imprimir los QR (o grabar NFC) y fijar el modo de validación.
5. **Usuarios → Importar lista:** cargar el CSV **sin enviar invitaciones todavía**; revisar errores.
6. **Tarifas:** comprobar la tarifa por hora de cada profesor (*Usuarios → Editar*).
7. **Integraciones (opcional):** clave de API para el sistema de reservas, importar el planning del mes.
8. **Prueba de humo guiada:** que la administración cargue una clase de prueba como profesor (*Modo empleado*), la confirme y la revise.

## 6. Fase 4 — Piloto cerrado (semana 2)

1. **Elegir 2–3 profesores** de confianza (con distintos móviles: un iPhone y un Android).
2. **Invitarlos** (*Reenviar invitación* / *Invitar a los pendientes*). Comprobar: reciben el correo; entran por enlace **y** por código de 6 dígitos (en iPhone, con la app instalada); aceptan la información de privacidad; instalan la app.
3. **Uso real durante 1–2 semanas:** fichar, cargar clases, ver su informe. Anotar fricciones.
4. **Primer cierre:** al terminar el mes, confirmar horas, revisar (aprobar / discrepancia / corrección), **comparar con el resumen de reservas** (*Clases → Comparar con reservas*) y generar el informe económico.
5. **Reunión de cierre del piloto:** qué ajustar (primas, tarifas, textos, zonas) y *go / no-go*.

## 7. Fase 5 — Despliegue al equipo (semana 3)

1. **Sesión de formación** (45 min por grupo): instalar la app, entrar con código, fichar, cargar una clase, ver el informe. Material: `GUIA-PROFESOR.md` (1 página para imprimir o enviar).
2. **Invitar a todo el equipo** el mismo día de la formación (límite de correo: ver `DIMENSIONAMIENTO.md`; si son > 90 personas, invitar por tandas).
3. **Seguimiento:** *Usuarios* muestra quién sigue «Invitado · sin entrar»; reenviar y llamar si hace falta. Objetivo: 100 % activo en una semana.
4. **Canal de soporte** abierto las primeras dos semanas.

## 8. Primer mes de operación y cierre

- Semana 1: revisar fallos de correo (Resend), entradas fallidas y fichajes con incidencia.
- Fin de mes: **proceso de liquidación** (ver siguiente apartado).
- Reunión a los 30 días: indicadores (apartado 10) y plan de mejoras.
- Pasar la CSP de solo-informe a obligatoria; subir DMARC a `quarantine`.

## 9. Proceso mensual de liquidación (régimen)

| Día | Quién | Acción |
|-----|-------|--------|
| Últimos 3 días del mes | Profesores | Revisan y **confirman sus horas** (la app avisa a administración) |
| Día 1–3 | Administración | **Revisa** cada mes: aprueba, marca discrepancias o pide corrección; compara con el sistema de reservas |
| Día 3–5 | Profesores | Corrigen lo solicitado y reconfirman |
| Día 5 | Administración | Cierra: exporta el resumen (CSV/PDF) y lo pasa a nómina; consulta las **horas aprobadas** y los importes |
| Mensual | Administración | Descarga una copia de la base y la guarda fuera del servidor |

Reglas de negocio a **acordar por escrito** con el cliente: qué cuenta como «exceso» de jornada (la plataforma compara con `horas semanales / 5` por día), cómo se tratan los turnos que cruzan la medianoche y las horas «requeridas» que solo existen en el sistema de reservas.

## 10. Indicadores de éxito

| Indicador | Objetivo |
|-----------|----------|
| Profesores activos / invitados | 100 % en 1 semana |
| Meses confirmados a tiempo | ≥ 90 % a los 3 días de cierre |
| Diferencias con reservas en la primera comparativa | Identificadas y resueltas en el primer cierre |
| Tiempo medio de carga de una clase | < 15 s |
| Incidencias de acceso (enlace/código) por semana | < 3 tras el primer mes |

## 11. Riesgos habituales y respuesta

| Riesgo | Mitigación |
|--------|------------|
| El profesor no recibe el correo | Revisar spam; *Reenviar invitación*; comprobar el email de la lista |
| iPhone: el enlace se abre en el navegador y la sesión no pasa a la app | Usar el **código de 6 dígitos** dentro de la app instalada (está en el correo y en la pantalla de acceso) |
| Datos de la escuela sin completar en los informes | Paso 1 de la fase 3 y lista de verificación |
| Tarifas o primas distintas a las de reservas | Revisar con la comparativa; ajustar antes del primer cierre |
| Resistencia al cambio | Formación corta, guía de una página, administración como apoyo, empezar con el piloto |
| Pérdida de datos | Copia diaria + descarga semanal fuera + restauración probada |
| Cambio de normativa o de reglas internas | Reglas de negocio por escrito; registro de cambios (`CHANGELOG.md`) |

## 12. Entregables de cierre

- [ ] Acta de puesta en marcha (fecha, versión, variables no secretas, dominios).
- [ ] Contrato de encargo firmado y aceptación registrada en la app.
- [ ] Lista de personas con la **información de privacidad** recibida (*Usuarios → aceptaciones*).
- [ ] Informe del piloto (indicadores, incidencias, decisiones).
- [ ] Guías entregadas y plan de soporte.
- [ ] Copia de seguridad y restauración probadas; monitor de disponibilidad activo.
- [ ] `CHECKLIST-PRODUCCION.md` completo para la instancia.

## 13. Ejemplo: Snowmotion

| Tema | Decisión / dato |
|------|-----------------|
| Equipo | ~70 instructores en el pico (resumen real de febrero: 69 con actividad, ≈ 3.500 h/mes) |
| Nóminas | Se firman y se suben en otra plataforma → `DOCUMENTOS_HABILITADOS=false`; la instancia queda en ≈ 170 MB tras 4 años |
| Reservas | Cargar cada mes el *resumen por instructor* en *Comparar con reservas*; vincular los nombres una vez; revisar «NO ASIGNADO» (reservas sin instructor) |
| Cuenta de administración | Cuenta de empresa con 2FA; cuentas personales para quien revise horas |
| Acceso del equipo | Importar la lista de correos de Snowmotion e invitar; los profesores entran con su email |
| GPS | Preferir QR/NFC; GPS solo en pistas si es imprescindible, informado por escrito |
| Región | UE |
| Drive | Fase posterior (`PILOTO-SNOWMOTION.md`): archivado y copias |
