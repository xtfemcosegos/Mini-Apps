import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import './MiniAppsDock.css';
import { sounds } from '../../services/api';

const MINIAPPS_WEB_URL = 'https://cic-os-miniapps.web.app';

export default function MiniAppsDock({
  currentApp,
  parallelApp,
  onSelectApp,
  onToggleParallel,
  features = {},
  excludeApp = null,
  excludeApps = [],
  isPaneDock = false,
  showCloseButton = false,
  onCloseParallel = null
}) {
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    app: null
  });

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Generar código QR para https://cic-os-miniapps.web.app
  useEffect(() => {
    QRCode.toDataURL(MINIAPPS_WEB_URL, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('[Error generando QR]', err));
  }, []);

  const handleCopyLink = () => {
    sounds.click();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(MINIAPPS_WEB_URL).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      });
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const allApps = [
    {
      id: 'cdi',
      name: 'CDI',
      iconClass: 'icon-cdi',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 12h10M12 7v10" />
        </svg>
      )
    },
    {
      id: 'checador',
      name: 'Checador',
      iconClass: 'icon-checador',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )
    },
    {
      id: 'recorridos',
      name: 'Recorridos',
      iconClass: 'icon-recorridos',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      )
    },
    {
      id: 'bitacora',
      name: 'Bitácora',
      iconClass: 'icon-bitacora',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    },
    {
      id: 'mec',
      name: 'MEC',
      iconClass: 'icon-mec',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3c-.1.3-.1.6-.1.8v5c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      )
    },
    {
      id: 'prestadores',
      name: 'Prestadores',
      iconClass: 'icon-prestadores',
      svg: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )
    }
  ];

  // Cerrar menú contextual al hacer clic fuera o redimensionar
  useEffect(() => {
    const handleClose = () => {
      setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('resize', handleClose);
    window.addEventListener('scroll', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('scroll', handleClose);
    };
  }, []);

  // Determinar lista de apps excluidas (ej. las que ya están visibles en pantalla: izquierda y derecha)
  const excluded = [
    ...(Array.isArray(excludeApps) ? excludeApps : [excludeApps]),
    ...(excludeApp ? [excludeApp] : [])
  ].filter(Boolean);

  // Filtrar aplicaciones según permisos habilitados por el operador en RegAs 3
  const visibleApps = allApps.filter((app) => {
    // Si la app está en la lista de exclusión (o sea, ya está visible en alguno de los paneles)
    if (excluded.includes(app.id)) return false;
    if (app.id === 'cdi') return true; // CDI siempre activo por defecto
    if (app.id === 'checador') return features.checador === true;
    if (app.id === 'recorridos') return features.recorridos === true;
    if (app.id === 'bitacora' || app.id === 'bitacoras') return (features.bitacoras === true || features.bitacora === true);
    if (app.id === 'mec') return features.mec === true;
    if (app.id === 'prestadores') return features.prestadores === true;
    return false;
  });

  // Si es un dock de panel interno (panel derecho) y no hay aplicaciones para seleccionar, ocultar completamente
  if (isPaneDock && visibleApps.length === 0 && !showCloseButton) {
    return null;
  }

  // Si no hay otras aplicaciones autorizadas para cambiar y no es un dock con botón de cerrar, ocultar completamente
  const minVisible = excluded.length > 0 ? 0 : 1;
  if (!showCloseButton && !isPaneDock && visibleApps.length <= minVisible) {
    return null;
  }

  const isCompactParallel = isPaneDock && showCloseButton && visibleApps.length === 0;

  const handleItemClick = (app) => {
    sounds.click();
    if (onSelectApp) {
      onSelectApp(app.id);
    }
  };

  const handleItemContextMenu = (e, app) => {
    e.preventDefault();
    e.stopPropagation();

    // Solo permitir opciones para aplicaciones habilitadas
    if (!features[app.id] && app.id !== 'cdi') return;

    sounds.beep();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 230;
    const menuHeight = 110;
    const posX = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left + rect.width / 2 - menuWidth / 2));
    const posY = Math.max(12, rect.top - menuHeight - 8);

    setContextMenu({
      visible: true,
      x: posX,
      y: posY,
      app
    });
  };

  return (
    <>
      <div className={`miniapps-dock-wrapper ${isPaneDock ? 'is-pane-dock' : ''}`}>
        <nav className={`miniapps-dock-bar ${isCompactParallel ? 'compact-parallel' : ''}`} aria-label="Navegación Mini Apps">
          {/* 1. BOTÓN DE CÓDIGO QR SIEMPRE A LA IZQUIERDA */}
          <button
            type="button"
            className="dock-item-btn dock-btn-qr"
            onClick={() => {
              sounds.click();
              setQrModalOpen(true);
            }}
            title="Abrir código QR para celular (https://cic-os-miniapps.web.app)"
            aria-label="Abrir código QR para celular"
          >
            <div className="dock-icon-squircle icon-qr">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <path d="M7 7h.01M17 7h.01M17 17h.01M7 17h.01" strokeWidth="3" />
              </svg>
            </div>
            {!isPaneDock && <span className="dock-item-label">Móvil</span>}
            {isPaneDock && visibleApps.length > 0 && <span className="dock-item-label">Móvil</span>}
          </button>

          {/* 2. APLICACIONES DISPONIBLES EN MEDIO EN TODOS LOS CASOS */}
          {visibleApps.map((app) => {
            const isMainActive = currentApp === app.id;
            const isParallelActive = !isPaneDock && parallelApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                className={`dock-item-btn ${isMainActive ? 'active' : ''} ${isParallelActive ? 'is-parallel' : ''}`}
                onClick={() => handleItemClick(app)}
                onContextMenu={(e) => {
                  if (!isPaneDock) handleItemContextMenu(e, app);
                }}
                title={isPaneDock ? `Abrir ${app.name} en este panel` : `${app.name} (Clic derecho: Opciones paralelas)`}
              >
                {isParallelActive && (
                  <span className="dock-parallel-tag">Paralelo</span>
                )}
                <div className={`dock-icon-squircle ${app.iconClass}`}>
                  {app.svg}
                </div>
                <span className="dock-item-label">{app.name}</span>
              </button>
            );
          })}

          {/* 3. BOTÓN DE CERRAR VISTA PARALELA A LA DERECHA */}
          {showCloseButton && (
            <button
              type="button"
              className="dock-item-btn dock-btn-close-red"
              onClick={() => {
                sounds.click();
                if (onCloseParallel) onCloseParallel();
              }}
              title="Cerrar vista paralela"
              aria-label="Cerrar vista paralela"
            >
              <div className="dock-icon-squircle icon-close-red">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
            </button>
          )}
        </nav>
      </div>

      {/* Modal de Código QR para acceso móvil */}
      {qrModalOpen && (
        <div className="miniapps-qr-modal-backdrop" onClick={() => setQrModalOpen(false)}>
          <div className="miniapps-qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="miniapps-qr-modal-header">
              <div className="miniapps-qr-header-title">
                <span className="qr-header-icon">📱</span>
                <div>
                  <h3>Acceso Móvil Mini Apps</h3>
                  <p>Escanea el código con tu celular</p>
                </div>
              </div>
              <button
                type="button"
                className="miniapps-qr-close-btn"
                onClick={() => setQrModalOpen(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="miniapps-qr-modal-body">
              <div className="miniapps-qr-code-frame">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Código QR Mini Apps" className="miniapps-qr-img" />
                ) : (
                  <div className="miniapps-qr-loading">Cargando código QR...</div>
                )}
              </div>

              <div className="miniapps-qr-url-box">
                <span className="miniapps-qr-url-text">{MINIAPPS_WEB_URL}</span>
                <button
                  type="button"
                  className={`miniapps-qr-copy-btn ${copiedLink ? 'copied' : ''}`}
                  onClick={handleCopyLink}
                >
                  {copiedLink ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>

              <p className="miniapps-qr-hint">
                Apunta con la cámara de tu teléfono móvil para abrir la versión portátil de CDI, Checador Facial, Recorridos y Bitácoras.
              </p>
            </div>

            <div className="miniapps-qr-modal-footer">
              <button
                type="button"
                className="miniapps-qr-btn-primary"
                onClick={() => setQrModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú Contextual Flotante al dar Clic Derecho */}
      {contextMenu.visible && contextMenu.app && (
        <div
          className="dock-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dock-context-menu-header">
            Opciones de {contextMenu.app.name}
          </div>

          {contextMenu.app.id !== 'cdi' ? (
            <>
              {parallelApp === contextMenu.app.id ? (
                <button
                  type="button"
                  className="dock-context-item danger"
                  onClick={() => {
                    sounds.click();
                    if (onToggleParallel) onToggleParallel(null);
                    setContextMenu({ ...contextMenu, visible: false });
                  }}
                >
                  <span className="dock-context-icon">✕</span>
                  <span>Cerrar vista paralela</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="dock-context-item"
                  onClick={() => {
                    sounds.click();
                    if (onToggleParallel) onToggleParallel(contextMenu.app.id);
                    setContextMenu({ ...contextMenu, visible: false });
                  }}
                >
                  <span className="dock-context-icon">◫</span>
                  <span>Mostrar en paralelo</span>
                </button>
              )}

              <button
                type="button"
                className="dock-context-item"
                onClick={() => {
                  sounds.click();
                  if (onSelectApp) onSelectApp(contextMenu.app.id, true);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <span className="dock-context-icon">🗖</span>
                <span>Pantalla completa</span>
              </button>
            </>
          ) : (
            <>
              {parallelApp && (
                <button
                  type="button"
                  className="dock-context-item"
                  onClick={() => {
                    sounds.click();
                    if (onToggleParallel) onToggleParallel(null);
                    setContextMenu({ ...contextMenu, visible: false });
                  }}
                >
                  <span className="dock-context-icon">🗖</span>
                  <span>Ver solo CDI (Quitar paralelo)</span>
                </button>
              )}
              <button
                type="button"
                className="dock-context-item"
                onClick={() => {
                  sounds.click();
                  if (onSelectApp) onSelectApp('cdi');
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <span className="dock-context-icon">✓</span>
                <span>Poner CDI a la izquierda</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
