# Puesta en marcha — guía paso a paso

Estado de partida: backend desplegado en Railway (`ski-jornada` / `api`), frontend en Cloudflare Pages (`ski-jornada`), repositorio en `main`. Faltan el **correo** (sin él no llegan los enlaces de acceso), los **dominios** y la **región UE**.

Hay dos caminos. Empieza por el **A** para probar hoy y completa el **B** antes de abrir el piloto.

> El DNS de `johelpastorino.com` está en **BanaHosting** (servidores de nombres `ns8964/ns8965.banahosting.com`); el dominio está registrado en NameSilo. Los registros se crean en el panel de BanaHosting (cPanel → *Zone Editor / Editor de zona DNS*).

---

## A. Camino rápido: probar online sin dominio propio (≈ 10 min)

Usa las direcciones que ya existen: API `https://api-production-ce9c.up.railway.app` y app `https://ski-jornada.pages.dev`.

### A1. Resend (lo haces tú)
1. Crear cuenta en resend.com con `johelpastorino@gmail.com`.
2. *API Keys → Create API Key* (permiso *Sending access*). Copiar la clave `re_…`.
3. Sin verificar dominio, Resend solo envía **al correo de la cuenta**: sirve para entrar como administrador.

### A2. Variables (las puedo cargar yo cuando me pases la clave)
**Railway → `api` → Variables**
| Variable | Valor |
|----------|-------|
| `RESEND_API_KEY` | la clave `re_…` |
| `EMAIL_FROM` | `Ski Jornada <onboarding@resend.dev>` |
| `FRONTEND_URL` | `https://ski-jornada.pages.dev` |

**Cloudflare Pages → `ski-jornada` → Settings → Variables (Production)**
| Variable | Valor |
|----------|-------|
| `VITE_API_URL` | `https://api-production-ce9c.up.railway.app` |

Después hay que **re-desplegar Pages** (la URL de la API se incrusta al compilar) y Railway se reinicia solo.

### A3. Probar
1. Abrir `https://ski-jornada.pages.dev` → *Acceso administración* → email `johelpastorino@gmail.com` → llega el enlace.
2. Dentro: **Modo empleado** (arriba) cambia a la vista del profesor con la misma cuenta, para probar fichar, cargar clases y el informe.
3. Cargar disciplinas/primas (*Clases → Disciplinas y primas*), tarifa en *Usuarios → Editar* y crear datos de prueba.

Para probar con **otros profesores reales** hay que pasar al camino B (verificar dominio en Resend).

---

## B. Camino definitivo (dominios, correo y UE)

### B1. DNS en BanaHosting
Entrar al cPanel de BanaHosting → *Zone Editor* de `johelpastorino.com` → *Add record*:

| Tipo | Nombre | Valor | Para qué |
|------|--------|-------|----------|
| CNAME | `api.skijornada` | `smkt3k3g.up.railway.app` | API en Railway |
| TXT | `_railway-verify.api.skijornada` | `railway-verify=eb8639384a97fcfe7a19fcec20ecadf219169fc0dd24a5953ecd1b3803a6ec89` | Verificación de Railway |
| CNAME | `skijornada` | `ski-jornada.pages.dev` | Frontend en Pages |

Comprobar la propagación (5–30 min): `dig +short CNAME api.skijornada.johelpastorino.com`. En Railway (*Settings → Networking*) el dominio pasa a *Verified* y se emite el certificado.

### B2. Dominio de la app en Cloudflare Pages
*Workers & Pages → `ski-jornada` → Custom domains → Set up a domain* → `skijornada.johelpastorino.com`. Pages valida el CNAME del paso anterior. Si se queda en *Verifying* mucho tiempo (el DNS no está en Cloudflare), la alternativa es delegar solo `skijornada` a Cloudflare o mover los servidores de nombres del dominio a Cloudflare (gratis).

### B3. Resend con dominio propio
1. Resend → *Domains → Add Domain* → `skijornada.johelpastorino.com` (región UE si la ofrece).
2. Resend muestra registros **MX, TXT (SPF) y TXT (DKIM)**: crearlos tal cual en el Zone Editor de BanaHosting.
3. Esperar a *Verified* y entonces: `EMAIL_FROM=Ski Jornada <no-reply@skijornada.johelpastorino.com>`.

### B4. Variables finales
- Railway: `FRONTEND_URL=https://skijornada.johelpastorino.com`.
- Pages: `VITE_API_URL=https://api.skijornada.johelpastorino.com`, y opcionales `VITE_APP_NAME`, `VITE_ESCUELA_LUGAR`, `VITE_COLOR_PRIMARIO`. Re-desplegar.

### B5. Región UE (antes de cargar datos reales)
El servicio actual está en `us-west2`. Para datos reales de Snowmotion hay que crear el servicio y el volumen en `europe-west4` (en Railway un servicio con volumen vive en una sola región, así que se crea uno nuevo y se mueve la configuración). Mientras sea una instancia de pruebas no hace falta.

### B6. Instancia de Snowmotion
Seguir `MULTI-DESPLIEGUE.md` con su dominio, su administrador (`ADMIN_EMAIL`), `DOCUMENTOS_HABILITADOS=false` (las nóminas se firman fuera) y la carga de profesores (`import-profesores.js`).

### B7. Verificación final
- [ ] `https://api.skijornada.johelpastorino.com/api/server-time` responde.
- [ ] Entrar como administrador y como profesor (enlace por correo real).
- [ ] Instalar la app en un Android y en un iPhone y entrar.
- [ ] Cargar una clase, confirmar el mes, revisar desde administración.
- [ ] Probar la comparativa con el CSV de reservas.
- [ ] Copias de seguridad configuradas y restauración probada (ver `RGPD.md`).

---

## Datos para probar

| Dónde | Cómo entrar |
|-------|-------------|
| **Local** (`PASSWORD_LOGIN=true` + `node prisma/seed.js`) | `admin@escuela.com` y `profesor@escuela.com` (también `laura.garcia@…`, `miguel.torres@…`, `sofia.perez@…`), clave `ski123`. El seed trae fichajes, zonas, disciplinas y primas de ejemplo |
| **Online, tras el camino A** | `johelpastorino@gmail.com` como administrador (enlace al correo). El profesor se prueba con *Modo empleado* |
| **Online, tras el camino B** | Cualquier profesor dado de alta con su email real |

Las cuentas de demostración **no existen** en el servidor online y nunca se activa `PASSWORD_LOGIN` en producción.
