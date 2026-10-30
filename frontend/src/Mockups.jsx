// Simulaciones de las pantallas reales de la app (HTML/CSS con datos de ejemplo, sin imágenes).
// Son decorativas: se ocultan a lectores de pantalla y la landing describe cada una en texto.

export const PANTALLAS = {
  profesor: [
    { id: 'inicio', titulo: 'Inicio', texto: 'Reloj, botón de fichar y los totales del mes en curso o de la temporada.' },
    { id: 'clase', titulo: 'Cargar clase', texto: 'Horas, disciplina y primas en pocos toques, pensado para una mano.' },
    { id: 'informe', titulo: 'Mi informe', texto: 'Horas, importe estimado y el visto bueno de administración.' },
  ],
  admin: [
    { id: 'resumen', titulo: 'Resumen del mes', texto: 'Horas, importe y estado de cada profesor de un vistazo.' },
    { id: 'revision', titulo: 'Revisión', texto: 'Aprueba, marca discrepancias o pide correcciones con una nota.' },
    { id: 'equipo', titulo: 'Equipo e invitaciones', texto: 'Importa la lista, invita a los pendientes y ve quién ya entró.' },
    { id: 'comparativa', titulo: 'Comparar con reservas', texto: 'Cruza el resumen de tu sistema de reservas con las horas cargadas.' },
  ],
};

const Telefono = ({ children }) => (
  <div className="mk-phone" aria-hidden="true">
    <div className="mk-notch" />
    <div className="mk-screen">{children}</div>
    <div className="mk-tabbar">
      {['Inicio', 'Fichar', 'Clases', 'Informes', 'Más'].map((t, i) => <span key={t} className={i === 2 ? 'on' : ''}>{t}</span>)}
    </div>
  </div>
);

const Escritorio = ({ children, ruta }) => (
  <div className="mk-desk" aria-hidden="true">
    <div className="mk-bar"><i /><i /><i /><span>{ruta}</span></div>
    <div className="mk-body">
      <div className="mk-side">
        {['Panel', 'Clases', 'Usuarios', 'Informes', 'Integraciones'].map((t, i) => <span key={t} className={t === 'Clases' ? 'on' : ''}>{t}</span>)}
      </div>
      <div className="mk-main">{children}</div>
    </div>
  </div>
);

const Tile = ({ n, l, c = '' }) => <div className={`mk-tile ${c}`}><b>{n}</b><small>{l}</small></div>;

export function Pantalla({ id }) {
  switch (id) {
    case 'inicio':
      return (
        <Telefono>
          <div className="mk-clock"><b>19:43</b><small>Jueves, 29 de octubre</small><span className="mk-pill">Sin fichar</span><div className="mk-cta">Fichar entrada</div></div>
          <div className="mk-seg"><span className="on">Este mes</span><span>Temporada</span></div>
          <div className="mk-tiles">
            <Tile n="42 h" l="Horas fichadas" /><Tile n="9" l="Días trabajados" c="g" />
            <Tile n="38 h" l="Horas de clase" /><Tile n="796 €" l="Importe estimado" c="a" />
          </div>
        </Telefono>
      );
    case 'clase':
      return (
        <Telefono>
          <p className="mk-h">Cargar clase</p>
          <div className="mk-field"><small>Horas</small><b>2</b></div>
          <div className="mk-chips"><i>0,5</i><i>1</i><i className="on">2</i><i>3</i><i>4</i></div>
          <small className="mk-l">Disciplina</small>
          <div className="mk-chips"><i className="on lg">Esquí</i><i className="lg">Snowboard</i></div>
          <small className="mk-l">Primas</small>
          <div className="mk-chips"><i className="on lg">Idioma</i><i className="lg">Disca</i><i className="on lg">Repetida</i></div>
          <div className="mk-btn">+ Cargar clase</div>
        </Telefono>
      );
    case 'informe':
      return (
        <Telefono>
          <p className="mk-h">Clases y economía <span className="mk-ok">Confirmado</span></p>
          <div className="mk-rev ok"><b>Aprobado por administración</b><small>“Horas correctas”</small></div>
          <div className="mk-tiles">
            <Tile n="38 h" l="Horas de clase" /><Tile n="796 €" l="Importe estimado" c="a" />
          </div>
          <div className="mk-rows">
            <p><span>Base (18 €/h)</span><b>684,00 €</b></p>
            <p><span>Prima Idioma</span><b>76,00 €</b></p>
            <p><span>Prima Repetida</span><b>36,00 €</b></p>
            <p className="tot"><span>Total</span><b>796,00 €</b></p>
          </div>
          <div className="mk-btn">Descargar informe PDF</div>
        </Telefono>
      );
    case 'resumen':
      return (
        <Escritorio ruta="Clases · Horas por profesor">
          <p className="mk-h">Clases impartidas <small>octubre de 2026</small></p>
          <table className="mk-table"><thead><tr><th>Profesor</th><th>Horas</th><th>Importe</th><th>Estado</th><th>Revisión</th></tr></thead>
            <tbody>
              <tr><td>García, Laura</td><td>42</td><td>756 €</td><td><em className="ok">Confirmado</em></td><td><em className="ok">Aprobado</em></td></tr>
              <tr><td>Martínez, Carlos</td><td>38</td><td>796 €</td><td><em className="ok">Confirmado</em></td><td><em className="no">Discrepancia</em></td></tr>
              <tr><td>Pérez, Sofía</td><td>27</td><td>486 €</td><td><em className="ok">Confirmado</em></td><td><em className="wa">Por revisar</em></td></tr>
              <tr><td>Torres, Miguel</td><td>11</td><td>—</td><td><em className="wa">Sin confirmar</em></td><td>—</td></tr>
            </tbody></table>
        </Escritorio>
      );
    case 'revision':
      return (
        <Escritorio ruta="Clases · Carlos Martínez">
          <p className="mk-h">Carlos Martínez — 38 h · 796 €</p>
          <div className="mk-panel">
            <small>Nota para el profesor</small>
            <div className="mk-input">Difiere de la reserva del día 28</div>
            <div className="mk-actions"><span className="g">Aprobar</span><span>Marcar discrepancia</span><span>Pedir corrección</span><span>Solo comentar</span></div>
          </div>
          <div className="mk-class"><b>27/10</b><span>Esquí · 3 h <i>Idioma</i></span><em className="ok">OK</em></div>
          <div className="mk-class warn"><b>28/10</b><span>Esquí · 2 h</span><em className="wa">Revisar</em></div>
          <div className="mk-class"><b>29/10</b><span>Esquí · 1 h <i>Repetida</i></span><em className="ok">OK</em></div>
        </Escritorio>
      );
    case 'equipo':
      return (
        <Escritorio ruta="Usuarios">
          <div className="mk-actions"><span>Importar lista</span><span>Invitar a los pendientes (3)</span></div>
          <div className="mk-class"><b>CM</b><span>Carlos Martínez <i>profesor</i></span><em className="ok">Activo</em></div>
          <div className="mk-class"><b>LG</b><span>Laura García <i>profesor</i></span><em className="ok">Activo</em></div>
          <div className="mk-class warn"><b>SP</b><span>Sofía Pérez <i>profesor</i></span><em className="wa">Invitado · sin entrar</em></div>
          <div className="mk-class warn"><b>MT</b><span>Miguel Torres <i>profesor</i></span><em className="wa">Invitado · sin entrar</em></div>
          <div className="mk-class"><b>AD</b><span>Administración <i>cuenta de empresa</i></span><em className="ok">Principal</em></div>
        </Escritorio>
      );
    default:
      return (
        <Escritorio ruta="Clases · Comparar con reservas">
          <p className="mk-h">Comparar con el sistema de reservas <small>febrero de 2026</small></p>
          <div className="mk-tiles four">
            <Tile n="52" l="Coinciden" c="g" /><Tile n="9" l="Con diferencias" c="a" /><Tile n="4" l="Sin vincular" /><Tile n="3.511 h" l="Horas en reservas" />
          </div>
          <div className="mk-cmp"><span>Instructor A</span><em className="ok">Coincide</em><b>86 h · 86 h</b></div>
          <div className="mk-cmp warn"><span>Instructor B</span><em className="no">Difieren las horas</em><b>91,5 h · 88 h</b><i>−3,5 h</i></div>
          <div className="mk-cmp warn"><span>Instructor C</span><em className="wa">Difiere el importe</em><b>1.718 € · 1.700 €</b><i>−18 €</i></div>
          <div className="mk-cmp"><span>NO ASIGNADO</span><em className="wa">491 h sin instructor</em></div>
        </Escritorio>
      );
  }
}
