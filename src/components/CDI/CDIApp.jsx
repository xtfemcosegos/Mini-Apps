import React, { useState, useEffect, useRef } from 'react';
import './CDIApp.css';
import {
  fetchCdiCounts,
  incrementCdiCount,
  sendDeviceHeartbeat,
  updateDeviceCaseta,
  requestDeviceLocation,
  initCdiSse,
  getDeviceUuid,
  getTodayDateIso,
  sounds
} from '../../services/api';

const CASETAS = [
  'Recepción Edison',
  'Edison',
  'Impulso',
  'Michelena',
  'Simón Bolívar',
  'Carranza',
  'Universidad',
  'Anexo Edison',
  'Centro de Control'
];

const normCaseta = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const findCasetaCounts = (casetasMap, targetCaseta) => {
  if (!casetasMap || typeof casetasMap !== 'object') return null;
  if (casetasMap[targetCaseta]) return casetasMap[targetCaseta];
  const targetNorm = normCaseta(targetCaseta);
  const matchedKey = Object.keys(casetasMap).find(k => normCaseta(k) === targetNorm);
  return matchedKey ? casetasMap[matchedKey] : null;
};

export default function CDIApp({ theme, onToggleTheme }) {
  const [caseta, setCaseta] = useState(() => {
    return localStorage.getItem('selectedCaseta') || 'Recepción Edison';
  });
  const [mode, setMode] = useState('add'); // 'add' (+1) | 'sub' (-1 / corrección)
  const [counts, setCounts] = useState({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [pendingDeltas, setPendingDeltas] = useState({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState('Monitor Conectado');

  // Timers independientes por categoría para no cancelar eventos concurrentes
  const debounceTimersRef = useRef({});
  const pendingDeltasRef = useRef({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });

  const currentDateStr = new Date().toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  // Cargar conteos al montar o cambiar caseta
  useEffect(() => {
    localStorage.setItem('selectedCaseta', caseta);
    localStorage.setItem('regas_cdi_last_caseta', caseta);
    localStorage.setItem('caseta_seleccionada_cic', caseta);
    loadCounts(caseta);
  }, [caseta]);

  // Escuchar reasignación remota de caseta enviada por el operador desde RegAs 3
  useEffect(() => {
    const handleCasetaUpdate = (e) => {
      const newCaseta = e.detail && e.detail.caseta;
      if (newCaseta && typeof newCaseta === 'string') {
        const clean = newCaseta.trim();
        console.log('[CDI] Caseta reasignada remotamente desde RegAs 3:', clean);
        localStorage.setItem('selectedCaseta', clean);
        localStorage.setItem('regas_cdi_last_caseta', clean);
        localStorage.setItem('caseta_seleccionada_cic', clean);
        setCaseta(clean);
        loadCounts(clean);
        window.postMessage({ type: 'cdi_caseta_changed', caseta: clean }, '*');
      }
    };
    window.addEventListener('miniapps_caseta_updated', handleCasetaUpdate);
    return () => window.removeEventListener('miniapps_caseta_updated', handleCasetaUpdate);
  }, []);

  // SEÑAL Y LATIDO PERIÓDICO HACIA EL MONITOR DE OPERADOR (CCO) + SSE EN VIVO
  useEffect(() => {
    const doHeartbeat = () => {
      sendDeviceHeartbeat(caseta).then((res) => {
        if (res && res.caseta && res.caseta !== caseta) {
          setCaseta(res.caseta);
        }
      });
    };

    // 1. Enviar latido de señal inicial
    doHeartbeat();

    // 2. Solicitar GPS y reenviar señal con coordenadas
    requestDeviceLocation(() => {
      doHeartbeat();
    });

    // 3. Latido periódico cada 25 segundos para mantener estado "En Vivo" en monitor
    const heartbeatTimer = setInterval(() => {
      doHeartbeat();
    }, 25000);

    // 4. Latido inmediato al desbloquear o volver a la pestaña
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        doHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 5. Escuchar eventos SSE de UBE en tiempo real
    const cleanupSse = initCdiSse(
      (cdiPayload) => {
        if (!cdiPayload) return;
        const todayIso = getTodayDateIso();
        if (cdiPayload.fecha === todayIso || (cdiPayload.cdi && cdiPayload.cdi.fecha === todayIso)) {
          const hasPending = Object.values(pendingDeltasRef.current).some((v) => v !== 0);
          if (cdiPayload.cdi && cdiPayload.cdi.casetas && !hasPending) {
            const c = findCasetaCounts(cdiPayload.cdi.casetas, caseta);
            setCounts({
              internos: c ? Number(c.internos || 0) : 0,
              externos: c ? Number(c.externos || 0) : 0,
              prestadores: c ? Number(c.prestadores || 0) : 0,
              visitas: c ? Number(c.visitas || 0) : 0
            });
            if (cdiPayload.cdi.totals) {
              setTotalGeneral(Number(cdiPayload.cdi.totals.total || 0));
            }
          } else if (!hasPending && cdiPayload.caseta && cdiPayload.casetaCounts) {
            const targetNorm = normCaseta(caseta.replace(' // Call Center', ''));
            if (normCaseta(cdiPayload.caseta) === targetNorm) {
              setCounts({
                internos: Number(cdiPayload.casetaCounts.internos || 0),
                externos: Number(cdiPayload.casetaCounts.externos || 0),
                prestadores: Number(cdiPayload.casetaCounts.prestadores || 0),
                visitas: Number(cdiPayload.casetaCounts.visitas || 0)
              });
            }
            if (cdiPayload.totals) {
              setTotalGeneral(Number(cdiPayload.totals.total || 0));
            }
          } else if (cdiPayload.totals) {
            setTotalGeneral(Number(cdiPayload.totals.total || 0));
          }
        }
      },
      (devicePayload) => {
        const myDevId = getDeviceUuid();
        if (devicePayload && (devicePayload.deviceId === myDevId || devicePayload._id === myDevId)) {
          setLastSyncMsg('Monitor Conectado');
          if (devicePayload.caseta && devicePayload.caseta !== caseta) {
            console.log('[CDI SSE] Caseta actualizada desde RegAs 3:', devicePayload.caseta);
            setCaseta(devicePayload.caseta);
          }
        }
      }
    );

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      cleanupSse();
    };
  }, [caseta]);

  const loadCounts = async (targetCaseta = caseta) => {
    try {
      setSyncing(true);
      setLastSyncMsg('Sincronizando...');
      const data = await fetchCdiCounts();
      if (data) {
        const casetasMap = (data.cdi && data.cdi.casetas) ? data.cdi.casetas : (data.casetas || data);
        const c = findCasetaCounts(casetasMap, targetCaseta || caseta);
        setCounts({
          internos: c ? Number(c.internos || 0) : 0,
          externos: c ? Number(c.externos || 0) : 0,
          prestadores: c ? Number(c.prestadores || 0) : 0,
          visitas: c ? Number(c.visitas || 0) : 0
        });

        if (data.cdi && data.cdi.totals) {
          setTotalGeneral(Number(data.cdi.totals.total || 0));
        } else if (data.totals) {
          setTotalGeneral(Number(data.totals.total || 0));
        } else if (casetasMap) {
          const sumTotal = Object.values(casetasMap).reduce((acc, obj) => {
            return acc + (Number(obj?.total) || (Number(obj?.internos || 0) + Number(obj?.externos || 0) + Number(obj?.prestadores || 0) + Number(obj?.visitas || 0)));
          }, 0);
          setTotalGeneral(sumTotal);
        }
      }
      setLastSyncMsg('Monitor Conectado');
    } catch (e) {
      console.warn('[CDI] Sin conexión inicial al cargar conteos:', e);
      setLastSyncMsg('Sin conexión');
    } finally {
      setSyncing(false);
    }
  };

  const triggerHaptic = (ms = 25) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) {}
    }
  };

  const handleCasetaChange = (newCaseta) => {
    setCaseta(newCaseta);
    localStorage.setItem('selectedCaseta', newCaseta);
    localStorage.setItem('regas_cdi_last_caseta', newCaseta);
    localStorage.setItem('caseta_seleccionada_cic', newCaseta);
    window.postMessage({ type: 'cdi_caseta_changed', caseta: newCaseta }, '*');
    // Notificar al monitor del operador del cambio de caseta inmediatamente
    updateDeviceCaseta(newCaseta).catch(() => {});
    sendDeviceHeartbeat(newCaseta);
  };

  const handleTap = (category) => {
    triggerHaptic(mode === 'add' ? 25 : 35);
    sounds.beep();

    const step = mode === 'add' ? 1 : -1;

    setCounts((prev) => {
      const current = prev[category] || 0;
      const nextVal = Math.max(0, current + step);
      const effectiveDelta = nextVal - current;

      // Si ya está en 0 y se intenta restar, no hacer nada
      if (effectiveDelta === 0 && step < 0) {
        return prev;
      }

      // Actualizar total general en tiempo real local
      setTotalGeneral((prevGen) => Math.max(0, prevGen + effectiveDelta));

      // Acumular delta en ref para el debounce
      pendingDeltasRef.current[category] = (pendingDeltasRef.current[category] || 0) + effectiveDelta;
      setPendingDeltas({ ...pendingDeltasRef.current });

      // Despacho con debounce por categoría (400ms)
      if (debounceTimersRef.current[category]) {
        clearTimeout(debounceTimersRef.current[category]);
      }

      debounceTimersRef.current[category] = setTimeout(async () => {
        const deltaToSend = pendingDeltasRef.current[category];
        if (deltaToSend === 0) return;

        // Limpiar delta pendiente antes del envío
        pendingDeltasRef.current[category] = 0;
        setPendingDeltas({ ...pendingDeltasRef.current });

        try {
          setSyncing(true);
          setLastSyncMsg('Transmitiendo...');
          const res = await incrementCdiCount(caseta, category, deltaToSend);
          if (res && res.cdi && res.cdi.casetas) {
            const updated = findCasetaCounts(res.cdi.casetas, caseta);
            if (updated) {
              setCounts({
                internos: Number(updated.internos || 0),
                externos: Number(updated.externos || 0),
                prestadores: Number(updated.prestadores || 0),
                visitas: Number(updated.visitas || 0)
              });
            }
            if (res.cdi.totals) {
              setTotalGeneral(Number(res.cdi.totals.total || 0));
            }
          }
          // Enviar señal de latido actualizada al monitor del operador
          sendDeviceHeartbeat(caseta);
          setLastSyncMsg('Monitor Conectado');
        } catch (e) {
          console.warn('[CDI] Error al sincronizar con backend:', e);
          setLastSyncMsg('Reintentando...');
          // Restaurar delta pendiente para reintento
          pendingDeltasRef.current[category] = (pendingDeltasRef.current[category] || 0) + deltaToSend;
          setPendingDeltas({ ...pendingDeltasRef.current });
        } finally {
          setSyncing(false);
        }
      }, 400);

      return { ...prev, [category]: nextVal };
    });
  };

  const totalCaseta = (counts.internos || 0) + (counts.externos || 0) + (counts.prestadores || 0) + (counts.visitas || 0);

  const categories = [
    { key: 'internos', name: 'Internos', icon: '👤', color: '#2563eb' },
    { key: 'externos', name: 'Externos', icon: '🏢', color: '#059669' },
    { key: 'prestadores', name: 'Prestadores', icon: '🔧', color: '#d97706' },
    { key: 'visitas', name: 'Visitas', icon: '📋', color: '#7c3aed' }
  ];

  return (
    <div className="cdi-container">
      {/* 1. HEADER CARD (SUPERIOR) */}
      <header className="cdi-header-card">
        <div className="cdi-top-bar">
          <div className="cdi-brand-group">
            <span className={`cdi-badge-dot ${syncing ? 'syncing' : ''}`} />
            <h1 className="cdi-app-title">CDI Móvil</h1>
            <span className="cdi-live-badge">{lastSyncMsg}</span>
          </div>

          <div className="cdi-top-actions">
            {/* SELECTOR DE MODO CLARO / OSCURO */}
            <button
              type="button"
              className="cdi-theme-btn"
              onClick={() => {
                sounds.click();
                if (onToggleTheme) onToggleTheme();
              }}
              title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
              aria-label="Alternar modo claro u oscuro"
            >
              <span className="theme-btn-icon">{theme === 'light' ? '☀️' : '🌙'}</span>
              <span className="theme-btn-text">{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
            </button>

            <span className="cdi-date-tag">{currentDateStr}</span>
          </div>
        </div>

        {/* CONTROLES: SELECTOR DE CASETA Y TOGGLE DE MODO */}
        <div className="cdi-controls-row">
          <div className="cdi-caseta-box">
            <select
              className="cdi-caseta-select"
              value={caseta}
              onChange={(e) => handleCasetaChange(e.target.value)}
              aria-label="Seleccionar Caseta"
            >
              {!CASETAS.includes(caseta) && (
                <option value={caseta}>{caseta}</option>
              )}
              {CASETAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="cdi-mode-toggle" role="group" aria-label="Modo de Operación">
            <button
              type="button"
              className={`mode-btn mode-add ${mode === 'add' ? 'active' : ''}`}
              onClick={() => { sounds.click(); setMode('add'); }}
            >
              +1 SUMA
            </button>
            <button
              type="button"
              className={`mode-btn mode-sub ${mode === 'sub' ? 'active' : ''}`}
              onClick={() => { sounds.click(); setMode('sub'); }}
            >
              −1 RESTA
            </button>
          </div>
        </div>
      </header>

      {/* 2. AVISO VISUAL DE MODO CORRECCIÓN (-1) */}
      {mode === 'sub' && (
        <div className="cdi-mode-alert-banner" role="alert">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">Modo Corrección (−1) activo: Cada toque restará 1 unidad</span>
        </div>
      )}

      {/* 3. ÁREA PRINCIPAL: BOTONES CONTADORES AMPLIOS QUE OCUPAN EL ESPACIO DISPONIBLE */}
      <main className="cdi-main-area">
        <div className="cdi-cards-grid">
          {categories.map((cat) => {
            const delta = pendingDeltas[cat.key] || 0;
            const currentCount = counts[cat.key] || 0;

            return (
              <button
                key={cat.key}
                type="button"
                className={`cdi-counter-card card-${cat.key} ${mode === 'sub' ? 'mode-correction' : ''}`}
                onClick={() => handleTap(cat.key)}
                aria-label={`${cat.name}: ${currentCount}`}
              >
                <div className="card-top">
                  <div className="card-title-group">
                    <span className="card-icon">{cat.icon}</span>
                    <span className="card-title">{cat.name}</span>
                  </div>
                  {delta !== 0 && (
                    <span className={`card-badge-delta ${delta > 0 ? 'delta-pos' : 'delta-neg'}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>

                <div className="card-count-display">{currentCount}</div>

                <div className="card-action-bar">
                  <div className="btn-tap-action">
                    <span>{mode === 'add' ? '+1 Registrar' : '−1 Corregir'}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 4. CONTEO POR CASETA Y CONTEO GENERAL DEBAJO DE LOS BOTONES CONTADORES */}
        <section className="cdi-bottom-summary" aria-label="Resumen de Conteos">
          <div className="summary-item summary-caseta">
            <div className="summary-info">
              <span className="summary-label">Total Caseta</span>
              <span className="summary-sub" title={caseta}>{caseta}</span>
            </div>
            <span className="summary-value" id="summaryCasetaVal">{totalCaseta}</span>
          </div>

          <div className="summary-divider" />

          <div className="summary-item summary-general">
            <div className="summary-info">
              <span className="summary-label">Total General</span>
              <span className="summary-sub">Todas las Casetas</span>
            </div>
            <span className="summary-value" id="summaryGeneralVal">{totalGeneral}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
