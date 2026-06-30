import { useState, useEffect, useCallback } from 'react';
import { Link2, Copy, Check, Trash2, Plus, RefreshCw, Clock } from 'lucide-react';
import { inviteService } from '../../services/inviteService';
import api from '../../services/api';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };

export default function InvitesTab({ complexId }) {
  const [fields,   setFields]   = useState([]);
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({ field_id: '', expires_in_days: 7 });
  const [newLink,  setNewLink]  = useState(null);
  const [copied,   setCopied]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fieldsData, invitesData] = await Promise.all([
        api.get(`/settings/${complexId}/fields`),
        inviteService.list(complexId),
      ]);
      setFields(fieldsData || []);
      setInvites(invitesData || []);
      if (fieldsData?.length && !form.field_id) {
        setForm(f => ({ ...f, field_id: fieldsData[0].id }));
      }
    } catch {
      showToast('error', 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [complexId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async () => {
    if (!form.field_id) return showToast('error', 'Seleccioná una cancha');
    setGenerating(true);
    try {
      const result = await inviteService.generate({
        field_id      : parseInt(form.field_id),
        complex_id    : complexId,
        expires_in_days: parseInt(form.expires_in_days),
      });
      setNewLink(result.link);
      showToast('success', 'Link generado');
      loadData();
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'Error al generar link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (link) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRevoke = async (id) => {
    if (!confirm('¿Revocar esta invitación? El link dejará de funcionar.')) return;
    try {
      await inviteService.revoke(id);
      showToast('success', 'Invitación revocada');
      loadData();
    } catch {
      showToast('error', 'Error al revocar');
    }
  };

  const expiresLabel = (date) => new Date(date).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const daysLeft = (date) => {
    const diff = Math.ceil((new Date(date) - new Date()) / 86400000);
    return diff;
  };

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold">Invitaciones de cancha</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generá links únicos para que un jugador acceda directamente a una cancha específica.
        </p>
      </div>

      {/* Generador */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Nuevo link de invitación</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Cancha</label>
            <select
              className="input w-full"
              value={form.field_id}
              onChange={e => setForm(f => ({ ...f, field_id: e.target.value }))}
              disabled={loading || fields.length === 0}
            >
              {fields.length === 0
                ? <option value="">Sin canchas disponibles</option>
                : fields.map(f => (
                  <option key={f.id} value={f.id}>
                    {DEPORTE_ICON[f.deporte]} {f.nombre}
                  </option>
                ))
              }
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Vigencia</label>
            <select
              className="input w-full"
              value={form.expires_in_days}
              onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))}
            >
              <option value={1}>1 día</option>
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !form.field_id}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {generating
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />
          }
          Generar link
        </button>

        {/* Link generado */}
        {newLink && (
          <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-xl">
            <p className="text-xs font-semibold text-primary mb-2">Link generado — compartílo con el jugador</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border rounded-lg px-3 py-2 truncate select-all">
                {newLink}
              </code>
              <button
                onClick={() => handleCopy(newLink)}
                className="shrink-0 p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de invites activos */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Links activos</h3>
          <button onClick={loadData} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Link2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No hay invitaciones activas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invites.map(inv => {
              const days = daysLeft(inv.expires_at);
              return (
                <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors">
                  <span className="text-xl">{DEPORTE_ICON[inv.field?.deporte] || '🏃'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{inv.field?.nombre}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Vence {expiresLabel(inv.expires_at)}
                      {days <= 2 && (
                        <span className="ml-1 text-orange-500 font-medium">({days}d)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(inv.link)}
                      title="Copiar link"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      title="Revocar"
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
