import React, { useState, useEffect, useRef } from 'react';
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
  sendDeviceIdentifySignal,
  detectDeviceInfo,
  initCdiSse,
  sounds
} from './services/api';
import './index.css';

// Detección de PC exclusiva: navegador de escritorio en pantalla >= 768px
const isPcDevice = () => {
  if (typeof window === 'undefined') return true;
  const dev = detectDeviceInfo();
  return dev.type === 'pc' && window.innerWidth >= 768;
};

export default function App() {
  // Tema oscuro por defecto, con persistencia en localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('miniapps_theme') || 'dark';
  });

  // Reloj en tiempo real (para el encabezado unificado en PC)
  // Estado de identificación del dispositivo hacia RegAs 3
  const [isIdentifying, setIsIdentifying] = useState(false);

  const handleIdentifyDevice = async () => {
    sounds.click();
    setIsIdentifying(true);
    try {
      await sendDeviceIdentifySignal();
      sounds.success();
    } catch (err) {
      console.warn("Error enviando señal de identificación:", err);
    }
    setTimeout(() => {
      setIsIdentifying(false);
    }, 2500);
  };

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const getFirstAllowedRightApp = (feats = features) => {
    const f = feats || {};
    if (f.checador === true) return 'checador';
    if (f.recorridos === true) return 'recorridos';
    if (f.bitacoras === true || f.bitacora === true) return 'bitacora';
    return null;
  };

  // App paralela (panel derecho en PC)
  const [parallelApp, setParallelApp] = useState(() => {
    const onPc = isPcDevice();
    const initialFeats = getDeviceFeatures();
    const saved = localStorage.getItem('miniapps_parallel_app');
    const firstAllowed = getFirstAllowedRightApp(initialFeats);

    if (onPc && firstAllowed) {
      if (saved && ['checador', 'recorridos', 'bitacora'].includes(saved) && isAppAllowed(saved, initialFeats)) {
        return saved;
      }
      return firstAllowed;
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
      const firstAllowed = getFirstAllowedRightApp(features);
      if (firstAllowed) {
        if (!parallelApp || !isAppAllowed(parallelApp, features)) {
          setParallelApp(firstAllowed);
          localStorage.setItem('miniapps_parallel_app', firstAllowed);
        }
      } else {
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

    // Sincronizar tema con iframes del checador (panel derecho en PC)
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          iframe.contentWindow.postMessage({ type: 'miniapps_theme', theme }, '*');
        } catch (e) {}
      });
    } catch (e) {}
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

  // Modo paralelo split-screen: En PC cuando hay alguna aplicación secundaria autorizada en RegAs
  const firstAllowedRightApp = getFirstAllowedRightApp(features);
  const isSplitMode = Boolean(isPc && firstAllowedRightApp);

  // App a renderizar en el panel derecho (por defecto la primera autorizada, priorizando checador)
  const effectiveRightApp = (parallelApp && isAppAllowed(parallelApp, features))
    ? parallelApp
    : (firstAllowedRightApp || 'checador');

  return (
    <div className="miniapps-app-shell" data-theme={theme}>
      {/* ENCABEZADO UNIFICADO "CONTROL DE ACCESOS" — solo visible en PC (modo split) */}
      {isSplitMode && (
        <header className="miniapps-global-header">
          <div className="miniapps-global-header-left">
            <span className="miniapps-global-header-icon">
              {effectiveRightApp === 'recorridos' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
              ) : effectiveRightApp === 'bitacora' ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>) : (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </span>
            <h1 className="miniapps-global-header-title">
              {effectiveRightApp === 'recorridos'
                ? 'Recorridos'
                : effectiveRightApp === 'bitacora'
                ? 'Bitácora'
                : effectiveRightApp === 'mec'
                ? 'MEC Carretera'
                : 'Control de Accesos'}
            </h1>
            <div
              className="backend-status-badge is-local"
              title="Mini Apps 3 v3.0.0 • Servidor UBE Conectado (Puerto 7001)"
              role="button"
              tabIndex={0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                fontSize: '11px',
                marginLeft: '8px',
                cursor: 'pointer'
              }}
            >
              <span>✅</span>
            </div>
          </div>

          {/* BOTONES DE APPS — Muestra únicamente las aplicaciones autorizadas que NO están seleccionadas actualmente */}
          <nav className="miniapps-global-header-nav" aria-label="Acceso rápido apps">
            {features.checador && effectiveRightApp !== 'checador' && (
              <button
                type="button"
                className="miniapps-header-app-btn"
                onClick={() => { sounds.click(); handleSelectParallelApp('checador'); }}
                title="Cambiar a Checador"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Checador</span>
              </button>
            )}
            {features.recorridos && effectiveRightApp !== 'recorridos' && (
              <button
                type="button"
                className="miniapps-header-app-btn"
                onClick={() => { sounds.click(); handleSelectParallelApp('recorridos'); }}
                title="Cambiar a Recorridos"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>Recorridos</span>
              </button>
            )}
            {(features.bitacoras || features.bitacora) && effectiveRightApp !== 'bitacora' && (
              <button
                type="button"
                className="miniapps-header-app-btn"
                onClick={() => { sounds.click(); handleSelectParallelApp('bitacora'); }}
                title="Cambiar a Bitácora"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Bitácora</span>
              </button>
            )}
            {features.mec && effectiveRightApp !== 'mec' && (
              <button
                type="button"
                className="miniapps-header-app-btn"
                onClick={() => { sounds.click(); handleSelectParallelApp('mec'); }}
                title="Cambiar a MEC Carretera"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3c-.1.3-.1.6-.1.8v5c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
                <span>MEC</span>
              </button>
            )}
          </nav>

          <div className="miniapps-global-header-right">
            {/* Botón Identificar Dispositivo en RegAs 3 */}
            <button
              type="button"
              className={`miniapps-id-btn ${isIdentifying ? 'active' : ''}`}
              onClick={handleIdentifyDevice}
              title="Identificar este dispositivo en RegAs 3 (Actividades > CDI)"
            >
              <span>ID</span>
            </button>

            {/* Botón cambio de tema: solo icono sin texto */}
            <button
              type="button"
              className="cdi-theme-btn"
              onClick={() => { sounds.click(); toggleTheme(); }}
              title={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
            >
              <span className="cdi-theme-btn-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
            </button>
            {/* Reloj grande */}
            <div className="miniapps-global-clock">{currentTime}</div>
          </div>
        </header>
      )}

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
          {activeApp === 'cdi' && <CDIApp theme={theme} onToggleTheme={isSplitMode ? null : toggleTheme} onIdentifyDevice={isSplitMode ? null : handleIdentifyDevice} isIdentifying={isIdentifying} />}
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

            {/* DOCK EN PANEL DERECHO: Suprimido en modo PC — los botones están en el encabezado global */}
          </div>
        )}
      </main>

      {/* DOCK INFERIOR GLOBAL: Solo visible cuando NO está en vista paralela */}
      {!isSplitMode && (
        <MiniAppsDock
          currentApp={activeApp}
          excludeApp={activeApp}
          parallelApp={null}
          onSelectApp={handleSelectApp}
          features={features}
          theme={theme}
        />
      )}
    </div>
  );
}
