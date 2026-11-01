// Textos legales generados por escuela: información de privacidad (art. 13 RGPD) y contrato de encargo de tratamiento (art. 28).
// IMPORTANTE: son una base técnica y deben ser revisados por el asesor legal del cliente (ver docs/RGPD.md).
// Cambiar VERSION cuando cambie un texto: la app vuelve a pedir la aceptación.

const VERSION = { PRIVACIDAD: '1.0', ENCARGO: '1.0' };
const TIPOS = Object.keys(VERSION);

// Qué documentos debe aceptar cada usuario: todos reciben la información de privacidad;
// la cuenta principal acepta además el contrato de encargo en nombre de la escuela.
const requeridosPara = user => (user.role === 'COLABORADOR' ? [] : user.esPrincipal ? ['PRIVACIDAD', 'ENCARGO'] : ['PRIVACIDAD']);

function contexto(cfg, opciones = {}) {
  return {
    escuela: (cfg.nombre || '').trim() || '[nombre de la escuela]',
    cif: (cfg.cif || '').trim() || '[CIF]',
    direccion: (cfg.direccion || '').trim() || '[dirección]',
    contacto: (cfg.email || '').trim() || 'la administración de la escuela',
    proveedor: process.env.PROVEEDOR_NOMBRE || 'el proveedor de la plataforma',
    proveedorCif: process.env.PROVEEDOR_CIF || '',
    proveedorContacto: process.env.PROVEEDOR_EMAIL || '',
    region: process.env.DATOS_REGION || 'la Unión Europea',
    documentos: opciones.documentosHabilitados !== false,
  };
}

function privacidad(cfg, opciones) {
  const c = contexto(cfg, opciones);
  return {
    documento: 'PRIVACIDAD', version: VERSION.PRIVACIDAD, titulo: 'Información sobre el tratamiento de tus datos',
    intro: `${c.escuela} utiliza esta plataforma para el control horario y la gestión de las clases y horas de su equipo. Te explicamos qué datos se tratan, para qué y qué derechos tienes.`,
    secciones: [
      { titulo: 'Quién es el responsable', parrafos: [`${c.escuela}, CIF ${c.cif}, ${c.direccion}. Contacto para cualquier cuestión sobre tus datos: ${c.contacto}.`] },
      { titulo: 'Qué datos se tratan', items: [
        'Identificación y contacto: nombre, apellidos, correo electrónico y, si lo indicas, teléfono.',
        'Registro de jornada: fecha y hora de entrada y salida y zona de fichaje. Si la zona usa GPS, también tu ubicación en el instante de fichar y la distancia al punto de trabajo.',
        'Clases impartidas: fecha, horas, disciplina, primas y notas.',
        'Tarifa por hora e importes calculados, cuando tu escuela los configura.',
        'Solicitudes de días libres y los comentarios de administración sobre tus horas.',
        'Avisos y notificaciones, y datos técnicos de acceso (enlaces de entrada).',
        ...(c.documentos ? ['Documentos laborales que tu escuela suba a tu ficha (por ejemplo, nóminas).'] : []),
      ] },
      { titulo: 'Para qué y con qué base legal', items: [
        'Control horario: cumplir la obligación legal de registro de jornada (art. 34.9 del Estatuto de los Trabajadores y art. 6.1.c RGPD).',
        'Gestión de clases, horas, primas y liquidación: ejecución de tu contrato de trabajo (art. 6.1.b RGPD).',
        'Cuenta de acceso y comunicaciones: ejecución del contrato y seguridad del servicio (art. 6.1.b y 6.1.f RGPD).',
        'Días libres: gestión de tu relación laboral. No necesitamos ningún diagnóstico médico; basta el motivo genérico.',
      ] },
      { titulo: 'No se basa en tu consentimiento', parrafos: ['Los datos anteriores se tratan porque son necesarios para tu relación laboral y por obligación legal, no porque los consientas. Al marcar la casilla confirmas únicamente que has recibido y leído esta información.'] },
      { titulo: 'Ubicación', parrafos: ['La ubicación solo se consulta en el momento de fichar y únicamente en las zonas configuradas con GPS. No hay seguimiento continuo ni se guardan rutas. Tu escuela puede ofrecer fichaje por QR o NFC sin ubicación.'] },
      { titulo: 'Quién puede ver tus datos', items: [
        'La administración de tu escuela. Cada profesor ve solo sus propios datos.',
        'Su gestoría laboral y las administraciones públicas, cuando la ley lo exige.',
        `${c.proveedor}, que presta la plataforma como encargado del tratamiento, y los proveedores tecnológicos que utiliza (alojamiento, red de distribución y envío de correo), con contratos que protegen tus datos.`,
        `Los datos se alojan en ${c.region}.`,
      ] },
      { titulo: 'Cuánto tiempo se conservan', items: [
        'Registro de jornada: 4 años (art. 34.9 ET).',
        'Resto de datos: durante la relación laboral y los plazos legales que correspondan.',
        'Después se suprimen o se anonimizan.',
      ] },
      { titulo: 'Tus derechos', parrafos: [
        `Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${c.contacto}. Desde la app puedes descargar una copia de tus datos en Perfil → Exportar mis datos.`,
        'Si consideras que no tratamos bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).',
      ] },
      { titulo: 'Seguridad', parrafos: ['El acceso es por invitación y enlace personal de un solo uso; las conexiones van cifradas; cada profesor solo accede a lo suyo; las bajas cortan el acceso al instante y las acciones de administración quedan registradas.'] },
    ],
    casilla: 'He leído la información sobre el tratamiento de mis datos.',
    pie: `Versión ${VERSION.PRIVACIDAD}`,
  };
}

function encargo(cfg, opciones) {
  const c = contexto(cfg, opciones);
  return {
    documento: 'ENCARGO', version: VERSION.ENCARGO, titulo: 'Contrato de encargo del tratamiento de datos',
    intro: `Contrato entre ${c.escuela} (CIF ${c.cif}), como responsable del tratamiento, y ${c.proveedor}${c.proveedorCif ? ` (CIF ${c.proveedorCif})` : ''}, como encargado, conforme al artículo 28 del RGPD.`,
    secciones: [
      { titulo: 'Objeto y duración', parrafos: [`${c.proveedor} presta a ${c.escuela} la plataforma de control horario y gestión de clases, y para ello trata datos personales por su cuenta. El contrato dura lo que el servicio y termina con él.`] },
      { titulo: 'Datos e interesados', items: [
        'Interesados: el personal de la escuela (profesores y administración).',
        'Datos: identificación y contacto, registro de jornada (con ubicación solo al fichar en zonas con GPS), clases, horas, primas, tarifas e importes, solicitudes de días libres, comentarios y registros de actividad.',
        ...(c.documentos ? ['Documentos laborales subidos por la escuela, si activa ese módulo.'] : []),
      ] },
      { titulo: 'Obligaciones del encargado', items: [
        'Tratar los datos solo siguiendo las instrucciones documentadas de la escuela.',
        'Garantizar la confidencialidad de las personas con acceso.',
        'Aplicar medidas de seguridad adecuadas: acceso por invitación y enlace de un solo uso, cifrado en tránsito, control de acceso por rol, registro de actividad de administración, copias de seguridad.',
        'Recurrir solo a los subencargados autorizados: alojamiento (Railway), red y dominio (Cloudflare) y envío de correo (Resend); comunicar cualquier cambio con 30 días de antelación y exigirles las mismas obligaciones.',
        `Alojar los datos en ${c.region} y no transferirlos fuera sin garantías adecuadas.`,
        'Asistir a la escuela en el ejercicio de derechos de los interesados, en evaluaciones de impacto y en la notificación de brechas.',
        'Notificar a la escuela cualquier brecha de seguridad sin dilación y como máximo en 48 horas desde que la detecte.',
        'Al terminar el servicio, devolver o suprimir los datos y certificar el borrado en un plazo de 30 días.',
        'Poner a disposición de la escuela la información necesaria para demostrar el cumplimiento y permitir auditorías razonables.',
      ] },
      { titulo: 'Obligaciones de la escuela', items: [
        'Contar con base legal para los tratamientos y ofrecer a su personal la información del art. 13 RGPD (la plataforma la muestra a cada persona en su primer acceso).',
        'Decidir si usa GPS en alguna zona y justificarlo; preferir QR o NFC cuando basten.',
        'Mantener actualizada la lista de profesores y dar de baja a quien deje de trabajar.',
        'Proteger la cuenta de administración (acceso al buzón y doble verificación del correo).',
      ] },
    ],
    casilla: `Declaro que tengo capacidad para obligar a ${c.escuela} y acepto, en su nombre, este contrato de encargo del tratamiento.`,
    pie: `Versión ${VERSION.ENCARGO}${c.proveedorContacto ? ` · Contacto del encargado: ${c.proveedorContacto}` : ''}`,
  };
}

const generar = { PRIVACIDAD: privacidad, ENCARGO: encargo };

module.exports = { VERSION, TIPOS, requeridosPara, generar };
