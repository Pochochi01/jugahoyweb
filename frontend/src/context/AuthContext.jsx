import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [collaborators, setCollaborators] = useState([]); // asignaciones del colaborador
  const [loading,       setLoading]       = useState(true);

  // Restaurar sesión al montar
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    authService.me()
      .then(data => {
        setUser(data.user);
        setCollaborators(data.collaborators || []);
      })
      .catch(() => {
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setCollaborators(data.collaborators || []);
    return data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const data = await authService.register(formData);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setCollaborators([]);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    setCollaborators([]);
  }, []);

  // Usado después de register-complex: setea sesión sin llamar a la API
  const loginWithToken = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
    setCollaborators([]);
  }, []);

  // Devuelve los permisos del colaborador para un complejo específico
  // Retorna null si el usuario no es colaborador
  // Retorna {} si es colaborador pero no tiene asignación activa para ese complejo
  const getCollaboratorPermisos = useCallback((complexId) => {
    if (user?.rol !== 'collaborator') return null;
    const assignment = collaborators.find(c => c.complex_id === parseInt(complexId));
    return assignment?.permisos ?? {};
  }, [user, collaborators]);

  // Verifica si el colaborador tiene un permiso específico para un complejo
  const hasPermission = useCallback((complexId, permiso) => {
    if (user?.rol === 'general_admin' || user?.rol === 'complex_admin') return true;
    const permisos = getCollaboratorPermisos(complexId);
    if (permisos === null) return false;
    return permisos[permiso] === true;
  }, [user, getCollaboratorPermisos]);

  const isGeneralAdmin = user?.rol === 'general_admin';
  const isComplexAdmin = user?.rol === 'complex_admin' || isGeneralAdmin;
  const isCollaborator = user?.rol === 'collaborator';

  return (
    <AuthContext.Provider value={{
      user, loading, collaborators,
      login, register, logout, loginWithToken,
      isGeneralAdmin, isComplexAdmin, isCollaborator,
      getCollaboratorPermisos, hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
