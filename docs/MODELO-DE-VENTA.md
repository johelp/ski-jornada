# Modelo de venta, costes y gestión centralizada de clientes

Estado: **propuesta para decidir** (nov 2026). Todas las cifras son **estimaciones**: los precios de los proveedores cambian y deben revisarse en sus páginas antes de firmar con un cliente. Cuando se cierre el primer cliente real, sustituir las estimaciones por costes medidos.

## 1. Qué se vende

Una **instalación propia por escuela** (backend, base de datos y frontend aislados, con su dominio, marca y correo), más puesta en marcha, formación y mantenimiento. No es un SaaS multiempresa: cada cliente tiene su despliegue (ver `MULTI-DESPLIEGUE.md` y `MANUAL-DESPLIEGUE-CLIENTE.md`).

Ventajas para vender: datos aislados por cliente (argumento RGPD), dominio y marca propios, y un fallo o una actualización de un cliente no afecta a otro.

## 2. Servicios necesarios por cliente y coste estimado

| Servicio | Para qué | Plan | Coste estimado |
|----------|----------|------|----------------|
| Railway (API + volumen) | Backend y base SQLite | Uso por consumo; instancia pequeña | 5–10 USD/mes por cliente |
| Cloudflare Pages | Frontend (PWA) y landing de acceso | Gratuito | 0 |
| Resend | Correo (invitaciones, avisos, recuperar acceso) | Gratuito hasta ~3.000 correos/mes | 0 (20 USD/mes si se supera) |
| Dominio del cliente | Marca y correo propios | Lo paga el cliente, o ~10–15 EUR/año | ~1 EUR/mes |
| Notificaciones push | Avisos en el móvil | Sin coste (estándar Web Push) | 0 |
| Copias de seguridad externas | Segunda copia fuera de Railway | Bucket de objetos pequeño | 0,5–2 USD/mes |
| Monitorización | Aviso si cae | Servicio gratuito de pings | 0 |

**Coste de infraestructura por cliente: ≈ 7–14 USD/mes** (≈ 85–170 USD/año). Con documentos PDF el volumen crece (ver `DIMENSIONAMIENTO.md`), pero sigue siendo pequeño.

Costes **fijos tuyos** (no por cliente): cuenta de Railway en plan de equipo si se quiere acceso para más de una persona (≈ 20 USD/mes), gestor de contraseñas, y tu tiempo de soporte.

## 3. Propuesta de precios

Dos conceptos: alta única y cuota mensual por tamaño de plantilla (monitores activos en temporada).

| Tramo | Monitores activos | Alta única | Cuota mensual |
|-------|-------------------|------------|---------------|
| Pequeña | hasta 20 | 600 EUR | 79 EUR |
| Media | 21–60 | 900 EUR | 149 EUR |
| Grande | 61–120 | 1.400 EUR | 249 EUR |
| A medida | más de 120 o integraciones | presupuesto | presupuesto |

La cuota incluye: alojamiento, actualizaciones, copias, soporte por WhatsApp/correo en horario laboral y los avisos push y por correo. No incluye: cambios a medida, integraciones con otros sistemas, ni formación presencial.

Opciones a valorar:

- **Cuota estacional** (solo meses de temporada, con modo «archivo» el resto del año): atractiva para escuelas de esquí, pero los datos deben conservarse durante el periodo legal (`RGPD.md`).
- **Descuento de piloto** al primer cliente a cambio de caso de éxito.
- **Contrato anual** con precio cerrado.

### Margen orientativo (escuela media, 40 monitores)

| Concepto | Importe |
|----------|---------|
| Ingreso año 1 | 900 + 12 × 149 = **2.688 EUR** |
| Infraestructura | ≈ 130 EUR |
| Soporte y actualizaciones (≈ 3 h/mes) | tu tiempo |
| Margen bruto antes de tu tiempo | **≈ 2.550 EUR (95 %)** |

El coste real es **tiempo**, no infraestructura. Por eso lo importante es que desplegar y actualizar sea casi automático (sección 4).

## 4. Centralizar la gestión: opciones

### Opción A (recomendada ahora): una instancia por cliente, gestionadas desde un panel central

Mantener el modelo actual y añadir una **capa de control** tuya:

1. **Registro de clientes** (`clientes.yml` en un repositorio privado, sin secretos): nombre, tramo, dominio, proyecto de Railway, proyecto de Pages, versión desplegada, fecha de alta y de renovación.
2. **Un solo código, versiones etiquetadas.** Hoy cada fusión a `main` despliega solo. Con varios clientes conviene desplegar por **anillos**: `main` actualiza solo la demo; las etiquetas `vX.Y.Z` las toman primero un cliente piloto y después el resto. Así un fallo no llega a todos a la vez.
3. **Script de despliegue y estado** (`scripts/flota.js`, por construir): recorre el registro, consulta `/api/salud` de cada cliente (ya devuelve `version` y `commit`) y muestra una tabla con quién va en qué versión, quién está caído y a quién le toca actualizar. Para actualizar usa la API de Railway y de Cloudflare Pages.
4. **Migraciones automáticas.** El arranque ya ejecuta `prisma migrate deploy`, así que actualizar es publicar la versión y comprobar `/api/salud`.
5. **Secretos fuera del repositorio**, en un gestor (variables por cliente según las plantillas de `deploy/`).
6. **Alertas**: monitor de disponibilidad por cliente, aviso si la versión difiere de la esperada y si la última copia es antigua.
7. **Copias y restauración** probadas por cliente (ver `OPERACION.md`).

Esfuerzo estimado de construir la capa: pequeño-medio (registro + script de estado + script de despliegue por anillos). Escala bien hasta ~10–15 clientes.

### Opción B (más adelante): multiempresa en una sola instancia

Una única API y base de datos con una columna de escuela en cada tabla. Ventaja: un solo despliegue y menos coste por cliente. Pega: es una **refactorización grande** (todas las consultas, permisos, exportaciones y pruebas deben filtrar por escuela), aumenta el riesgo de que un fallo exponga datos entre clientes y complica el argumento RGPD de aislamiento. Solo compensa a partir de unas 15–20 escuelas.

### Recomendación

Empezar con la **opción A**, construir la capa de control cuando se cierre el segundo cliente (con uno solo basta el manual) y reevaluar la opción B si se supera la veintena de clientes.

## 5. Panel central: qué debería mostrar

| Dato | Fuente |
|------|--------|
| Versión y commit desplegados | `/api/salud` de cada cliente |
| Estado (arriba/abajo) y tiempo de respuesta | monitor de disponibilidad |
| Fecha de la última copia | registro de copias |
| Fecha de renovación y tramo | `clientes.yml` |
| Variables que faltan (VAPID, correo, región) | comprobación contra la plantilla |
| Incidencias abiertas | registro de soporte |

## 6. Pasos siguientes

1. Decidir tramos y precios (revisar con el piloto de Snowmotion).
2. Confirmar precios actuales de Railway y Resend antes de presupuestar.
3. Revisar con asesor legal el contrato de servicio y el encargo de tratamiento (`RGPD.md`, `legal/`).
4. Preparar un modelo de contrato y una hoja de oferta de una página.
5. Construir el registro de clientes y `scripts/flota.js` al cerrar el segundo cliente.
6. Definir qué cubre el soporte (horario, tiempos de respuesta) y qué se cobra aparte.
