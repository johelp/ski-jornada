# Piloto: Snowmotion

Primera escuela piloto. Objetivos: **optimizar la gestión documental** (nóminas que el profesor recibe, firma y devuelve) y el **control horario**. La empresa trabaja con Google Drive, así que se analiza cómo integrarlo.

## 1. Flujo documental objetivo

```
Gestoría/administración ──▶ nómina PDF ──▶ plataforma ──▶ profesor la abre ──▶ la firma ──▶ sube el PDF firmado
                                                │                                              │
                                                └── (opcional) copia en Drive ◀────────────────┘
```

**Hoy en la plataforma (✅):** el admin sube cada PDF al profesor (tipo Nómina, mes) → el profesor recibe correo y aviso → abre el original → sube la versión firmada (o firma dibujada) → el admin ve “Firmado” y descarga. Los archivos están protegidos (solo admin y el profesor dueño).

**Fricciones que queremos quitar:**
1. Subir las nóminas una a una (con ~20–40 profesores cada mes).
2. Que los PDFs firmados vivan solo en la plataforma y no en el Drive de la empresa.
3. Respaldo: los archivos están en un volumen de Railway sin copia automática.

## 2. Opciones de integración con Drive

| Opción | Cómo funciona | Esfuerzo | Riesgos / requisitos |
|--------|---------------|----------|----------------------|
| **A. Sin API (carga masiva + exportación)** | Subir varios PDFs de una vez; la plataforma asigna cada uno al profesor por el nombre del archivo (`apellidos_nombre.pdf` o email). Botón “Descargar firmadas del mes (ZIP)” para guardarlas en Drive a mano | Bajo (1–2 días) | Cero dependencias externas. Un paso manual al final |
| **B. Carpeta de Drive como bandeja de entrada** | La administración deja los PDFs en `Nóminas/AAAA-MM/`. Un botón “Importar desde Drive” (o un proceso programado) los lee con una **cuenta de servicio** y los asigna por nombre | Medio (3–5 días) | Un admin de Google Workspace debe crear la cuenta de servicio y compartirle la carpeta. Convención estricta de nombres |
| **C. Archivado automático en Drive** | Cada PDF firmado (y el informe mensual de horas) se copia a `Firmadas/AAAA-MM/` en Drive. La empresa conserva su sistema de registro | Medio (2–4 días, comparte base con B) | Misma cuenta de servicio con permiso de escritura |
| **D. Selector de Drive (Google Picker)** | El admin elige archivos desde Drive dentro de la plataforma, con su propia cuenta | Medio-alto | Consentimiento OAuth por usuario; puede exigir verificación de la app de Google |
| **E. Backup nocturno a Drive** | Copia de la base y los archivos a una carpeta de Drive | Bajo-medio | Resuelve el respaldo; no es integración documental |

### Recomendación

1. **Piloto (semana 1–2): opción A.** Rápida, sin credenciales de Google y suficiente para validar el flujo con Snowmotion.
2. **Después (según feedback): B + C con una cuenta de servicio** dentro de una **unidad compartida** de Drive: entrada de nóminas desde carpeta y archivado de firmadas. Es la integración que mejor encaja con “usamos Drive”.
3. **E (backup) en paralelo**, porque protege los datos del piloto desde el primer día.

Se descarta D de inicio: más fricción de permisos para poca ganancia.

### Decisiones necesarias para B/C/E
- ¿Existe **Google Workspace** con administrador que pueda crear una cuenta de servicio y compartirle carpetas/unidad compartida?
- Estructura de carpetas y **nombre de los archivos** que genera la gestoría (¿ya identifican al profesor? ¿por apellidos, DNI, email?).
- Quién puede ver las carpetas en Drive (las nóminas son datos personales).

## 3. Firma de las nóminas: qué valor tiene

- La **firma dibujada** de la plataforma es un “conforme” práctico, **sin validez legal de firma electrónica**.
- Para el recibí de nómina suele bastar un justificante de recepción, pero conviene que el asesor laboral de Snowmotion confirme qué necesita (firma manuscrita escaneada, firma digital, o solo constancia de entrega y lectura).
- Si hace falta firma con validez: **Autofirma (FNMT)** o un servicio tipo **ViDeSigner** (ver `ROADMAP.md`). Mientras tanto la subida del PDF firmado por el profesor cubre el flujo.

## 4. Protección de datos (RGPD)

Las nóminas y las horas son **datos personales de empleados**.
- Alojar en región UE (Railway: `europe-west4`; confirmar al crear el servicio).
- Firmar un **encargo de tratamiento** entre Snowmotion (responsable) y el proveedor del servicio; revisar los de Railway, Cloudflare, Resend y Google.
- Acceso mínimo: solo administración y el propio profesor (ya implementado); en Drive, carpetas restringidas.
- Definir **plazo de conservación** y procedimiento de baja de un empleado.
- Backups cifrados o en una ubicación con acceso restringido.

## 5. Alta del piloto (resumen)

1. Seguir `MULTI-DESPLIEGUE.md` con el dominio de Snowmotion (o un subdominio).
2. Cargar la lista de profesores: Snowmotion envía un CSV con `nombre,apellidos,email,telefono,tipoJornada,horasContrato,tarifaHora,rol` (ver `deploy/profesores.csv.example`) y se importa con `import-profesores.js`.
3. El administrador de Snowmotion configura disciplinas, primas, tarifas y zonas.
4. Prueba cerrada con 2–3 profesores durante un mes: horas → confirmación → revisión → liquidación, y una nómina de prueba firmada.
5. Ajustes y apertura al resto del equipo.

## 6. Datos que necesitamos de Snowmotion

- [ ] Lista de profesores (CSV) y quién será administrador.
- [ ] Dominio/subdominio y remitente de correo deseado.
- [ ] Disciplinas (esquí, snowboard…) y primas con sus importes; tarifas por hora por profesor (o por titulación).
- [ ] Zonas de fichaje (ubicaciones) y modo de validación.
- [ ] Ejemplo de nómina PDF y su convención de nombres.
- [ ] Respuesta sobre Google Workspace y la estructura de carpetas en Drive.
- [ ] Qué sistema de reservas usan (para planificar la importación del planning).
