import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useGym, puede, Tabla, Cargando, ErrorBox, hoy, money, errMsg } from '../../../components/gym/GymUI';

const TIPOS = [
  ['socios_activos', 'Socios activos'], ['morosos', 'Morosos'], ['cobranza', 'Cobranza'], ['asistencia', 'Asistencia'],
  ['actividades', 'Actividades'], ['profesores', 'Profesores'], ['rentabilidad', 'Rentabilidad'],
];

/** Reportes con vista previa y exportación a Excel (CSV) y PDF (HTML imprimible). */
export default function GymReportes() {
  const { api, permisos, avisar } = useGym();
  const [tipo, setTipo] = useState('socios_activos');
  const [rango, setRango] = useState({ desde: `${hoy().slice(0, 7)}-01`, hasta: hoy() });
  const [st, setSt] = useState({ data: null, cargando: false, error: '' });
  const exportar = puede(permisos, 'reportes', 'exportar');

  const ver = async (e) => {
    e?.preventDefault();
    setSt({ data: null, cargando: true, error: '' });
    try { setSt({ data: await api.reporte(tipo, rango), cargando: false, error: '' }); }
    catch (err) { setSt({ data: null, cargando: false, error: errMsg(err) }); }
  };
  const exp = async (f) => { try { await api.exportar(tipo, f, rango); } catch (err) { avisar('err', errMsg(err)); } };
  const r = st.data;

  return (
    <div className="space-y-4">
      <form onSubmit={ver} className="card flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">Reporte
          <select className="input text-sm" value={tipo} onChange={e => { setTipo(e.target.value); setSt({ data: null, cargando: false, error: '' }); }}>
            {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="text-xs text-muted-foreground">Desde<input type="date" className="input text-sm" value={rango.desde} onChange={e => setRango({ ...rango, desde: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">Hasta<input type="date" className="input text-sm" value={rango.hasta} onChange={e => setRango({ ...rango, hasta: e.target.value })} /></label>
        <button className="btn-primary btn-sm">Ver</button>
        {exportar && <>
          <button type="button" className="btn-outline btn-sm" onClick={() => exp('csv')}><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => exp('html')}><FileText className="w-4 h-4" /> PDF</button>
        </>}
      </form>
      <p className="text-xs text-muted-foreground">Socios activos y morosos muestran el estado actual; el resto usa el rango de fechas.</p>
      {st.cargando && <Cargando />}
      <ErrorBox>{st.error}</ErrorBox>
      {r && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><strong>{r.titulo}</strong><span className="text-muted-foreground">{r.filas.length} registro(s){r.total !== null && ` · Total ${money(r.total)}`}</span></div>
          <Tabla clave="__i" filas={r.filas.map((f, i) => ({ ...f, __i: i }))} columnas={r.columnas.map(c => ({ k: c.key, l: c.label }))} />
        </div>
      )}
    </div>
  );
}
