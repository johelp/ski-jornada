# Plan: firma electrónica con Autofirma App

Estado: **plan, sin construir** (nov 2026). Fuente: *Manual del integrador de Autofirma App* (AGE). Se leyó hasta la firma de datos (§5.3); faltan por leer cofirma, contrafirma, lotes y los parámetros de PAdES, que están en el *Manual del integrador de Autofirma* (no disponible aún).

## 1. Objetivo y alcance

Que un documento del legajo (contrato, hoja mensual, etc.) pueda firmarse con **certificado electrónico o DNIe**, con una firma **electrónica avanzada** con validez legal, incrustada en el propio PDF (PAdES) y **comprobada por el servidor**.

Fuera de alcance: firma manuscrita en pantalla (se retiró: no tenía validez), firma cualificada en la nube (ViDeSigner u otras), sellado de tiempo cualificado.

## 2. Punto de partida (código actual)

- `POST /api/documentos/:id/firmar` acepta **cualquier PDF** y marca el documento como `FIRMADO`. **No comprueba que el PDF esté firmado.** Hoy «firmado» significa «el empleado subió un PDF».
- El flujo actual es: descargar el original → firmarlo fuera (Autofirma de escritorio, Adobe, a mano y escaneado) → subirlo.
- `DocumentoLegajo` no guarda quién firmó, con qué certificado ni si la firma es válida. La ficha del profesor no tiene DNI/NIF.
- La CSP del frontend (en modo informe) permite `script-src 'self'` y `connect-src https:`: `autoscript.js` debe servirse desde nuestro propio dominio.

## 3. Qué exige Autofirma App (del manual)

| Requisito | Consecuencia para nosotros |
|-----------|----------------------------|
| Tres servicios Java (WAR): almacenamiento, recuperación y firma trifásica | Servicio nuevo en Docker (Tomcat + JRE ≥ 1.8) además del backend Node |
| Los servicios de comunicación deben estar en el **mismo dominio** que la página que firma | Hay que servirlos bajo el dominio de la app (ruta), no desde otro dominio |
| iOS exige **HTTPS con certificado de confianza** para el dominio | Dominio propio con certificado válido |
| `autoscript.js` con **URL absolutas** a los servicios | Servirlo desde `frontend/public/` |
| Directorio temporal con cuota; los ficheros caducan (por defecto 1 min) | Volumen o directorio dedicado, `expTime` corto, `maxFileSize` acotado |
| Quien recibe la firma debe **comprobar que es válida** | Fase de verificación en servidor (ver §5) |
| El firmante necesita certificado válido (o DNIe con NFC y PIN) y la app instalada | Opcional por persona; ver §7 |

## 4. Fases

### Fase 0 — Honestidad del estado «firmado» (sin infraestructura nueva)

Aprovecha el flujo que ya existe (firmar fuera y subir):

1. Al subir el PDF, **detectar si contiene una firma digital** (estructura de firma del PDF). Si no la tiene, se acepta como «subido sin firma electrónica» y no como `FIRMADO` con validez.
2. Comprobar que el PDF subido **corresponde al original** (el contenido firmado empieza por el original: firma incremental) y calcular su **huella SHA-256**.
3. Extraer del certificado el **nombre del firmante, el emisor y las fechas de validez** y mostrarlos a administración.
4. Nuevo campo de **tipo de firma** (ver §6) y registro de actividad.

Es lo que da más valor por menos esfuerzo y también sirve a quien firme con Autofirma de escritorio en un ordenador.

### Fase 1 — Servicio Autofirma desplegado

1. Imagen Docker con Tomcat y los tres WAR (`afirma-signature-storage`, `afirma-signature-retriever`, `afirma-server-triphase-signer`). **Obtenerlos de la distribución oficial y confirmar la licencia** antes de redistribuir.
2. Servicio aparte en Railway con memoria dimensionada para Tomcat y un directorio temporal dedicado.
3. Configuración endurecida: `Access-Control-Allow-Origin` limitado a nuestro origen (por defecto es `*`), `verification.key` activada, `maxFileSize` bajo (documentos de unos pocos MB), `expTime` corto, `batch.*` mínimos.
4. Publicarlo **bajo el mismo dominio que la app** (regla de Cloudflare que enrute `/afirma-*` hacia el servicio). Requiere **dominio propio**.
5. Limitar abusos: los servicios son públicos y sin autenticación; limitar tasa y tamaño en Cloudflare.

### Fase 2 — Botón «Firmar con certificado» en el móvil

1. Servir `autoscript.js` desde `frontend/public/` y configurar `setServlets(...)` con URL absolutas.
2. En *Documentos*, el empleado pulsa **Firmar con certificado**: se descarga el PDF original, se firma en **PAdES** con Autofirma App y se devuelve al navegador.
3. El resultado se sube por el endpoint existente, que ahora aplica la verificación de la Fase 0 (y la de la Fase 3 cuando exista).
4. Si Autofirma App no está instalada: aviso previo con los enlaces a las tiendas y opción de reintentar.
5. Mantener siempre la vía alternativa (subir un PDF ya firmado) para quien no tenga certificado.

### Fase 3 — Verificación completa

La Fase 0 comprueba integridad y extrae datos, pero **no valida la cadena de confianza** (que el certificado lo emita un prestador reconocido, ni su revocación). Opciones a evaluar:

| Opción | Ventaja | Pega |
|--------|---------|------|
| Librería de validación de la UE (DSS, Java) junto al servicio Autofirma | Valida contra la lista de confianza europea, de código abierto | Más memoria y mantenimiento en la pieza Java |
| Servicio de validación de la administración (VALIDe / @firma) | Es el que cita el manual | Requiere alta como integrador; por confirmar condiciones |
| Solo integridad + datos del certificado (Fase 0) | Sin dependencias | No acredita la validez del certificado |

**Recomendación:** empezar con la Fase 0 etiquetando honestamente («firma íntegra, certificado no validado») y decidir la opción tras el piloto.

### Fase 4 — Firma de la escuela y cofirma (opcional)

Que la escuela firme también (cofirma) los contratos. Depende de los parámetros del manual de Autofirma completo; **se estudia después**.

## 5. Cambios de modelo (propuesta)

`DocumentoLegajo` (o tabla hija `FirmaDocumento`):

- `firmaTipo`: `SUBIDO` (PDF sin firma electrónica) · `CERTIFICADO_EXTERNO` (subido, con firma digital) · `AUTOFIRMA` (firmado dentro de la app).
- `firmaVerificada`: `NO_COMPROBADA` · `INTEGRA` · `VALIDA` (con cadena de confianza).
- `firmaHuella` (SHA-256 del PDF firmado), `firmanteNombre`, `firmaEmisor`, `firmaFechaCertificado`.
- **No guardar el NIF completo** salvo que haga falta: es dato personal (ver §7).
- Evento `documento.firmado` con `firmaTipo` y `firmaVerificada`; entrada en el registro de actividad.

Pruebas en el smoke: PDF sin firma → `SUBIDO`; PDF con firma digital de prueba → `INTEGRA`; PDF alterado tras firmar → rechazado o `NO_COMPROBADA`; permisos (solo el dueño o administración).

## 6. Riesgos y decisiones abiertas

1. **Certificado del equipo.** Muchos monitores de temporada pueden no tener certificado ni DNIe con NFC. **Preguntar a Snowmotion cuántos lo tienen antes de empezar las fases 1 y 2.** La Fase 0 no depende de eso.
2. **Dominio propio.** Sin él no se cumple el requisito del mismo dominio ni el HTTPS que pide iOS.
3. **iPhone y PWA instalada.** El salto a Autofirma App y la vuelta a la PWA hay que **probarlos en dispositivos reales**; el manual recomienda Safari.
4. **Privacidad.** El documento pasa por el servicio de almacenamiento (caduca en `expTime`); el certificado trae nombre y DNI. Actualizar `RGPD.md` (registro de tratamientos, aviso de privacidad) y limitar lo que se guarda.
5. **Servicio Java público.** Superficie nueva de ataque; endurecer la configuración y vigilar su memoria y disco.
6. **Escritorio.** El manual es de la **app móvil**. En ordenador el flujo es distinto (Autofirma de escritorio) y ya se cubre con «firmar fuera y subir».
7. **Qué documentos se firman** (contratos, hoja mensual de jornada) lo decide la escuela con su asesor; la ley no exige firma en el registro de jornada.

## 7. Orden recomendado

1. **Fase 0** (pequeña, sin infraestructura): comprobar y etiquetar las firmas subidas.
2. **Consulta a Snowmotion:** cuántos monitores tienen certificado o DNIe, y dominio propio.
3. Si compensa: **Fases 1 y 2** juntas (servicio + botón), con prueba en iPhone y Android reales.
4. **Fase 3** según el resultado del piloto y del asesor.
5. Documentar en `FUNCIONES.md`, `API.md`, `RGPD.md`, `DEPLOY.md` y `PLAN-DE-PRUEBAS-MVP.md` en cada fase.
