import React from 'react';
import './MiniAppsDock.css';
import { sounds } from '../../services/api';

export default function MiniAppsDock({ currentApp, onSelectApp }) {
  const apps = [
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
    }
  ];

  const handleItemClick = (app) => {
    sounds.click();
    const search = window.location.search || '';
    if (app.id === 'checador') {
      window.location.href = 'checador-movil.html' + search;
      return;
    }
    onSelectApp(app.id);
  };

  return (
    <div className="miniapps-dock-wrapper">
      <nav className="miniapps-dock-bar" aria-label="Navegación Mini Apps">
        {apps.map((app) => {
          const isActive = currentApp === app.id;
          return (
            <button
              key={app.id}
              type="button"
              className={`dock-item-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleItemClick(app)}
              title={app.name}
            >
              <div className={`dock-icon-squircle ${app.iconClass}`}>
                {app.svg}
              </div>
              <span className="dock-item-label">{app.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
