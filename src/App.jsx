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
  detectDeviceInfo,
  initCdiSse
} from './services/api';
import './index.css';

// Detección de PC exclusiva: navegador de escritorio en pantalla >= 768px
const isPcDevice = () => {
  if (typeof window === 'undefined') return true;
  const dev = detectDeviceInfo();
  return dev.type === 'pc' && window.innerWidth >= 768;
};

export default function App() {
  // Tema claro por defecto, con persistencia en localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('miniapps_theme') || 'light';
  });

  // Funciones / permisos activos del dispositivo (por defecto solo CDI)
  const [features, setFeatures] = useState(() => getDeviceFeatures());

  // Detección reactiva de PC (PC con pantalla >= 768px)
  const [isPc, setIsPc] = useState(() => isPcDevice());

  useEffect(() => {
    const handleResize = () => {
      setIsPc(isPcDevice());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAppAllowed = (appId, feats = features) => {
    const f = feats || {};
    if (!appId || appId === 'cdi') return true;
    if (appId === 'checador') return f.checador === true;
    if (appId === 'recorridos') return f.recorridos === true;
    if (appId === 'bitacora' || appId === 'bitacoras') return (f.bitacoras === true || f.bitacora === true);
    return false;
  };

  // App principal (panel izquierdo en PC, pantalla única en móvil)
  const [activeApp, setActiveApp] = useState(() => {
    const onPc = isPcDevice();
    // En PC, la app del panel izquierdo siempre es CDI
    if (onPc) {
      return 'cdi';
    }

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

  // App paralela (panel derecho en PC)
  const [parallelApp, setParallelApp] = useState(() => {
    const onPc = isPcDevice();
    const initialFeats = getDeviceFeatures();
    const saved = localStorage.getItem('miniapps_parallel_app');

    // En PC, si checador está explícitamente autorizado en RegAs, checador es la app por defecto
    if (onPc && initialFeats.checador === true) {
      if (saved && ['checador', 'recorridos', 'bitacora'].includes(saved) && isAppAllowed(saved, initialFeats)) {
        return saved;
      }
      return 'checador';
    }
    return null;
  });

  // Asegurar que en PC la app izquierda sea siempre CDI
  useEffect(() => {
    if (isPc && activeApp !== 'cdi') {
      setActiveApp('cdi');
    }
  }, [isPc, activeApp]);

  // Sincronización de app paralela ante cambios de permisos en RegAs o cambios de tamaño de pantalla
  useEffect(() => {
    if (isPc) {
      if (features.checador === true) {
        // En PC con checador autorizado:
        // Si no hay app paralela o la actual perdió permisos, volver por defecto a 'checador'
        if (!parallelApp || !isAppAllowed(parallelApp, features)) {
          setParallelApp('checador');
          localStorage.setItem('miniapps_parallel_app', 'checador');
        }
      } else {
        // Si checador NO está explícitamente autorizado en RegAs: "solo muestra cdi como hasta ahora"
        if (parallelApp) {
          setParallelApp(null);
          localStorage.removeItem('miniapps_parallel_app');
        }
      }
    } else {
      // En móvil nunca se utiliza modo split/paralelo
      if (parallelApp) {
        setParallelApp(null);
        localStorage.removeItem('miniapps_parallel_app');
      }
    }
  }, [features, isPc, parallelApp]);

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
    if (isPc) return;

    const params = new URLSearchParams(window.location.search);
    const qApp = (params.get('app') || '').toLowerCase();
    const search = window.location.search || '';

    if (qApp === 'checador') {
      if (features.checador === true) {
        window.location.replace('checador-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : ''));
      } else {
        setActiveApp('cdi');
      }
    } else if (qApp === 'recorridos') {
      if (features.recorridos === true) {
        window.location.replace('recorrido-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : ''));
      } else {
        setActiveApp('cdi');
      }
    } else if (qApp === 'bitacora' || qApp === 'bitacoras') {
      if (features.bitacoras === true || features.bitacora === true) {
        window.location.replace('bitacora-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : ''));
      } else {
        setActiveApp('cdi');
      }
    }
  }, [features, isPc]);

  // Si la app activa pierde sus permisos en vivo (en móvil o CDI-only), regresar a CDI
  useEffect(() => {
    if (activeApp !== 'cdi' && !isAppAllowed(activeApp, features)) {
      setActiveApp('cdi');
      const url = new URL(window.location);
      url.searchParams.set('app', 'cdi');
      window.history.replaceState({}, '', url);
    }
  }, [features, activeApp]);

  const handleSelectApp = (appId, forceFullScreen = false) => {
    if (!isAppAllowed(appId, features)) {
      return;
    }
    const search = window.location.search || '';
    const isMobile = !isPc;

    if (forceFullScreen || isMobile) {
      if (appId === 'checador') {
        window.location.href = 'checador-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : '');
        return;
      }
      if (appId === 'recorridos') {
        window.location.href = 'recorrido-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : '');
        return;
      }
      if (appId === 'bitacora' || appId === 'bitacoras') {
        window.location.href = 'bitacora-movil.html?device=mobile' + (search ? '&' + search.replace(/^\?/, '') : '');
        return;
      }
    }

    setActiveApp(appId);
    const url = new URL(window.location);
    url.searchParams.set('app', appId);
    window.history.replaceState({}, '', url);
  };

  const handleSelectParallelApp = (appId) => {
    if (!isAppAllowed(appId, features)) return;
    setParallelApp(appId);
    localStorage.setItem('miniapps_parallel_app', appId);
  };

  // Modo paralelo split-screen: Exclusivamente en PC y cuando checador está autorizado en RegAs
  const isSplitMode = Boolean(isPc && features.checador === true);

  // App a renderizar en el panel derecho (por defecto checador)
  const effectiveRightApp = (parallelApp && isAppAllowed(parallelApp, features)) ? parallelApp : 'checador';

  // Verificar si hay OTRAS aplicaciones autorizadas explícitamente en RegAs (recorridos o bitácoras)
  const hasOtherAuthorizedApps = Boolean(features.recorridos === true || features.bitacoras === true || features.bitacora === true);

  return (
    <div className="miniapps-app-shell" data-theme={theme}>
      <main className={`miniapps-content-view ${isSplitMode ? 'split-mode' : ''}`}>
        {/* PANEL IZQUIERDO: CDI permanente en PC (30% de ancho) o app activa en móvil */}
        <div
          className={`miniapps-pane ${isSplitMode ? 'miniapps-pane-left' : ''}`}
          style={{
            flex: isSplitMode ? '0 0 30%' : '1',
            width: isSplitMode ? '30%' : '100%',
            maxWidth: isSplitMode ? '30%' : '100%'
          }}
        >
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

        {/* PANEL DERECHO: Exclusivo en PC con Checador (70% de ancho) en paralelo */}
        {isSplitMode && (
          <div
            className="miniapps-pane miniapps-pane-right"
            style={{
              flex: '0 0 70%',
              width: '70%',
              maxWidth: '70%'
            }}
          >
            <div className="miniapps-pane-body">
              {effectiveRightApp === 'checador' && (
                <iframe
                  src="checador-movil.html?embedded=1&device=pc"
                  className="miniapps-app-iframe"
                  allow="camera; microphone; geolocation"
                  title="Checador Facial Móvil"
                />
              )}
              {effectiveRightApp === 'recorridos' && features.recorridos && (
                <iframe
                  src="recorrido-movil.html?embedded=1"
                  className="miniapps-app-iframe"
                  allow="geolocation"
                  title="Recorridos Móvil"
                />
              )}
              {effectiveRightApp === 'bitacora' && (features.bitacoras || features.bitacora) && (
                <iframe
                  src="bitacora-movil.html?embedded=1"
                  className="miniapps-app-iframe"
                  title="Bitácora Móvil"
                />
              )}
            </div>

            {/* DOCK EN PANEL DERECHO: Solo visible si hay OTRA aplicación autorizada explícitamente en RegAs */}
            {hasOtherAuthorizedApps && (
              <MiniAppsDock
                currentApp={effectiveRightApp}
                parallelApp={effectiveRightApp}
                excludeApps={['cdi', effectiveRightApp]}
                isPaneDock={true}
                showCloseButton={false}
                onSelectApp={(appId) => handleSelectParallelApp(appId)}
                features={features}
                theme={theme}
              />
            )}
          </div>
        )}
      </main>

      {/* DOCK INFERIOR GLOBAL: Solo visible cuando NO está en vista paralela */}
      {!isSplitMode && (
        <MiniAppsDock
          currentApp={activeApp}
          parallelApp={null}
          onSelectApp={handleSelectApp}
          features={features}
          theme={theme}
        />
      )}
    </div>
  );
}
