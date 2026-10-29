const svc = require('../services/agendaAnaliticaService');

/**
 * GET /api/stats/:complexId/agenda-analitica
 * Inteligencia de Agenda: heatmap, rankings, cancelaciones, ausentismo, franjas,
 * rentabilidad, evolución y KPIs. Filtros: desde, hasta, hora_desde, hora_hasta,
 * field_id (csv), deporte (csv), estado (csv), granularidad, comparar.
 */
async function analitica(req, res) {
  try {
    res.json(await svc.analizar(Number(req.params.complexId), req.query));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(`[agenda-analitica] complejo ${req.params.complexId}:`, err);
    res.status(500).json({ message: 'No se pudo calcular la analítica de agenda.' });
  }
}

/** GET /api/stats/:complexId/agenda-analitica/filtros — opciones de los filtros. */
async function filtros(req, res) {
  try {
    res.json(await svc.opcionesFiltros(Number(req.params.complexId)));
  } catch (err) {
    console.error(`[agenda-analitica] filtros complejo ${req.params.complexId}:`, err);
    res.status(500).json({ message: 'No se pudieron cargar los filtros.' });
  }
}

module.exports = { analitica, filtros };
