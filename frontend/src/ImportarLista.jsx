import { useState } from 'react';
import Icono from './Iconos';

const CAMPOS = {
  nombre: ['nombre', 'name'], apellidos: ['apellidos', 'apellido', 'surname'], email: ['email', 'correo', 'mail', 'e-mail'],
  telefono: ['telefono', 'teléfono', 'tel', 'phone'], tipoJornada: ['tipojornada', 'jornada'], horasContrato: ['horascontrato', 'horas'],
  tarifaHora: ['tarifahora', 'tarifa', 'salario'],
};
const EJEMPLO = 'nombre,apellidos,email,telefono,tarifaHora\nCarlos,Martínez,carlos@escuela.com,+34600000002,18\nLaura,García,laura@escuela.com,,16.5\n';

// Lee el texto pegado o el CSV (separador coma, punto y coma o tabulador; con o sin cabecera)
function leerLista(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lineas.length) return [];
  const sep = [';', '\t', ','].find(s => lineas[0].includes(s)) || ',';
  const filas = lineas.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
  const tieneCabecera = !filas[0].some(c => c.includes('@'));
  const cab = tieneCabecera ? filas.shift().map(c => c.toLowerCase().replace(/[\s_-]/g, '')) : ['nombre', 'apellidos', 'email', 'telefono'];
  const idx = {};
  Object.entries(CAMPOS).forEach(([campo, alias]) => { idx[campo] = cab.findIndex(c => alias.includes(c)); });
  return filas.map(f => Object.fromEntries(Object.entries(idx).map(([campo, i]) => [campo, i >= 0 ? (f[i] ?? '') : ''])));
}

// Carga de la lista de profesores: quien está en la lista puede entrar con su email (se "adhiere" al primer acceso)
export default function ImportarLista({ api, h, toast$, onTerminado, onCerrar }) {
  const [texto, setTexto] = useState('');
  const [invitar, setInvitar] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const filas = leerLista(texto);
  const validas = filas.filter(f => f.nombre && /^\S+@\S+\.\S+$/.test(f.email));

  const importar = async () => {
    setEnviando(true);
    try {
      const r = await api.post('/api/admin/profesores/importar', { filas, invitar }, { headers: h() });
      setResultado(r.data); onTerminado?.();
    } catch (e) { toast$(e.response?.data?.error || 'Error al importar', 'error'); }
    finally { setEnviando(false); }
  };

  return (
    <div className="card">
      <div className="card-header"><h2>Importar lista de profesores</h2>
        <button className="btn-ghost" onClick={onCerrar} aria-label="Cerrar"><Icono n="cerrar" size={20} /></button></div>
      <p className="form-hint">Pega la lista o sube un CSV con <strong>nombre, apellidos y email</strong> (opcionales: teléfono, jornada, horas, tarifa). Solo podrán entrar las personas que estén en la lista.</p>
      <div className="action-buttons" style={{ margin: '10px 0' }}>
        <label className="btn-sm" style={{ cursor: 'pointer' }}><Icono n="mas1" size={18} /> Subir archivo
          <input type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }}
            onChange={async e => { const f = e.target.files?.[0]; if (f) { setTexto(await f.text()); setResultado(null); } e.target.value = ''; }} /></label>
        <button className="btn-sm" onClick={() => setTexto(EJEMPLO)}>Ver ejemplo</button>
      </div>
      <div className="form-group"><label htmlFor="lista-txt">Lista</label>
        <textarea id="lista-txt" rows="7" spellCheck={false} value={texto} placeholder={EJEMPLO}
          onChange={e => { setTexto(e.target.value); setResultado(null); }} /></div>
      {texto && <p className="form-hint">{validas.length} de {filas.length} filas válidas{filas.length - validas.length > 0 ? ` · ${filas.length - validas.length} se omitirán (sin nombre o con email inválido)` : ''}.</p>}
      <label className="opcion" style={{ margin: '10px 0' }}>
        <input type="checkbox" checked={invitar} onChange={e => setInvitar(e.target.checked)} />
        <span><strong>Enviar la invitación ahora</strong><small>Cada profesor recibe un correo con su enlace de acceso. Si lo desmarcas, podrás invitarlos más tarde.</small></span>
      </label>
      <button className="btn-primary" disabled={!validas.length || enviando} onClick={importar}>
        {enviando ? 'Importando…' : `Importar ${validas.length || ''} profesores`}
      </button>
      {resultado && (
        <div className="revision revision-aprobado" role="status" style={{ marginTop: 14 }}>
          <strong>{resultado.creados} creados · {resultado.actualizados} actualizados{resultado.invitados ? ` · ${resultado.invitados} invitaciones en camino` : ''}</strong>
          {resultado.errores.length > 0 && <p>{resultado.errores.length} con error: {resultado.errores.slice(0, 5).map(e => `fila ${e.fila} (${e.motivo})`).join('; ')}</p>}
        </div>
      )}
    </div>
  );
}
