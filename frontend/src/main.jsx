import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import 'aos/dist/aos.css';
// Tipografía del wordmark (similar al logo). Self-hosted → funciona offline en la PWA.
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-700-italic.css';
// Tipografía de la interfaz (variable, self-hosted). Ver DESIGN.md.
import '@fontsource-variable/plus-jakarta-sans';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
