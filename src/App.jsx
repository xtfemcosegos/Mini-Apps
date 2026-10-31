import React, { useState, useEffect } from 'react';
import CDIApp from './components/CDI/CDIApp';
import ChecadorApp from './components/Checador/ChecadorApp';
import RecorridosApp from './components/Recorridos/RecorridosApp';
import BitacoraApp from './components/Bitacora/BitacoraApp';
import MiniAppsDock from './components/Dock/MiniAppsDock';
import './index.css';

export default function App() {
  // Tema claro por defecto, con persistencia en localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('miniapps_theme') || 'light';
  });

  // App por defecto: CDI
  const [activeApp, setActiveApp] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const qApp = params.get('app');
    if (qApp && ['cdi', 'checador', 'recorridos', 'bitacora'].includes(qApp.toLowerCase())) {
      return qApp.toLowerCase();
    }
    return 'cdi';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('miniapps_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qApp = (params.get('app') || '').toLowerCase();
    const search = window.location.search || '';
    if (qApp === 'checador') {
      window.location.replace('checador-movil.html' + search);
    }
  }, []);

  const handleSelectApp = (appId) => {
    const search = window.location.search || '';
    if (appId === 'checador') {
      window.location.href = 'checador-movil.html' + search;
      return;
    }
    setActiveApp(appId);
    const url = new URL(window.location);
    url.searchParams.set('app', appId);
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="miniapps-app-shell" data-theme={theme}>
      <main className="miniapps-content-view">
        {activeApp === 'cdi' && <CDIApp theme={theme} onToggleTheme={toggleTheme} />}
        {activeApp === 'checador' && <ChecadorApp theme={theme} onToggleTheme={toggleTheme} />}
        {activeApp === 'recorridos' && <RecorridosApp theme={theme} onToggleTheme={toggleTheme} />}
        {activeApp === 'bitacora' && <BitacoraApp theme={theme} onToggleTheme={toggleTheme} />}
      </main>

      <MiniAppsDock currentApp={activeApp} onSelectApp={handleSelectApp} theme={theme} />
    </div>
  );
}
