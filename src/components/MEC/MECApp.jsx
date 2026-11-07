import React, { useState, useEffect, useRef } from 'react';
import './MECApp.css';
import { getDeviceFeatures, getDeviceUuid, sendMecLocationPing, sounds } from '../../services/api';

export default function MECApp({ theme, onToggleTheme }) {
  const [features, setFeatures] = useState(() => getDeviceFeatures());
  const [isAuthorized, setIsAuthorized] = useState(() => Boolean(getDeviceFeatures().mec));

  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [heading, setHeading] = useState(null);

  const [unitId, setUnitId] = useState('MEC-01');
  const [operator, setOperator] = useState('Oficial al Volante');
  const [tramo, setTramo] = useState('Carr. Fed 57 — Saltillo / Matehuala');
  const [km, setKm] = useState('');
  const [events, setEvents] = useState([]);

  const timerRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastPosRef = useRef(null);
  const breadcrumbsRef = useRef([]);

  useEffect(() => {
    const handleFeats = (e) => {
      if (e.detail) {
        setFeatures(e.detail);
        setIsAuthorized(Boolean(e.detail.mec));
      }
    };
    window.addEventListener('miniapps_features_updated', handleFeats);
    return () => window.removeEventListener('miniapps_features_updated', handleFeats);
  }, []);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  const startTracking = () => {
    sounds.success();
    setIsTracking(true);
    setIsPaused(false);
    setSeconds(0);
    setDistanceMeters(0);
    lastPosRef.current = null;
    breadcrumbsRef.current = [];

    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy: acc, speed, heading: hd } = pos.coords;
          const currentSpeed = (speed !== null && speed > 0) ? Math.round(speed * 3.6) : 0;
          setSpeedKmh(currentSpeed);
          setAccuracy(Math.round(acc));
          if (typeof hd === 'number') setHeading(Math.round(hd));

          if (lastPosRef.current) {
            const d = calcDistance(lastPosRef.current.lat, lastPosRef.current.lng, latitude, longitude);
            if (d > 3 && d < 500) {
              setDistanceMeters((prev) => prev + d);
            }
          }
          lastPosRef.current = { lat: latitude, lng: longitude };
          breadcrumbsRef.current.push({ lat: latitude, lng: longitude, speed: currentSpeed, timestamp: new Date().toISOString() });

          sendMecLocationPing({
            unitId,
            deviceId: getDeviceUuid(),
            operator,
            tramo,
            km,
            lat: latitude,
            lng: longitude,
            speed: currentSpeed,
            heading: hd,
            accuracy: acc,
            status: 'en_ruta',
            breadcrumbs: breadcrumbsRef.current.slice(-15)
          }).catch(() => {});
        },
        (err) => console.warn('[MEC GPS Warn]', err.message),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    }
  };

  const stopTracking = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (watchIdRef.current && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setIsPaused(false);
  };

  const calcDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const formatTimer = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const handleLogEvent = (type, icon, label) => {
    sounds.click();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const ev = { type, icon, label, km: km || 'Sin Km', time };
    setEvents((prev) => [ev, ...prev]);

    if (lastPosRef.current) {
      sendMecLocationPing({
        unitId,
        deviceId: getDeviceUuid(),
        operator,
        tramo,
        km,
        lat: lastPosRef.current.lat,
        lng: lastPosRef.current.lng,
        speed: speedKmh,
        status: type === 'SOS' ? 'emergencia' : 'evento',
        novedad: `${label} en ${km || 'tramo actual'}`
      }).catch(() => {});
    }
    sounds.success();
  };

  if (!isAuthorized) {
    return (
      <div className="mec-react-container">
        <div className="mec-unauthorized-banner">
          <h2>🔒 MEC No Autorizado</h2>
          <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Este dispositivo no tiene permiso para la aplicación MEC (Seguimiento en Carretera). Solicita al operador que active la función desde RegAs 3.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mec-react-container">
      {/* HUD TÁCTICO */}
      <section className="mec-hud-panel">
        <div className="mec-speed-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span className={`mec-speed-val ${speedKmh > 110 ? 'overspeed' : speedKmh > 90 ? 'fast' : speedKmh > 40 ? 'cruising' : ''}`}>
                {speedKmh}
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-muted)' }}>km/h</span>
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {speedKmh === 0 ? 'Detenido' : speedKmh > 110 ? '⚠️ Exceso' : 'Crucero'}
            </div>
          </div>

          <div className="mec-compass-box">
            <span style={{ fontSize: '1.2rem' }}>🧭</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8' }}>
              {heading !== null ? `${heading}°` : 'Rumbo'}
            </span>
          </div>
        </div>

        <div className="mec-hud-metrics">
          <div className="mec-metric-item">
            <span className="mec-metric-lbl">Odómetro</span>
            <span className="mec-metric-num">{(distanceMeters / 1000).toFixed(1)} km</span>
          </div>
          <div className="mec-metric-item">
            <span className="mec-metric-lbl">Tiempo</span>
            <span className="mec-metric-num">{formatTimer(seconds)}</span>
          </div>
          <div className="mec-metric-item">
            <span className="mec-metric-lbl">Precisión GPS</span>
            <span className="mec-metric-num">{accuracy ? `± ${accuracy}m` : '--'}</span>
          </div>
        </div>
      </section>

      {/* FORMULARIO DE RUTA */}
      <section className="mec-card">
        <div className="mec-form-grid">
          <div className="mec-form-field">
            <label className="mec-form-label">Unidad</label>
            <input type="text" className="mec-text-input" value={unitId} onChange={(e) => setUnitId(e.target.value)} />
          </div>
          <div className="mec-form-field">
            <label className="mec-form-label">Operador</label>
            <input type="text" className="mec-text-input" value={operator} onChange={(e) => setOperator(e.target.value)} />
          </div>
          <div className="mec-form-field full">
            <label className="mec-form-label">Tramo Carretero</label>
            <input type="text" className="mec-text-input" value={tramo} onChange={(e) => setTramo(e.target.value)} />
          </div>
          <div className="mec-form-field full">
            <label className="mec-form-label">Km Referencia</label>
            <input type="text" className="mec-text-input" placeholder="Ej. Km 140+200" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
        </div>

        <div className="mec-btns-row">
          {!isTracking ? (
            <button type="button" className="mec-btn-primary" onClick={startTracking}>
              <span>▶️</span>
              <span>Iniciar Rastreo Carretero</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="mec-btn-primary"
                onClick={() => {
                  sounds.click();
                  setIsPaused(!isPaused);
                }}
              >
                <span>{isPaused ? '▶️ Reanudar' : '⏸️ Pausar'}</span>
              </button>
              <button
                type="button"
                className="mec-btn-danger"
                onClick={() => {
                  sounds.click();
                  stopTracking();
                }}
              >
                <span>🏁 Finalizar</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* EVENTOS RÁPIDOS */}
      <section className="mec-card">
        <span style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>⚡ Eventos en Carretera (1-Tap)</span>
        <div className="mec-events-grid">
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('AUXILIO', '🚨', 'Auxilio Vial')}>
            <span style={{ fontSize: '1.3rem' }}>🚨</span>
            <span>Auxilio Vial</span>
          </button>
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('TRAFICO', '🚧', 'Tráfico Detenido')}>
            <span style={{ fontSize: '1.3rem' }}>🚧</span>
            <span>Tráfico</span>
          </button>
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('ACCIDENTE', '⚠️', 'Accidente')}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <span>Accidente</span>
          </button>
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('RETEN', '👮', 'Retén Oficial')}>
            <span style={{ fontSize: '1.3rem' }}>👮</span>
            <span>Retén</span>
          </button>
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('GAS', '⛽', 'Combustible')}>
            <span style={{ fontSize: '1.3rem' }}>⛽</span>
            <span>Combustible</span>
          </button>
          <button type="button" className="mec-event-btn" onClick={() => handleLogEvent('PEAJE', '📍', 'Caseta Peaje')}>
            <span style={{ fontSize: '1.3rem' }}>📍</span>
            <span>Caseta Peaje</span>
          </button>
        </div>

        <button type="button" className="mec-sos-btn" onClick={() => handleLogEvent('SOS', '🚨', 'EMERGENCIA SOS')}>
          <span>🆘</span>
          <span>Emergencia Carretera SOS</span>
        </button>
      </section>
    </div>
  );
}
