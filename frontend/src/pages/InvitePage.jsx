import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, CalendarDays, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { inviteService } from '../services/inviteService';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };

export default function InvitePage() {
  const { token }    = useParams();
  const navigate     = useNavigate();
  const [state, setState] = useState('loading'); // loading | valid | invalid
  const [data,  setData]  = useState(null);

  useEffect(() => {
    inviteService.validate(token)
      .then(res => { setState('valid'); setData(res); })
      .catch(() => setState('invalid'));
  }, [token]);

  const handleVerTurnos = () => {
    // Guardar contexto en sessionStorage para filtrar la vista de canchas
    sessionStorage.setItem('inviteContext', JSON.stringify({
      token,
      fieldId   : data.field.id,
      complexId : data.complex.id,
      fieldName : data.field.nombre,
    }));
    navigate(`/canchas/${data.complex.id}?field=${data.field.id}`);
  };

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (state === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold mb-2">Invitación inválida</h1>
        <p className="text-muted-foreground mb-6">
          Este link ya venció, fue revocado o no existe.
        </p>
        <a href="/canchas" className="btn-primary inline-block">Ver todos los complejos</a>
      </div>
    </div>
  );

  const { field, complex, expires_at } = data;
  const expiresLabel = new Date(expires_at).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted">
      <div className="max-w-md w-full">

        {/* Header de la app */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary rounded-xl mb-3">
            <span className="text-white font-black text-lg">J</span>
          </div>
          <h1 className="font-black text-2xl">JugaHoy</h1>
        </div>

        {/* Card de invitación */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* Banner */}
          <div className="bg-primary px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-primary-foreground/80 text-sm mb-1">
              <CheckCircle className="w-4 h-4" />
              <span>Tenés una invitación</span>
            </div>
            <h2 className="text-xl font-bold">Acceso a cancha</h2>
          </div>

          <div className="p-6 space-y-5">
            {/* Complejo */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Complejo</p>
              <p className="font-semibold text-lg">{complex.nombre}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {complex.ciudad}{complex.provincia ? `, ${complex.provincia}` : ''}
                {complex.direccion && ` — ${complex.direccion}`}
              </div>
            </div>

            {/* Cancha */}
            <div className="border rounded-xl p-4 bg-muted/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cancha invitada</p>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{DEPORTE_ICON[field.deporte] || '🏃'}</span>
                <div>
                  <p className="font-bold">{field.nombre}</p>
                  <p className="text-sm text-muted-foreground capitalize">{field.deporte}</p>
                  {field.techada !== undefined && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {field.techada ? '🏠 Techada' : '🌤 Al aire libre'}
                      {field.dimensiones ? ` · ${field.dimensiones}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Vencimiento */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span>Invitación válida hasta el <strong className="text-foreground">{expiresLabel}</strong></span>
            </div>

            {/* CTA */}
            <button
              onClick={handleVerTurnos}
              className="w-full btn-primary py-3 text-base font-semibold rounded-xl">
              Ver turnos disponibles
            </button>

            <p className="text-xs text-center text-muted-foreground">
              Solo verás los turnos de esta cancha
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
