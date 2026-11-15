import { useRef, useState, useEffect } from 'react';

// Firma dibujada con el dedo o el ratón. El servidor la estampa en una página final del PDF.
// Es una firma electrónica SIMPLE: deja constancia de recepción y lectura, no tiene el valor de una firma con certificado.
export default function FirmaPantalla({ onFirmar, onCancelar, enviando }) {
  const lienzo = useRef(null);
  const trazando = useRef(false);
  const [hayTrazo, setHayTrazo] = useState(false);
  const [acepto, setAcepto] = useState(false);

  // Ajusta la resolución del lienzo a la pantalla (nítido en móviles de alta densidad)
  useEffect(() => {
    const c = lienzo.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  }, []);

  const punto = e => { const r = lienzo.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const empezar = e => {
    e.preventDefault(); lienzo.current.setPointerCapture?.(e.pointerId);
    trazando.current = true; const [x, y] = punto(e); const ctx = lienzo.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke(); setHayTrazo(true);
  };
  const mover = e => { if (!trazando.current) return; e.preventDefault(); const [x, y] = punto(e); const ctx = lienzo.current.getContext('2d'); ctx.lineTo(x, y); ctx.stroke(); };
  const acabar = () => { trazando.current = false; };
  const borrar = () => { const c = lienzo.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHayTrazo(false); };

  const enviar = () => onFirmar(lienzo.current.toDataURL('image/png'));

  return (
    <div className="firma-pantalla">
      <p className="firma-ayuda">Firma con el dedo o el ratón dentro del recuadro.</p>
      <canvas ref={lienzo} className="firma-lienzo" role="img" aria-label="Recuadro para dibujar tu firma"
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={acabar} onPointerCancel={acabar} onPointerLeave={acabar} />
      <label className="firma-acepto">
        <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
        <span>He recibido y leído este documento. Entiendo que esta firma deja constancia de su <b>recepción y visualización</b>, pero <b>no es una firma con certificado</b> ni tiene su valor legal.</span>
      </label>
      <div className="firma-botones">
        <button type="button" className="btn-sm" onClick={enviar} disabled={!hayTrazo || !acepto || enviando}>{enviando ? 'Firmando…' : '✍ Firmar documento'}</button>
        <button type="button" className="btn-ghost" onClick={borrar} disabled={!hayTrazo || enviando}>Borrar</button>
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={enviando}>Cancelar</button>
      </div>
      {!hayTrazo && <small className="form-hint">Dibuja tu firma para continuar.</small>}
      {hayTrazo && !acepto && <small className="form-hint">Marca la casilla para poder firmar.</small>}
    </div>
  );
}
