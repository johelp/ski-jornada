# Datos de prueba (seed completo)

El seed crea un escenario ficticio que permite probar **todas** las funciones de la plataforma. Las fechas son relativas a *hoy*: siempre hay un mes en curso, meses cerrados, revisiones, planning y documentos recientes. Es idempotente y solo toca las cuentas `@escuela.com`.

```bash
cd backend
export DATABASE_URL=file:./prisma/dev.db JWT_SECRET=prueba PASSWORD_LOGIN=true
npx prisma migrate deploy
node prisma/seed.js          # crea/renueva todo (no se ejecuta con NODE_ENV=production)
node index.js                # http://localhost:3000   ·   frontend: cd ../frontend && npm run dev
```

Sin correo configurado, el enlace de acceso se imprime en la consola del backend. En desarrollo el login con contraseña (`ski123`) aparece en la pantalla de acceso (sección «Solo desarrollo»).

## Cuentas

| Cuenta | Perfil | Para probar |
|--------|--------|-------------|
| `admin@escuela.com` | **Cuenta principal** (Ana Rodríguez) | Todo: roles, administradores, copia de seguridad, contrato de encargo aceptado |
| `administracion@escuela.com` | **Cuenta de empresa**, administración no principal, sin apellidos | Administración sin permisos de principal (no crea administradores) |
| `profesor@escuela.com` | Carlos Martínez, tarifa 20 € | Mes **con discrepancia**, clase marcada «A revisar», cotejo con planning, incidencia de fichaje |
| `laura.garcia@escuela.com` | Laura García, tarifa 18 € | Meses **aprobados**, nómina firmada y pendiente, está **fichada ahora** (presencia) |
| `miguel.torres@escuela.com` | Miguel Torres, media jornada, tarifa 16,5 € | Mes **confirmado sin revisar**, nota de administración en una clase, certificado pendiente |
| `sofia.perez@escuela.com` | Sofía Pérez, tarifa 22 € | **Corrección solicitada** (mes reabierto), **aceptación legal pendiente** (pantalla de privacidad al entrar), vacaciones pendientes |
| `raul.sintarifa@escuela.com` | Raúl, **sin tarifa** | Informes sin importes; comparativa con diferencia de importe |
| `pablo.invitado@escuela.com` | **Invitado que aún no entró** | Estado «Invitado · sin entrar», reenviar invitación |
| `elena.baja@escuela.com` | **De baja** | No puede entrar (401), aparece como inactiva |

## Datos generados

- **Escuela de ejemplo** completa (nombre, CIF ficticio `B00000000`, dirección, contacto) para ver bien los PDF.
- **3 zonas** (QR+GPS, solo QR, solo GPS), disciplinas y **primas con importes** (Idioma 3 €/h, Disca 2 €/h, Repetida 10 €/clase) y una prima inactiva.
- **Clases** de los últimos 4 meses con primas y notas; **confirmaciones** con tarifas congeladas; **revisiones** en todos los estados (aprobado, discrepancia, corrección) y marcas por clase.
- **Planning** del mes pasado con diferencias a propósito (una hora de más, una clase no cargada, un día que falta).
- **Fichajes** de las últimas 4 semanas con días de exceso, una **incidencia** y una persona **dentro ahora**.
- **Documentos PDF reales** (pendientes y firmados), registros de jornada enviados/firmados, **días libres** en los cuatro estados, **avisos**, **aceptaciones legales**, **vínculo de nombre** (alias), **registro de actividad**.
- **API key de demostración:** `sj_demo_clave_de_ejemplo_solo_pruebas_0001` (lectura, económico y planning) una segunda clave de **gestoría** (`sj_demo_gestoria_solo_lectura_pruebas_0002`, solo lectura y económico) y dos webhooks de ejemplo desactivados. Carlos y Laura tienen teléfono y **avisos de WhatsApp activados** (solo se envían si conectas un número en *Integraciones → WhatsApp*).
- **CSV de reservas de ejemplo** en `backend/prisma/demo/instructors_summary_*.csv` (no se versiona), con el mismo formato que exporta el sistema de reservas.

## Guion de pruebas por función

| Función | Cómo probarla | Resultado esperado |
|---------|---------------|--------------------|
| **Acceso por invitación** | Como `pablo.invitado@…` pide el enlace (consola) y entra | Pasa de «Invitado» a «Activo» en *Usuarios* |
| **Cuenta de empresa** | Entra como `administracion@…` → *Usuarios → + Nuevo* | No ofrece crear administradores (solo la principal) |
| **Baja** | `elena.baja@…` intenta entrar | 401 |
| **Importar lista** | *Usuarios → Importar lista* → *Ver ejemplo* → importar | Crea profesores; reimportar actualiza |
| **Aceptación legal** | Entra como `sofia.perez@…` | Pantalla bloqueante de privacidad; tras aceptar entra. Como admin, *Usuarios* → aceptaciones |
| **Fichar / QR / GPS** | Como profesor → *Fichar* (código de zona desde *Zonas*) | Registra entrada; *Salida rápida* registra salida |
| **Presencia** | Admin → *Presencia* | Laura figura «dentro» |
| **Cargar clase** | Profesor → *Clases* → 2 h + Idioma + Repetida | Se suma al mes con importe |
| **Totales mes/temporada** | Profesor → *Inicio* → Este mes / Temporada | Horas fichadas, días, horas de clase e importe |
| **Confirmar y bloquear** | Laura → confirmar el mes en curso | Ya no se puede editar |
| **Revisión** | Admin → *Clases* → Carlos (mes pasado) | Estado «Discrepancia», nota y clase «A revisar»; probar aprobar, corrección y comentario |
| **Reabrir mes** | Admin → *Reabrir mes* en un mes confirmado | El profesor puede editar |
| **Informe PDF de clases** | Profesor → *Informes → Clases y economía* → PDF | PDF con detalle e importes |
| **Registro de jornada (RD 8/2019)** | Profesor → *Informes → Jornada* → mes → PDF oficial | PDF con horas, excesos y datos de la escuela |
| **Planilla** | Admin → *Informes → Planilla* | Resumen por profesor del mes, exportable a CSV |
| **Cotejo con planning** | Admin → *Clases* → Carlos (mes pasado) | Tabla planificado vs cargado con diferencias |
| **Comparar con reservas** | Admin → *Clases → Comparar con reservas* → subir el CSV de `prisma/demo/` | Laura y Sofía coinciden; Carlos difiere en horas (vinculado por nombre); Miguel y Raúl difieren en importe; «INSTRUCTOR DESCONOCIDO» sin vincular; 24 h sin asignar |
| **Días libres** | Admin → *Solicitudes* | Pendientes (Sofía, Laura) para aprobar/rechazar con observación |
| **Documentos** | Laura → *Documentos* → abrir y subir el firmado; Admin → *Documentos* | Descarga protegida; los PDF son válidos |
| **Avisos y notificaciones** | Admin → *Avisos*; campana del profesor | Aviso individual o masivo con lectura |
| **Integraciones** | Admin → *Integraciones*; `curl -H "X-API-Key: sj_demo_…" …/api/v1/informe/AAAA-MM` | Claves, webhooks y planning por CSV; la API devuelve los informes |
| **Exportar mis datos** | Profesor → *Perfil → Exportar mis datos* | JSON con todos sus datos |
| **Registro de actividad** | Admin → *Usuarios → Actividad de administración* | Altas, bajas, roles, importaciones, revisiones |
| **Copia de seguridad** | Cuenta principal: `GET /api/admin/backup/descargar` | Archivo SQLite |
| **App instalable** | Móvil: instalar desde el aviso o «Añadir a pantalla de inicio» | Pantalla completa, atajos Fichar / Clase |

## Reiniciar el entorno de pruebas

```bash
cd backend && rm -f prisma/prisma/dev.db && npx prisma migrate deploy && node prisma/seed.js
```
