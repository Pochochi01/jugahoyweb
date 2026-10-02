import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import AOS from 'aos';

import HomePage            from './pages/HomePage';
import LoginPage           from './pages/LoginPage';
import RegisterPage        from './pages/RegisterPage';
import ReservationPage     from './pages/ReservationPage';
import TeachersPage        from './pages/TeachersPage';
import ContactPage         from './pages/ContactPage';
import RegisterComplexPage from './pages/RegisterComplexPage';
import AuthCallbackPage    from './pages/AuthCallbackPage';
import Dashboard          from './pages/dashboard/Dashboard';
import PlayerPage         from './pages/player/PlayerPage';
import ComplexSlotsPage   from './pages/player/ComplexSlotsPage';
import MyBookingsPage     from './pages/player/MyBookingsPage';
import ReservaResultadoPage from './pages/player/ReservaResultadoPage';
import AdminDashboard     from './pages/admin/AdminDashboard';
import InvitePage         from './pages/InvitePage';
import PrivacyPage        from './pages/PrivacyPage';
import ProtectedRoute     from './components/ProtectedRoute';
import PWABadge           from './components/PWABadge';
import { TorneosListPage, TorneoPublicPage, TorneoTicketPage } from './pages/torneos/TorneoPublicPages';
import { OrganizadorLogin, OrganizadorPanel } from './pages/organizador/OrganizadorPages';
import { ProfesorLogin, ProfesorPanel } from './pages/profesor/ProfesorPages';
import EscuelaPortalPage from './pages/escuela/EscuelaPortalPage';
import MercadoPagoCallbackPage from './pages/MercadoPagoCallbackPage';

export default function App() {
  useEffect(() => {
    AOS.init({ duration: 700, once: true, easing: 'ease-out-cubic' });
  }, []);

  return (
    <>
    <PWABadge />
    <Routes>
      {/* Públicas */}
      <Route path="/"                 element={<HomePage />} />
      <Route path="/login"            element={<LoginPage />} />
      <Route path="/registro"         element={<RegisterPage />} />
      <Route path="/reservar"         element={<ReservationPage />} />
      <Route path="/profesores"       element={<TeachersPage />} />
      <Route path="/contacto"         element={<ContactPage />} />
      <Route path="/adherir-complejo" element={<RegisterComplexPage />} />
      <Route path="/politica-privacidad" element={<PrivacyPage />} />
      {/* Callback de Google OAuth — lee el token del hash y redirige */}
      <Route path="/auth/callback"    element={<AuthCallbackPage />} />
      {/* Link de invitación a cancha — público */}
      <Route path="/invite/:token"    element={<InvitePage />} />

      {/* Retorno de MercadoPago (públicas: MP redirige acá) */}
      <Route path="/reserva/exito"     element={<ReservaResultadoPage variant="exito" />} />
      <Route path="/reserva/error"     element={<ReservaResultadoPage variant="error" />} />
      <Route path="/reserva/pendiente" element={<ReservaResultadoPage variant="pendiente" />} />

      {/* Torneos de pádel — públicas */}
      <Route path="/torneos"                element={<TorneosListPage />} />
      <Route path="/torneos/ticket/:codigo" element={<TorneoTicketPage />} />
      <Route path="/torneos/:id"            element={<TorneoPublicPage />} />
      <Route path="/torneos/:id/pago"       element={<TorneoPublicPage />} />
      {/* Organizadores de torneos (login propio) */}
      <Route path="/organizador/login"      element={<OrganizadorLogin />} />
      <Route path="/organizador"            element={<OrganizadorPanel />} />

      {/* Vuelta del OAuth de MercadoPago (PKCE): canjea el código con el verifier del navegador */}
      <Route path="/mercadopago/callback" element={
        <ProtectedRoute roles={['general_admin', 'complex_admin']}><MercadoPagoCallbackPage /></ProtectedRoute>
      } />

      {/* Escuela de fútbol: portal del alumno / padre (link personal, sin login) */}
      <Route path="/escuela/alumno/:token" element={<EscuelaPortalPage />} />

      {/* Profesores de pádel (login por DNI) */}
      <Route path="/profesor/login"         element={<ProfesorLogin />} />
      <Route path="/profesor"               element={<ProfesorPanel />} />

      {/* Player — requiere login */}
      <Route path="/canchas" element={
        <ProtectedRoute><PlayerPage /></ProtectedRoute>
      } />
      <Route path="/canchas/:id" element={
        <ProtectedRoute><ComplexSlotsPage /></ProtectedRoute>
      } />
      <Route path="/mis-turnos" element={
        <ProtectedRoute><MyBookingsPage /></ProtectedRoute>
      } />

      {/* Dashboard — admins y colaboradores */}
      {/* Admin general — panel de suscripciones */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['general_admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      } />

      <Route path="/dashboard/*" element={
        <ProtectedRoute roles={['general_admin', 'complex_admin', 'collaborator']}>
          <Dashboard />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
