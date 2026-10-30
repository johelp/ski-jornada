#!/usr/bin/env node
// Prueba de humo de extremo a extremo de la API (profesor + administración).
//
// Uso (contra un backend LOCAL con datos demo y PASSWORD_LOGIN=true):
//   node scripts/smoke.js
// Contra otro entorno de PRUEBA (no producción: crea y borra datos):
//   BASE_URL=https://api-test.ejemplo.com ADMIN_TOKEN=... PROF_TOKEN=... PROF2_TOKEN=... node scripts/smoke.js
//
// Variables: BASE_URL (def. http://localhost:3000), ADMIN_EMAIL/PROF_EMAIL/PROF2_EMAIL + PASSWORD (def. cuentas demo / ski123).
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASS = process.env.PASSWORD || 'ski123';
const MES = process.env.SMOKE_MES || '2031-03';
const FECHA = `${MES}-10`;

let ok = 0, fail = 0;
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✔ ${nombre}`); } else { fail++; console.log(`  ✘ ${nombre} ${extra}`); }
};
const seccion = t => console.log(`\n${t}`);

async function http(method, ruta, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + ruta, { method, headers, body: payload });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
  return { status: r.status, data };
}

async function login(email, tokenEnv) {
  if (process.env[tokenEnv]) return process.env[tokenEnv];
  const r = await http('POST', '/api/auth/login', { body: { email, password: PASS } });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${email} (${r.status}). ¿PASSWORD_LOGIN=true y datos demo cargados?`);
  return r.data.token;
}

const pdf = nombre => {
  const f = new FormData();
  return { f, add: (campos) => {
    Object.entries(campos).forEach(([k, v]) => f.append(k, v));
    f.append('pdf', new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'], { type: 'application/pdf' }), nombre);
    return f;
  } };
};

(async () => {
  console.log(`Prueba de humo → ${BASE} · mes de prueba ${MES}`);
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@escuela.com', 'ADMIN_TOKEN');
  const prof = await login(process.env.PROF_EMAIL || 'profesor@escuela.com', 'PROF_TOKEN');
  const prof2 = await login(process.env.PROF2_EMAIL || 'laura.garcia@escuela.com', 'PROF2_TOKEN');
  const me = (await http('GET', '/api/auth/me', { token: prof })).data;

  seccion('1. Acceso y permisos');
  check('el servidor responde', (await http('GET', '/api/server-time')).status === 200);
  check('magic-link responde igual para un email inexistente', (await http('POST', '/api/auth/magic-link', { body: { email: 'nadie@no-existe.test' } })).data.success === true);
  check('sin token → 401', (await http('GET', '/api/clases/catalogo')).status === 401);
  check('profesor no entra a rutas de admin → 403', (await http('GET', '/api/admin/primas', { token: prof })).status === 403);
  check('profesor no puede revisar → 403', (await http('POST', '/api/admin/clases/revision', { token: prof, body: { profesorId: me.id, mes: MES, estado: 'APROBADO' } })).status === 403);

  seccion('2. Admin configura disciplinas, primas y tarifa');
  const cat = (await http('GET', '/api/clases/catalogo', { token: prof })).data;
  check('hay disciplinas y primas activas', cat.tipos.length > 0 && cat.primas.length > 0);
  const idioma = cat.primas.find(p => p.nombre === 'Idioma') || cat.primas[0];
  const repetida = cat.primas.find(p => p.nombre === 'Repetida') || cat.primas[1];
  check('admin fija prima por hora', (await http('PUT', `/api/admin/primas/${idioma.id}`, { token: admin, body: { importe: 3, modo: 'POR_HORA' } })).status === 200);
  check('admin fija prima por clase', (await http('PUT', `/api/admin/primas/${repetida.id}`, { token: admin, body: { importe: 10, modo: 'POR_CLASE' } })).status === 200);
  check('admin fija tarifa del profesor', (await http('PUT', `/api/admin/profesores/${me.id}`, { token: admin, body: { tarifaHora: 20 } })).status === 200);

  seccion('3. Profesor carga clases');
  const c1 = await http('POST', '/api/clases', { token: prof, body: { fecha: FECHA, horas: 2, tipoId: cat.tipos[0].id, primaIds: [idioma.id, repetida.id] } });
  check('carga 2 h + Idioma + Repetida', c1.status === 200 && c1.data.primas.length === 2);
  check('rechaza horas inválidas', (await http('POST', '/api/clases', { token: prof, body: { fecha: FECHA, horas: 0, tipoId: cat.tipos[0].id } })).status === 400);
  check('rechaza fecha inválida', (await http('POST', '/api/clases', { token: prof, body: { fecha: '10-03-2031', horas: 1, tipoId: cat.tipos[0].id } })).status === 400);
  const claseId = c1.data.id;
  let inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('informe: 2 h', inf.totalHoras === 2);
  check('informe: importe 2×20 + 2×3 + 10 = 56', inf.importeTotal === 56, `(obtuvo ${inf.importeTotal})`);
  check('el profesor ve su importe', inf.tarifaHora === 20);
  check('profesor edita su clase', (await http('PUT', `/api/clases/${claseId}`, { token: prof, body: { fecha: FECHA, horas: 2.5, tipoId: cat.tipos[0].id, primaIds: [idioma.id, repetida.id] } })).status === 200);
  check('profesor 2 no ve las clases del profesor 1', (await http('GET', `/api/clases/informe/${MES}`, { token: prof2 })).data.totalHoras === 0);
  check('profesor 2 no puede borrar la clase ajena', (await http('DELETE', `/api/clases/${claseId}`, { token: prof2 })).status === 404);

  seccion('4. Confirmación y bloqueo');
  check('confirma el mes', (await http('POST', '/api/clases/confirmar-mes', { token: prof, body: { mes: MES } })).status === 200);
  check('no puede editar un mes confirmado', (await http('PUT', `/api/clases/${claseId}`, { token: prof, body: { fecha: FECHA, horas: 1, tipoId: cat.tipos[0].id } })).status === 400);
  check('no puede cargar clases nuevas en ese mes', (await http('POST', '/api/clases', { token: prof, body: { fecha: FECHA, horas: 1, tipoId: cat.tipos[0].id } })).status === 400);
  await http('PUT', `/api/admin/profesores/${me.id}`, { token: admin, body: { tarifaHora: 99 } });
  inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('cambiar la tarifa no altera un mes confirmado', inf.importeTotal === 2.5 * 20 + 2.5 * 3 + 10, `(obtuvo ${inf.importeTotal})`);
  await http('PUT', `/api/admin/profesores/${me.id}`, { token: admin, body: { tarifaHora: 20 } });

  seccion('5. Administración revisa: detalle, anotaciones, discrepancia, corrección, aprobación');
  const res = (await http('GET', `/api/admin/clases/resumen/${MES}`, { token: admin })).data;
  const fila = res.find(r => r.id === me.id);
  check('resumen admin: aparece confirmado con horas', fila && fila.confirmado && fila.totalHoras === 2.5);
  const det = (await http('GET', `/api/clases/informe/${MES}?profesorId=${me.id}`, { token: admin })).data;
  check('admin ve el detalle día por día', det.detalle.length === 1 && det.profesor.id === me.id);
  check('anota una clase (REVISAR + nota)', (await http('PUT', `/api/admin/clases/${claseId}/anotacion`, { token: admin, body: { marca: 'REVISAR', nota: 'La reserva dice 2 h' } })).status === 200);
  check('rechaza revisión sin nota en discrepancia', (await http('POST', '/api/admin/clases/revision', { token: admin, body: { profesorId: me.id, mes: MES, estado: 'DISCREPANCIA' } })).status === 400);
  check('marca discrepancia con nota', (await http('POST', '/api/admin/clases/revision', { token: admin, body: { profesorId: me.id, mes: MES, estado: 'DISCREPANCIA', nota: 'Difiere de la reserva del día 10' } })).status === 200);
  inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('el profesor ve la discrepancia y la nota', inf.revision?.estado === 'DISCREPANCIA' && /reserva/.test(inf.revision.nota));
  check('el profesor ve la anotación de la clase', inf.detalle[0].marca === 'REVISAR' && /2 h/.test(inf.detalle[0].notaAdmin));
  let notifs = (await http('GET', '/api/notificaciones', { token: prof })).data;
  check('el profesor recibe una notificación', notifs.some(n => /Discrepancia/.test(n.titulo) && n.titulo.includes(MES)));
  check('admin pide corrección', (await http('POST', '/api/admin/clases/revision', { token: admin, body: { profesorId: me.id, mes: MES, estado: 'CORRECCION', nota: 'Ajustá a 2 h' } })).status === 200);
  inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('pedir corrección reabre el mes', inf.confirmado === false && inf.revision.estado === 'CORRECCION');
  check('el profesor corrige', (await http('PUT', `/api/clases/${claseId}`, { token: prof, body: { fecha: FECHA, horas: 2, tipoId: cat.tipos[0].id, primaIds: [idioma.id, repetida.id] } })).status === 200);
  check('el profesor reconfirma', (await http('POST', '/api/clases/confirmar-mes', { token: prof, body: { mes: MES } })).status === 200);
  inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('tras reconfirmar queda pendiente de revisión', inf.revision?.estado === 'PENDIENTE');
  check('admin aprueba', (await http('POST', '/api/admin/clases/revision', { token: admin, body: { profesorId: me.id, mes: MES, estado: 'APROBADO', nota: 'Horas correctas' } })).status === 200);
  inf = (await http('GET', `/api/clases/informe/${MES}`, { token: prof })).data;
  check('el profesor ve “Horas correctas”', inf.revision?.estado === 'APROBADO' && inf.revision.nota === 'Horas correctas');

  seccion('6. Documentos (legajo)');
  const subida = await http('POST', '/api/admin/documentos', { token: admin, form: pdf('nomina.pdf').add({ profesorId: me.id, tipo: 'NOMINA', nombre: 'Nómina de prueba', mes: MES }) });
  check('admin sube un documento al profesor', subida.status === 200 && subida.data.documento?.archivoUrl);
  const docId = subida.data.documento?.id;
  const url = subida.data.documento?.archivoUrl;
  const lista = (await http('GET', '/api/documentos/mis-documentos', { token: prof })).data;
  check('el profesor ve su documento', lista.some(d => d.id === docId));
  check('profesor 2 no lo ve en su lista', !(await http('GET', '/api/documentos/mis-documentos', { token: prof2 })).data.some(d => d.id === docId));
  check('el archivo exige sesión → 401', (await http('GET', url)).status === 401);
  check('el dueño descarga el archivo', (await http('GET', url, { token: prof })).status === 200);
  check('otro profesor no puede descargarlo → 403', (await http('GET', url, { token: prof2 })).status === 403);
  check('admin puede descargarlo', (await http('GET', url, { token: admin })).status === 200);
  check('rechaza rutas con caracteres raros', (await http('GET', '/uploads/documentos/..%2Findex.js', { token: admin })).status !== 200);
  const firmado = await http('POST', `/api/documentos/${docId}/firmar`, { token: prof, form: pdf('firmado.pdf').add({}) });
  check('el profesor sube el documento firmado', firmado.status === 200 && firmado.data.documento?.estado === 'FIRMADO');
  check('admin ve el documento firmado', (await http('GET', firmado.data.documento.firmaUrl, { token: admin })).status === 200);
  check('profesor 2 no puede firmar un documento ajeno', (await http('POST', `/api/documentos/${docId}/firmar`, { token: prof2, form: pdf('x.pdf').add({}) })).status === 403);

  seccion('6b. Integraciones y datos personales');
  const nk = await http('POST', '/api/admin/integraciones/keys', { token: admin, body: { nombre: 'smoke', scopes: ['lectura', 'planning'] } });
  check('admin crea una API key', nk.status === 200 && nk.data.key?.startsWith('sj_'));
  check('profesor no puede crear API keys → 403', (await http('POST', '/api/admin/integraciones/keys', { token: prof, body: { nombre: 'x' } })).status === 403);
  const hk = { 'X-API-Key': nk.data.key };
  const api = (m, r, body) => fetch(BASE + r, { method: m, headers: { ...hk, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(async x => ({ status: x.status, data: await x.json() }));
  check('API sin key → 401', (await http('GET', '/api/v1/profesores')).status === 401);
  check('un JWT de usuario no sirve en /api/v1 → 401', (await http('GET', '/api/v1/profesores', { token: admin })).status === 401);
  const lp = await api('GET', '/api/v1/profesores');
  check('API de lectura lista profesores sin tarifas', lp.status === 200 && lp.data.length > 0 && !('tarifaHora' in lp.data[0]));
  const pl = await api('POST', '/api/v1/planning', { reemplazarMes: MES, items: [{ email: me.email, fecha: FECHA, horas: 3, referencia: 'S-1' }, { email: 'nadie@no-existe.test', fecha: FECHA, horas: 1 }] });
  check('importa planning y avisa de emails desconocidos', pl.status === 200 && pl.data.importadas === 1 && pl.data.sinProfesor.length === 1);
  const cot = (await http('GET', `/api/clases/informe/${MES}?profesorId=${me.id}`, { token: admin })).data.planning;
  check('admin ve el cotejo planificado vs cargado', cot && cot.totalPlanificadas === 3);
  const ex = await http('GET', '/api/auth/me/exportar', { token: prof });
  check('el profesor exporta sus datos (sin contraseña)', ex.status === 200 && ex.data.perfil && !('password' in ex.data.perfil));
  check('webhook con URL no https se rechaza', (await http('POST', '/api/admin/integraciones/webhooks', { token: admin, body: { url: 'ftp://x' } })).status === 400);
  await http('DELETE', `/api/admin/integraciones/keys/${nk.data.id}`, { token: admin });
  check('una key eliminada deja de funcionar', (await api('GET', '/api/v1/profesores')).status === 401);

  seccion('6c. Comparativa con el sistema de reservas');
  const nombreMayus = `${me.nombre} ${me.apellidos}`.toUpperCase();
  const desconocido = `ZZZ NADIE ${Date.now()}`; // único por ejecución: el alias queda guardado
  const cmp = await http('POST', '/api/admin/comparativa', { token: admin, body: { mes: MES, filas: [
    { profesor: nombreMayus, salario: 20, totalHoras: 2, total: 56, primas: { Idioma: 6, Repetida: 10 } },
    { profesor: desconocido, salario: 10, totalHoras: 5, total: 50 },
    { profesor: 'NO ASIGNADO ', totalHoras: 40, total: 0 },
  ] } });
  const filaCmp = cmp.data.resultado?.find(r => r.profesor?.id === me.id);
  check('compara y reconoce al profesor por nombre', cmp.status === 200 && filaCmp && filaCmp.via === 'nombre');
  check('horas e importe coinciden → OK', filaCmp?.estado === "OK", `(estado ${filaCmp?.estado}, dif ${JSON.stringify(filaCmp?.diferencia)})`);
  check('compara las primas por nombre', filaCmp?.primas.some(p => p.nombre === 'Idioma' && p.diferencia === 0));
  check('un nombre desconocido queda sin vincular', cmp.data.resultado.some(r => r.estado === 'SIN_COINCIDENCIA'));
  check('detecta las reservas sin instructor asignado', cmp.data.sinAsignar?.totalHoras === 40);
  const dif = await http('POST', '/api/admin/comparativa', { token: admin, body: { mes: MES, filas: [{ profesor: nombreMayus, salario: 20, totalHoras: 5, total: 100 }] } });
  check('marca diferencia de horas', dif.data.resultado[0].estado === 'DIFERENCIA_HORAS' && dif.data.resultado[0].diferencia.horas === -3);
  check('el alias se guarda', (await http('POST', '/api/admin/comparativa/alias', { token: admin, body: { nombreExterno: desconocido, profesorId: me.id } })).status === 200);
  const cmp2 = await http('POST', '/api/admin/comparativa', { token: admin, body: { mes: MES, filas: [{ profesor: desconocido, salario: 20, totalHoras: 2, total: 56 }] } });
  check('con el alias reconoce al instructor', cmp2.data.resultado[0].via === 'alias');
  check('el profesor no puede comparar → 403', (await http('POST', '/api/admin/comparativa', { token: prof, body: { mes: MES, filas: [] } })).status === 403);

  seccion('6d. Acceso: lista de profesores, invitaciones, bajas y roles');
  const emailTmp = `smoke.${Date.now()}@ejemplo.test`;
  const imp = await http('POST', '/api/admin/profesores/importar', { token: admin, body: { filas: [
    { nombre: 'Prueba', apellidos: 'Smoke', email: emailTmp, tipoJornada: 'COMPLETA', horasContrato: 30, tarifaHora: '17,5' },
    { nombre: '', apellidos: 'Sin nombre', email: 'no-es-un-email' },
  ], invitar: false } });
  check('importa la lista: crea válidos y rechaza inválidos', imp.status === 200 && imp.data.creados === 1 && imp.data.errores.length === 1);
  const listaUsr = (await http('GET', '/api/admin/profesores', { token: admin })).data;
  const tmp = listaUsr.find(u => u.email === emailTmp);
  check('el invitado figura como pendiente (aún no se adhirió)', tmp && tmp.adheridoAt === null && tmp.tarifaHora === 17.5);
  check('reimportar es idempotente (actualiza)', (await http('POST', '/api/admin/profesores/importar', { token: admin, body: { filas: [{ nombre: 'Prueba', apellidos: 'Smoke 2', email: emailTmp }] } })).data.actualizados === 1);
  check('la importación no toca a los administradores', (await http('POST', '/api/admin/profesores/importar', { token: admin, body: { filas: [{ nombre: 'X', email: 'admin@escuela.com' }] } })).data.errores.length === 1);
  check('reenvía la invitación a un pendiente', (await http('POST', `/api/admin/profesores/${tmp.id}/invitar`, { token: admin })).status === 200);
  check('el profesor no puede importar ni invitar → 403', (await http('POST', '/api/admin/profesores/importar', { token: prof, body: { filas: [{ nombre: 'a', email: 'a@b.co' }] } })).status === 403);
  const adminMe = (await http('GET', '/api/admin/profesores', { token: admin })).data.find(u => u.email === (process.env.ADMIN_EMAIL || 'admin@escuela.com'));
  check('no puede darse de baja a sí mismo', (await http('PUT', `/api/admin/profesores/${adminMe.id}`, { token: admin, body: { activo: false } })).status === 400);
  check('la cuenta principal no se da de baja', (await http('DELETE', `/api/admin/profesores/${adminMe.id}`, { token: admin })).status === 400);
  const p2 = listaUsr.find(u => u.email === (process.env.PROF2_EMAIL || 'laura.garcia@escuela.com'));
  check('crea una cuenta de empresa (administración sin apellidos)', (await http('POST', '/api/admin/profesores', { token: admin, body: { nombre: 'Administración', apellidos: '', email: `empresa.${Date.now()}@ejemplo.test`, role: 'ADMIN' } })).status === 200);
  check('un profesor sin apellidos se rechaza', (await http('POST', '/api/admin/profesores', { token: admin, body: { nombre: 'Solo', email: `x.${Date.now()}@ejemplo.test` } })).status === 400);
  check('la cuenta principal cambia roles', (await http('PUT', `/api/admin/profesores/${p2.id}/rol`, { token: admin, body: { role: 'ADMIN' } })).status === 200);
  check('…y puede revertirlos', (await http('PUT', `/api/admin/profesores/${p2.id}/rol`, { token: admin, body: { role: 'PROFESOR' } })).status === 200);
  check('no se cambia el rol de la cuenta principal', (await http('PUT', `/api/admin/profesores/${adminMe.id}/rol`, { token: admin, body: { role: 'PROFESOR' } })).status === 400);
  // Baja → la sesión del usuario deja de funcionar al instante
  check('antes de la baja su sesión funciona', (await http('GET', '/api/clases/catalogo', { token: prof2 })).status === 200);
  await http('PUT', `/api/admin/profesores/${p2.id}`, { token: admin, body: { activo: false } });
  check('tras la baja su sesión se revoca de inmediato → 401', (await http('GET', '/api/clases/catalogo', { token: prof2 })).status === 401);
  await http('PUT', `/api/admin/profesores/${p2.id}`, { token: admin, body: { activo: true } });
  check('al reactivarlo recupera el acceso', (await http('GET', '/api/clases/catalogo', { token: prof2 })).status === 200);
  const aud = (await http('GET', '/api/admin/auditoria?limit=50', { token: admin })).data;
  check('queda registro de bajas, altas y cambios de rol', ['usuario.baja', 'usuario.alta', 'usuario.rol', 'usuario.importacion'].every(a => aud.some(x => x.accion === a)));
  await http('PUT', `/api/admin/profesores/${tmp.id}`, { token: admin, body: { activo: false } });

  seccion('6e. Operación: salud y copia de seguridad');
  const salud = await http('GET', '/api/salud');
  check('el chequeo de salud comprueba la base de datos', salud.status === 200 && salud.data.ok === true);
  const bk = await http('GET', '/api/admin/backup/descargar', { token: admin });
  const cab = bk.status === 200 && bk.data.byteLength > 1000 ? Buffer.from(bk.data.slice(0, 15)).toString('latin1') : '';
  check('la cuenta principal descarga una copia SQLite válida', cab === 'SQLite format 3');
  check('el profesor no puede descargar copias → 403', (await http('GET', '/api/admin/backup/descargar', { token: prof })).status === 403);
  check('una ruta inexistente de la API devuelve 404 JSON', (await http('GET', '/api/no-existe', { token: admin })).status === 404);

  seccion('7. Limpieza');
  await http('POST', '/api/admin/clases/reabrir', { token: admin, body: { profesorId: me.id, mes: MES } });
  check('elimina la clase de prueba', (await http('DELETE', `/api/clases/${claseId}`, { token: prof })).status === 200);

  console.log(`\nResultado: ${ok} correctas, ${fail} con error`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\nError inesperado:', e.message); process.exit(2); });
