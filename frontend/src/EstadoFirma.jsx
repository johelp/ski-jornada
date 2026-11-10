// Estado de la firma de un PDF subido (lo calcula el servidor al recibirlo; ver docs/PLAN-AUTOFIRMA.md).
// «Firma electrónica íntegra» = lleva firma digital con certificado y el contenido no se ha tocado desde que se firmó.
// Eso no significa que el certificado esté validado ante un prestador. Sin certificado (manuscrita escaneada o certificado propio) también
// se acepta como firmado, pero se etiqueta aparte.
const ETIQUETA = {
  INTEGRA: ['Firma electrónica íntegra', 'aprobado', 'El PDF lleva firma electrónica con certificado y no se ha modificado desde que se firmó.'],
  INTEGRA_AUTOFIRMADA: ['Firmado, sin certificado reconocido', 'pendiente', 'Lleva una firma digital hecha con un certificado propio (autofirmado): el documento no se tocó, pero ningún prestador de confianza respalda la identidad del firmante.'],
  CON_CAMBIOS: ['Con cambios tras firmar', 'pendiente', 'La firma es correcta, pero se añadió contenido al PDF después de firmarlo.'],
  NO_COMPROBADA: ['Firma sin comprobar', 'pendiente', 'El PDF lleva firma, pero no se ha podido comprobar automáticamente.'],
  SIN_FIRMA_ELECTRONICA: ['Firmado, sin certificado', 'pendiente', 'Se subió como firmado, pero no lleva firma electrónica ni certificado (por ejemplo, firma manuscrita escaneada).'],
};
const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES') : '—');

export default function EstadoFirma({ doc, detalle = false }) {
  const est = doc.firmaEstado;
  if (!est || !ETIQUETA[est]) return null;
  const [texto, clase, ayuda] = ETIQUETA[est];
  const firmas = doc.firmaInfo?.firmas || [];
  return (
    <span className="firma-estado">
      <span className={`estado-badge ${clase}`} title={ayuda}>{texto}</span>
      {detalle && (firmas.length > 0 || est === 'SIN_FIRMA_ELECTRONICA') && (
        <details className="firma-detalle">
          <summary>Ver comprobación</summary>
          <p>{ayuda}</p>
          {firmas.map((f, i) => (
            <p key={i}>
              <b>{f.firmante || 'Firmante desconocido'}</b>{f.emisor ? ` · emisor: ${f.emisor}` : ''}<br />
              {f.fechaDeclarada && <>Firmado (según el firmante): {fecha(f.fechaDeclarada)}<br /></>}
              {f.certDesde && <>Certificado válido del {fecha(f.certDesde)} al {fecha(f.certHasta)}{f.certVigente === false ? ' — no vigente al firmar' : ''}<br /></>}
              {f.autofirmado && <>Certificado propio: lo emite el mismo que firma.<br /></>}
              {f.nota && <>{f.nota}</>}
            </p>
          ))}
          {doc.firmaInfo?.conservaOriginal === false && est !== 'SIN_FIRMA_ELECTRONICA' && <p>El PDF se reescribió al firmar: compruébalo visualmente con el original.</p>}
          {doc.firmaHuella && <p className="firma-huella">Huella SHA-256: {doc.firmaHuella.slice(0, 16)}…</p>}
          {est !== 'SIN_FIRMA_ELECTRONICA' && <p className="firma-nota">No se ha validado el certificado ante un prestador de confianza ni su vigencia o revocación.</p>}
        </details>
      )}
    </span>
  );
}
