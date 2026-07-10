import { useState, useEffect, useCallback } from 'react';
import { Link2, Copy, Check, Trash2, Plus, RefreshCw, Building2 } from 'lucide-react';
import { inviteService } from '../../services/inviteService';

export default function InvitesTab({ complexId }) {
  const [invites,  setInvites]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newLink,  setNewLink]  = useState(null);
  const [copied,   setCopied]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const invitesData = await inviteService.list(complexId);
      setInvites(invitesData || []);
    } catch {
      showToast('error', 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [complexId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Invite a nivel complejo, sin vencimiento
      const result = await inviteService.generate({ complex_id: complexId });
      setNewLink(result.link);
      showToast('success', 'Link generado');
      loadData();
    } catch (err) {
      showToast('error', err?.response?.data?.message || err?.message || 'Error al generar link');
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

  const createdLabel = (date) => new Date(date).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

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
        <h2 className="text-lg font-bold">Invitaciones al complejo</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generá un link único para que un jugador acceda al complejo. El link no vence
          y, al ingresar, el jugador queda vinculado a este complejo automáticamente.
        </p>
      </div>

      {/* Generador */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Nuevo link de invitación</h3>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
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
              <code className="flex-1 min-w-0 text-xs bg-white border rounded-lg px-3 py-2 truncate select-all">
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
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.link}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Creado {createdLabel(inv.created_at)} · Sin vencimiento
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
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
