import React, { useState, useEffect } from 'react';
import CDIApp from './components/CDI/CDIApp';
import ChecadorApp from './components/Checador/ChecadorApp';
import RecorridosApp from './components/Recorridos/RecorridosApp';
import BitacoraApp from './components/Bitacora/BitacoraApp';
import MiniAppsDock from './components/Dock/MiniAppsDock';
import {
  getDeviceFeatures,
  saveDeviceFeatures,
  fetchDeviceFeatures,
  getDeviceUuid,
  initCdiSse
} from './services/api';
import './index.css';

export default function App() {
  // Tema claro por defecto, con persistencia en localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('miniapps_theme') || 'light';
  });

  // Funciones / permisos activos del dispositivo (por defecto solo CDI)
  const [features, setFeatures] = useState(() => getDeviceFeatures());

  const isAppAllowed = (appId, feats = features) => {
    if (!appId || appId === 'cdi') return true;
    if (appId === 'checador') return feats.checador === true;
    if (appId === 'recorridos') return feats.recorridos === true;
    if (appId === 'bitacora' || appId === 'bitacoras') return (feats.bitacoras === true || feats.bitacora === true);
    return false;
  };

  // App principal por defecto: CDI (lado izquierdo en escritorio)
  const [activeApp, setActiveApp] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const qApp = (params.get('app') || '').toLowerCase();
    const initialFeats = getDeviceFeatures();
    if (qApp && ['cdi', 'checador', 'recorridos', 'bitacora'].includes(qApp)) {
      if (isAppAllowed(qApp, initialFeats)) {
        return qApp;
      }
    }
    return 'cdi';
  });

  // App paralela (lado derecho en escritorio, activable mediante clic derecho en dock)
  const [parallelApp, setParallelApp] = useState(() => {
    const saved = localStorage.getItem('miniapps_parallel_app');
    const initialFeats = getDeviceFeatures();
    if (saved && ['checador', 'recorridos', 'bitacora'].includes(saved)) {
      if (isAppAllowed(saved, initialFeats)) {
        return saved;
      }
    }
    return null;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('miniapps_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Sincronización de funciones activas desde backend y vía eventos SSE en vivo
  useEffect(() => {
    // 1. Consultar funciones actuales al backend
    fetchDeviceFeatures().then((backendFeats) => {
      if (backendFeats) setFeatures(backendFeats);
    });

    // 2. Escuchar cambios de features en la ventana local
    const handleFeaturesUpdated = (e) => {
      if (e.detail) {
        setFeatures(e.detail);
      }
    };
    window.addEventListener('miniapps_features_updated', handleFeaturesUpdated);

    // 3. SSE en vivo para capturar cambios inmediatos cuando el operador palomea/desmarca en RegAs 3
    const cleanupSse = initCdiSse(null, (devPayload) => {
      const myId = getDeviceUuid();
      if (devPayload && (devPayload.deviceId === myId || devPayload._id === myId) && devPayload.features) {
        saveDeviceFeatures(devPayload.features);
      }
    });

    return () => {
      window.removeEventListener('miniapps_features_updated', handleFeaturesUpdated);
      cleanupSse();
    };
  }, []);

  // Si estamos en móvil y la URL pide una app externa, redirigir congruentemente
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const params = new URLSearchParams(window.location.search);
    const qApp = (params.get('app') || '').toLowerCase();
    const search = window.location.search || '';

    if (qApp === 'checador') {
      if (features.checador === true) {
        window.location.replace('checador-movil.html' + search);
      } else {
        setActiveApp('cdi');
      }
    } else if (qApp === 'recorridos') {
      if (features.recorridos === true) {
        window.location.replace('recorrido-movil.html' + search);
      } else {
        setActiveApp('cdi');
      }
    } else if (qApp === 'bitacora' || qApp === 'bitacoras') {
      if (features.bitacoras === true || features.bitacora === true) {
        window.location.replace('bitacora-movil.html' + search);
      } else {
        setActiveApp('cdi');
      }
    }
  }, [features]);

  // Si la app activa pierde sus permisos en vivo, regresar automáticamente a CDI
  useEffect(() => {
    if (activeApp !== 'cdi' && !isAppAllowed(activeApp, features)) {
      setActiveApp('cdi');
      const url = new URL(window.location);
      url.searchParams.set('app', 'cdi');
      window.history.replaceState({}, '', url);
    }
  }, [features, activeApp]);

  // Si la app paralela pierde sus permisos en vivo, desactivar el panel paralelo
  useEffect(() => {
    if (parallelApp && !isAppAllowed(parallelApp, features)) {
      setParallelApp(null);
      localStorage.removeItem('miniapps_parallel_app');
    }
  }, [features, parallelApp]);

  const handleSelectApp = (appId, forceFullScreen = false) => {
    if (!isAppAllowed(appId, features)) {
      return;
    }
    const search = window.location.search || '';
    const isMobile = window.innerWidth < 768;

    if (forceFullScreen || isMobile) {
      setParallelApp(null);
      localStorage.removeItem('miniapps_parallel_app');

      if (appId === 'checador') {
        window.location.href = 'checador-movil.html' + search;
        return;
      }
      if (appId === 'recorridos') {
        window.location.href = 'recorrido-movil.html' + search;
        return;
      }
      if (appId === 'bitacora' || appId === 'bitacoras') {
        window.location.href = 'bitacora-movil.html' + search;
        return;
      }
    }

    setActiveApp(appId);
    const url = new URL(window.location);
    url.searchParams.set('app', appId);
    window.history.replaceState({}, '', url);
  };

  const handleToggleParallel = (appId) => {
    if (!appId || parallelApp === appId) {
      setParallelApp(null);
      localStorage.removeItem('miniapps_parallel_app');
    } else {
      if (isAppAllowed(appId, features)) {
        setParallelApp(appId);
        localStorage.setItem('miniapps_parallel_app', appId);
        // Si la app izquierda era la misma que la elegida para paralelo, CDI pasa a la izquierda
        if (activeApp === appId) {
          setActiveApp('cdi');
        }
      }
    }
  };

  const isSplitMode = Boolean(parallelApp && isAppAllowed(parallelApp, features));

  return (
    <div className="miniapps-app-shell" data-theme={theme}>
      <main className={`miniapps-content-view ${isSplitMode ? 'split-mode' : ''}`}>
        {/* PANEL IZQUIERDO: App Principal (CDI por defecto) */}
        <div className={`miniapps-pane ${isSplitMode ? 'miniapps-pane-left' : ''}`} style={{ flex: isSplitMode ? '1 1 50%' : '1' }}>
          {activeApp === 'cdi' && <CDIApp theme={theme} onToggleTheme={toggleTheme} />}
          {activeApp === 'checador' && features.checador && (
            <iframe src="checador-movil.html?embedded=1" className="miniapps-app-iframe" allow="camera; microphone; geolocation" title="Checador" />
          )}
          {activeApp === 'recorridos' && features.recorridos && (
            <iframe src="recorrido-movil.html?embedded=1" className="miniapps-app-iframe" allow="geolocation" title="Recorridos" />
          )}
          {activeApp === 'bitacora' && (features.bitacoras || features.bitacora) && (
            <iframe src="bitacora-movil.html?embedded=1" className="miniapps-app-iframe" title="Bitácora" />
          )}
        </div>

        {/* PANEL DERECHO: App Paralela activada por Clic Derecho en el Dock */}
        {isSplitMode && (
          <div className="miniapps-pane miniapps-pane-right">
            {/* Sin el encabezado adicional: el iframe ocupa la altura completa */}
            <div className="miniapps-pane-body">
              {parallelApp === 'checador' && (
                <iframe
                  src="checador-movil.html?embedded=1"
                  className="miniapps-app-iframe"
                  allow="camera; microphone; geolocation"
                  title="Checador Facial Móvil"
                />
              )}
              {parallelApp === 'recorridos' && (
                <iframe
                  src="recorrido-movil.html?embedded=1"
                  className="miniapps-app-iframe"
                  allow="geolocation"
                  title="Recorridos Móvil"
                />
              )}
              {parallelApp === 'bitacora' && (
                <iframe
                  src="bitacora-movil.html?embedded=1"
                  className="miniapps-app-iframe"
                  title="Bitácora Móvil"
                />
              )}
            </div>

            {/* DOCK NORMAL SOLO EN LA APLICACIÓN DE LA DERECHA (solo muestra las apps NO visibles y botón rojo de cerrar) */}
            <MiniAppsDock
              currentApp={parallelApp}
              parallelApp={parallelApp}
              excludeApps={[activeApp, parallelApp]}
              isPaneDock={true}
              showCloseButton={true}
              onCloseParallel={() => handleToggleParallel(null)}
              onSelectApp={(appId) => {
                handleToggleParallel(appId);
              }}
              onToggleParallel={handleToggleParallel}
              features={features}
              theme={theme}
            />
          </div>
        )}
      </main>

      {/* DOCK INFERIOR GLOBAL: Solo visible cuando NO está en vista paralela */}
      {!isSplitMode && (
        <MiniAppsDock
          currentApp={activeApp}
          parallelApp={parallelApp}
          onSelectApp={handleSelectApp}
          onToggleParallel={handleToggleParallel}
          features={features}
          theme={theme}
        />
      )}
    </div>
  );
}
