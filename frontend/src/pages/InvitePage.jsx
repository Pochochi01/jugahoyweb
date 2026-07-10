import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, AlertTriangle, CheckCircle, Loader2, Building2 } from 'lucide-react';
import { inviteService } from '../services/inviteService';
import { useAuth } from '../context/AuthContext';
import { storePendingInvite } from '../utils/authRedirect';

export default function InvitePage() {
  const { token }    = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const [state, setState]     = useState('loading'); // loading | valid | invalid
  const [data,  setData]      = useState(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    inviteService.validate(token)
      .then(res => { setState('valid'); setData(res); })
      .catch(() => setState('invalid'));
  }, [token]);

  const handleIngresar = async () => {
    // Usuario sin sesión → guardar invitación pendiente y mandar a login.
    // La relación player ↔ complejo recién se crea al loguearse (claim).
    if (!user) {
      storePendingInvite(token);
      navigate(`/login?invite=${token}`);
      return;
    }

    // Usuario logueado → vincularlo al complejo y entrar directo
    setClaiming(true);
    try {
      await inviteService.claim(token);
    } catch {
      // Si el claim falla igual entramos al complejo (no bloqueante)
    } finally {
      setClaiming(false);
    }
    navigate(`/canchas/${data.complex.id}`);
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
          Este link fue revocado o no existe.
        </p>
        <a href="/canchas" className="btn-primary inline-block">Ver todos los complejos</a>
      </div>
    </div>
  );

  const { complex } = data;

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
            <h2 className="text-xl font-bold">Acceso al complejo</h2>
          </div>

          <div className="p-6 space-y-5">
            {/* Complejo */}
            <div className="border rounded-xl p-4 bg-muted/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Complejo invitado</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{complex.nombre}</p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {complex.ciudad}{complex.provincia ? `, ${complex.provincia}` : ''}
                      {complex.direccion && ` — ${complex.direccion}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleIngresar}
              disabled={claiming}
              className="w-full btn-primary py-3 text-base font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
              {claiming
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Vinculando…</>
                : (user ? 'Entrar al complejo' : 'Ingresar para reservar')}
            </button>

            <p className="text-xs text-center text-muted-foreground">
              {user
                ? 'Vas a quedar vinculado a este complejo'
                : 'Iniciá sesión o registrate para acceder a este complejo'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
