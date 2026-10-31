# Seguridad

## Cómo informar de una vulnerabilidad

Escribe de forma privada a la persona responsable del proyecto (propietario del repositorio en GitHub) con:
- una descripción del problema y su impacto,
- los pasos para reproducirlo,
- la versión o el *commit* afectado.

Por favor, **no abras un *issue* público** ni publiques el detalle hasta que haya una corrección. Responderemos lo antes posible y te avisaremos cuando esté resuelto.

## Qué hay implementado

Resumen (detalle en `docs/ARQUITECTURA.md`, `docs/ACCESO-Y-ALTAS.md` y `docs/RGPD.md`):
- Acceso por invitación y enlace de un solo uso; sin registro público; baja con revocación inmediata.
- Cada petición se contrasta con la base (usuario activo, rol vigente).
- Limitación de intentos (IP y email), cabeceras de seguridad (Helmet en la API; `_headers` en la web).
- Archivos laborales solo para administración y el propio titular; API externa con claves por alcance; webhooks firmados.
- Registro de actividad de administración; copias de seguridad; arranque que se niega a funcionar con configuración insegura.

## Buenas prácticas para quien opera una instancia

Ver `docs/OPERACION.md`: secretos y rotación, 2FA en todas las cuentas, copias fuera del servidor y respuesta ante incidentes.
