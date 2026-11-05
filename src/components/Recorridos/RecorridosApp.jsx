import React, { useState, useEffect, useRef } from 'react';
import './RecorridosApp.css';
import { saveRecorrido, sendRecorridoLocationPing, sounds } from '../../services/api';

const OFFICIAL_CHECKPOINTS = {
  recorrido_seguridad_elementos: [
    { id: 'p1', name: 'Caseta de Seguridad y Acceso', icon: '🚪', verified: false, time: null },
    { id: 'p2', name: 'Oficinas Planta Baja y Pasillos', icon: '🏢', verified: false, time: null },
    { id: 'p3', name: 'Mesas y Salas de Juntas', icon: '💻', verified: false, time: null },
    { id: 'p4', name: 'Sites de TI y Cuartos de Clima', icon: '⚡', verified: false, time: null },
    { id: 'p5', name: 'Estacionamientos y Cajones', icon: '🚗', verified: false, time: null },
    { id: 'p6', name: 'Perímetro Exterior y Mallas', icon: '🛡️', verified: false, time: null }
  ],
  recorrido_perimetral: [
    { id: 'p1', name: 'Caseta de Origen y Barreras', icon: '🛡️', verified: false, time: null },
    { id: 'p2', name: 'Perímetro Norte y Vallas', icon: '🧱', verified: false, time: null },
    { id: 'p3', name: 'Puertas de Emergencia y Esclusas', icon: '🚪', verified: false, time: null },
    { id: 'p4', name: 'Portón de Carga y Proveedores', icon: '🚚', verified: false, time: null },
    { id: 'p5', name: 'Perímetro Sur y Reflectores', icon: '💡', verified: false, time: null }
  ]
};

export default function RecorridosApp({ theme, onToggleTheme }) {
  const [selectedSchema, setSelectedSchema] = useState('recorrido_seguridad_elementos');
  const [isPatrolling, setIsPatrolling] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [checkpoints, setCheckpoints] = useState(() => OFFICIAL_CHECKPOINTS.recorrido_seguridad_elementos);
  const [currentCoords, setCurrentCoords] = useState(null);

  const timerRef = useRef(null);
  const watchIdRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    setCheckpoints(OFFICIAL_CHECKPOINTS[selectedSchema] || OFFICIAL_CHECKPOINTS.recorrido_seguridad_elementos);
  }, [selectedSchema]);

  useEffect(() => {
    return () => {
      stopPatrolTracking();
    };
  }, []);

  const startPatrolTracking = () => {
    sounds.success();
    setIsPatrolling(true);
    setSeconds(0);
    setDistanceMeters(0);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    if (navigator.geolocation) {
      let lastPos = null;
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setCurrentCoords({ latitude, longitude, accuracy });

          if (lastPos) {
            const d = calculateDistance(lastPos.lat, lastPos.lng, latitude, longitude);
            if (d > 2) {
              setDistanceMeters((prev) => Math.round(prev + d));
            }
          }
          lastPos = { lat: latitude, lng: longitude };

          sendRecorridoLocationPing({
            coords: { latitude, longitude, accuracy },
            timestamp: Date.now(),
            schemaId: selectedSchema
          }).catch(() => {});
        },
        (err) => {
          console.warn('[Recorridos] GPS Warning:', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
  };

  const stopPatrolTracking = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (watchIdRef.current && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (isPatrolling) {
      sounds.click();
      const verifiedCount = checkpoints.filter((p) => p.verified).length;
      try {
        await saveRecorrido({
          schemaId: selectedSchema,
          startTime: startTimeRef.current,
          endTime: Date.now(),
          durationSeconds: seconds,
          distanceMeters,
          verifiedPoints: checkpoints.filter((p) => p.verified),
          status: 'completado'
        });
        alert(`Recorrido concluido con éxito.\nDistancia: ${distanceMeters} m\nPuntos verificados: ${verifiedCount}/${checkpoints.length}`);
      } catch (e) {
        console.warn('[Recorridos] Error al guardar recorrido:', e);
      }
    }
    setIsPatrolling(false);
  };

  const handleVerifyPoint = (pointId) => {
    sounds.beep();
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setCheckpoints((prev) =>
      prev.map((pt) => {
        if (pt.id === pointId) {
          return { ...pt, verified: true, time: nowStr };
        }
        return pt;
      })
    );
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatTimer = (totalSec) => {
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const verifiedPointsCount = checkpoints.filter((p) => p.verified).length;

  return (
    <div className="recorridos-container">
      {/* HEADER CARD */}
      <div className="recorridos-header-card">
        <div className="recorridos-top-row">
          <div className="recorridos-title-box">
            <span style={{ fontSize: '1.2rem' }}>🚶</span>
            <h1 className="recorridos-title">Recorridos de Seguridad</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="cdi-theme-btn"
              onClick={() => { sounds.click(); if (onToggleTheme) onToggleTheme(); }}
              title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
            >
              <span>{theme === 'light' ? '☀️' : '🌙'}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
            </button>
            <span className={`recorridos-status-pill ${isPatrolling ? 'status-en-recorrido' : 'status-en-base'}`}>
              {isPatrolling ? '● EN RONDÍN' : 'EN BASE'}
            </span>
          </div>
        </div>

        <select
          value={selectedSchema}
          onChange={(e) => setSelectedSchema(e.target.value)}
          disabled={isPatrolling}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '12px',
            background: 'rgba(30,41,59,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f8fafc',
            fontWeight: 700,
            fontSize: '0.85rem',
            outline: 'none'
          }}
        >
          <option value="recorrido_seguridad_elementos">Recorrido de Seguridad (Elementos)</option>
          <option value="recorrido_perimetral">Recorrido Perimetral (Casetas)</option>
        </select>
      </div>

      {/* STATS BAR */}
      <div className="recorridos-stats-grid">
        <div className="stat-box">
          <div className="stat-label">Tiempo</div>
          <div className="stat-value">{formatTimer(seconds)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Distancia</div>
          <div className="stat-value">{distanceMeters} m</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Puntos</div>
          <div className="stat-value">{verifiedPointsCount}/{checkpoints.length}</div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="recorridos-actions-row">
        {!isPatrolling ? (
          <button
            type="button"
            className="btn-recorrido-main btn-start-recorrido"
            onClick={startPatrolTracking}
          >
            <span>▶</span>
            <span>INICIAR RECORRIDO</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-recorrido-main btn-finish-recorrido"
            onClick={stopPatrolTracking}
          >
            <span>⏹</span>
            <span>CONCLUIR RECORRIDO</span>
          </button>
        )}
      </div>

      {/* CHECKPOINTS SECTION */}
      <div className="checkpoints-section-title">Puntos de Control</div>
      <div className="checkpoints-list">
        {checkpoints.map((pt) => (
          <div key={pt.id} className={`checkpoint-card ${pt.verified ? 'verified' : ''}`}>
            <div className="checkpoint-info">
              <span className="checkpoint-icon">{pt.icon}</span>
              <div>
                <div className="checkpoint-name">{pt.name}</div>
                {pt.verified && <div className="checkpoint-time">Verificado: {pt.time} hrs</div>}
              </div>
            </div>

            <button
              type="button"
              className="btn-verify-point"
              disabled={!isPatrolling || pt.verified}
              onClick={() => handleVerifyPoint(pt.id)}
            >
              {pt.verified ? '✓ LISTO' : 'VERIFICAR'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
