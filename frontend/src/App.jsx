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
import AdminDashboard     from './pages/admin/AdminDashboard';
import InvitePage         from './pages/InvitePage';
import ProtectedRoute     from './components/ProtectedRoute';

export default function App() {
  useEffect(() => {
    AOS.init({ duration: 700, once: true, easing: 'ease-out-cubic' });
  }, []);

  return (
    <Routes>
      {/* Públicas */}
      <Route path="/"                 element={<HomePage />} />
      <Route path="/login"            element={<LoginPage />} />
      <Route path="/registro"         element={<RegisterPage />} />
      <Route path="/reservar"         element={<ReservationPage />} />
      <Route path="/profesores"       element={<TeachersPage />} />
      <Route path="/contacto"         element={<ContactPage />} />
      <Route path="/adherir-complejo" element={<RegisterComplexPage />} />
      {/* Callback de Google OAuth — lee el token del hash y redirige */}
      <Route path="/auth/callback"    element={<AuthCallbackPage />} />
      {/* Link de invitación a cancha — público */}
      <Route path="/invite/:token"    element={<InvitePage />} />

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
  );
}
