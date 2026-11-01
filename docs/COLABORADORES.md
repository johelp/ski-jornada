# Colaboradores y subcontratas · módulos apagables

Dos funciones de administración: llevar la cuenta de horas con escuelas y autónomos colaboradores, y apagar los módulos que una escuela no usa.

## 1. Colaboradores y subcontratas

### Para qué sirve

La escuela cubre horas de otras escuelas o autónomos cuando le faltan profesores, y a veces les presta los suyos. El módulo lleva esa cuenta:

- **Colaboradores:** escuelas o autónomos, con su **valor hora** pactado.
- **Horas dadas** (les cubrimos nosotros: nos deben) y **horas recibidas** (nos cubren ellos: les debemos), cargadas **por día**.
- **Saldo** en horas y en euros, siempre a la vista.
- **Saldar** el saldo por **pago** en dinero o por **compensación** (horas contra horas), total o parcial.
- **Extracto en PDF** (por día, con liquidaciones y saldo) para enviarlo al colaborador o liquidar.
- **Dashboard** con totales, horas por mes y saldo por colaborador, y un aviso en el panel de inicio.

> **Ejemplo:** le damos 5 h a la escuela A y la escuela A nos dio 2 h → saldo **a favor 3 h**. Con la hora a 30 € → **90 €**. Pueden saldarlo con un pago de 90 € o compensándolo en horas futuras.

### Carga rápida del día (lo habitual)

Al terminar la jornada, el operador repasa el planning y carga las horas del día en *Colaboradores → ⚡ Cargar el día* (es la pestaña que se abre por defecto). Pensada para móvil y para hacerse en segundos:

1. **Colaborador:** un toque (se recuerda el último).
2. **¿Qué pasó?:** *Les dimos horas* o *Nos dieron horas* (un toque; se conserva para la siguiente carga).
3. **Horas:** botones rápidos 0,5 · 1 · 1,5 · 2 · 3 · 4, o escribir otra cantidad.
4. **Referencia** (opcional): clase, grupo, quién cubrió.
5. **Enter** o el botón grande: queda cargado y el formulario se limpia (horas y referencia), listo para la siguiente.

Debajo aparece **lo cargado ese día** con el neto por colaborador y un ✕ para quitar una línea equivocada. Con ◀ ▶ se carga o revisa otro día (para el que se olvidó ayer). El valor hora es el del trato; si hace falta otro, se cambia desde la ficha del colaborador.

### Cómo se usa (administración)

1. **Colaboradores → + Nuevo:** nombre, tipo (escuela o autónomo), **valor hora** y, si quieres, correo, teléfono y contacto.
2. Entra en el colaborador → **+ Cargar horas:** día, *les dimos* o *nos dieron*, horas y nota. El valor hora se toma del trato (se puede cambiar en un movimiento concreto); **queda fijado en cada movimiento**, así que cambiar el trato más adelante no altera lo ya cargado.
3. **Horas por día:** se agrupan por día con el neto de cada uno. Cada movimiento tiene su estado (ver abajo). Puedes **editar**, **borrar** o **marcar como aceptada** (p. ej. confirmada por teléfono).
4. **Saldar:** elige pago o compensación, las horas (por defecto todo el saldo) y la fecha. El importe se propone con el valor hora y se puede ajustar. Una liquidación se puede **anular**.
5. **Imprimir extracto:** descarga el PDF de todo el historial o de un periodo (con saldo anterior y final).

### Estados de las horas

| Estado | Significado | Cuenta en el saldo |
|--------|-------------|--------------------|
| **Pendiente** | Cargadas por administración, aún sin respuesta | Sí |
| **Aceptada** | El colaborador (o administración, por teléfono) las confirmó | Sí |
| **En revisión** | El colaborador pide revisarlas y explica por qué | **No**, hasta aclararlas |

Modificar unas horas las devuelve a *Pendiente* y avisa al colaborador. Todo queda en el **registro de actividad**.

### Signo del saldo

**+ = a favor de la escuela** (nos deben) · **− = en contra** (les debemos). Saldo = Σ(dadas − recibidas, en horas y en euros al valor de cada movimiento) − Σ liquidaciones.

### Portal del colaborador (opcional)

El colaborador **no necesita usar la plataforma**: tú llevas la cuenta y le envías el extracto. Si prefieres que lo vea y lo acepte, dale acceso (necesita un correo):

1. En el colaborador → **Acceso al portal → Dar acceso y enviar invitación.** Entra por enlace o código de 6 dígitos, como el resto del equipo.
2. **Ve solo su cuenta:** saldo (desde su punto de vista), horas por día, liquidaciones. Puede **aceptar** o **pedir revisión** (explicando el motivo) y descargar su extracto.
3. Administración recibe un aviso en cada respuesta y el panel de inicio muestra lo que está en revisión.
4. **Quitar acceso** corta la sesión al instante.

La cuenta del colaborador **no puede** fichar, cargar clases ni entrar a administración: el servidor solo le permite su portal, sus avisos y lo básico de la sesión.

### Estadísticas

*Colaboradores → Estadísticas:* horas dadas y recibidas por mes (12 meses), saldo por colaborador, y totales: cuánto **nos deben**, cuánto **les debemos**, horas pendientes y en revisión.

## 2. Módulos apagables

*Config → Módulos.* Administración enciende o apaga:

| Módulo | Qué oculta |
|--------|-----------|
| Clases y primas | Carga y revisión de clases, economía, informe de clases |
| Días libres | Solicitudes de los profesores y su aprobación |
| Documentos | Nóminas, contratos y firmas |
| Comparar con reservas | Cotejo con el CSV del sistema de reservas |
| Integraciones y WhatsApp | Claves de API, webhooks, planning, WhatsApp |
| Avisos masivos | Avisos al equipo |
| Colaboradores y subcontratas | Este módulo |

- Un módulo apagado **desaparece del menú y del panel** y sus endpoints responden **404**. **No se borra ningún dato**: al volver a encenderlo está todo.
- **Esenciales (no se apagan):** fichaje, usuarios, informes de jornada, configuración, perfil.
- **Documentos** también se puede apagar **por despliegue** (`DOCUMENTOS_HABILITADOS=false`); en ese caso no se puede activar desde la app (la pantalla lo indica).
- Apagar *Integraciones* detiene también la API pública (`/api/v1/*`): quien la use dejará de recibir datos.
- Cada cambio queda en el registro de actividad (`config.modulos`).

## 3. Datos y privacidad

- Un **autónomo** es una persona física: su nombre, NIF, teléfono y correo son **datos personales**. Se tratan para gestionar el acuerdo de colaboración (base: ejecución del contrato). Hay que añadirlo al registro de tratamientos (`RGPD.md`) y, si el colaborador entra al portal, informarle.
- Una escuela colaboradora aporta solo datos de contacto de empresa.
- Los datos de colaboradores **no se borran** desde la app (se dejan **inactivos**), para conservar el historial contable de horas.

## 4. API (administración)

Todas con `Authorization: Bearer …` de una cuenta de administración. Ver `API.md`.

| Método | Ruta | Para qué |
|--------|------|----------|
| GET / POST | `/api/admin/colaboradores` | Listar con saldo · crear |
| GET | `/api/admin/colaboradores/estadisticas?meses=12` | Dashboard |
| GET | `/api/admin/colaboradores/dia?fecha=AAAA-MM-DD` | Todo lo cargado ese día (carga rápida) |
| GET / PUT | `/api/admin/colaboradores/:id` | Detalle (`?desde=&hasta=` para el extracto de un periodo) · editar |
| POST | `/api/admin/colaboradores/:id/horas` | Cargar horas |
| PUT / DELETE | `/api/admin/colaboradores/horas/:mid` | Editar (vuelve a pendiente) · borrar |
| POST | `/api/admin/colaboradores/horas/:mid/estado` | Marcar aceptada / pendiente |
| POST | `/api/admin/colaboradores/:id/liquidar` | Saldar (`tipo`: PAGO o COMPENSACION; sin `horas` salda todo) |
| DELETE | `/api/admin/colaboradores/liquidaciones/:lid` | Anular una liquidación |
| POST / DELETE | `/api/admin/colaboradores/:id/acceso` | Dar o quitar acceso al portal |
| GET / PUT | `/api/admin/modulos` | Ver o cambiar los módulos (`{ "off": ["libres"] }`) |
| GET | `/api/colaborador/mi` | Portal: su cuenta |
| POST | `/api/colaborador/horas/:mid/responder` | Portal: `{ accion: ACEPTAR \| REVISAR, nota }` |

`GET /api/config` incluye `modulos: { clave: true|false }` con lo que está activo.

## 5. Pruebas

El smoke (`backend/scripts/smoke.js`, secciones 6l y 6m) cubre: permisos, validaciones, el ejemplo de 3 h = 90 €, pagos parciales y totales, extracto por periodo, acceso al portal, aceptar y pedir revisión, que un colaborador no llega a nada más, avisos, panel y módulos apagados. El seed de ejemplo (`DATOS-DE-PRUEBA.md`) trae tres colaboradores: uno a favor (el ejemplo), uno en contra con horas en revisión y un pago parcial, y uno saldado.

## 6. Pendiente / decisiones

- El colaborador **solo acepta o pide revisar**; no carga horas propias. Si más adelante quiere proponerlas (que administración confirme), es una ampliación sencilla.
- No hay factura ni pago integrado: el extracto es la base para liquidar fuera de la plataforma.
- Los importes se calculan sin IVA ni retenciones; qué lleva cada trato lo decide la escuela con su asesor.
