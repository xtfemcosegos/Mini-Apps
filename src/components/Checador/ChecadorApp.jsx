import React, { useState, useEffect, useRef } from 'react';
import './ChecadorApp.css';
import {
  sendReconocimientoFacial,
  fetchTurnoDisponible,
  registrarAsistenciaEntrada,
  registrarAsistenciaSalida,
  resolveBackendBase,
  sounds
} from '../../services/api';

export default function ChecadorApp({ theme, onToggleTheme }) {
  // Estados posibles: 'requesting_camera' | 'scanning' | 'analyzing' | 'matched' | 'keypad' | 'success'
  const [viewState, setViewState] = useState('requesting_camera');
  const [hudStatus, setHudStatus] = useState('Buscando rostro... Acerca y centra tu rostro');
  const [faceDetected, setFaceDetected] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [matchedData, setMatchedData] = useState(null);
  const [socioInput, setSocioInput] = useState('');
  const [searchingSocio, setSearchingSocio] = useState(false);
  const [socioShiftData, setSocioShiftData] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [keypadReason, setKeypadReason] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const scanHintTimerRef = useRef(null);
  const isCapturingRef = useRef(false);

  // Reloj en tiempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Redirección congruente hacia la aplicación oficial checador-movil.html
  useEffect(() => {
    window.location.replace('checador-movil.html' + window.location.search);
  }, []);

  // 1. REQUERIMIENTO: Al abrirla inmediatamente pedirá permisos de la cámara
  useEffect(() => {
    initCameraFlow();
    return () => {
      stopCamera();
    };
  }, []);

  const initCameraFlow = async () => {
    isCapturingRef.current = false;
    setFaceDetected(false);
    setCountdown(null);
    setViewState('requesting_camera');

    // Verificar si el dispositivo soporta mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Checador] Dispositivo sin soporte de cámara');
      setHasCamera(false);
      setKeypadReason('Dispositivo sin soporte de cámara. Digita tu número de socio:');
      setViewState('keypad');
      return;
    }

    try {
      // Verificar si existen cámaras de video disponibles
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      if (videoInputs.length === 0) {
        setHasCamera(false);
        setKeypadReason('No se detectó cámara en el dispositivo. Digita tu número de socio:');
        setViewState('keypad');
        return;
      }

      // Pedir permisos de cámara inmediatamente
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasCamera(true);
      setViewState('scanning');
      setHudStatus('Centra tu rostro en el óvalo...');

      // Iniciar ciclo de detección facial con IA
      startFaceDetectionLoop();
    } catch (err) {
      console.warn('[Checador] Permiso de cámara denegado o no disponible:', err);
      // REQUERIMIENTO: Si el dispositivo no detecta cámara le solicitará directamente el número de socio
      setHasCamera(false);
      setKeypadReason('Permiso de cámara no disponible. Digita tu número de socio:');
      setViewState('keypad');
    }
  };

  const stopCamera = () => {
    if (scanHintTimerRef.current) {
      clearTimeout(scanHintTimerRef.current);
      scanHintTimerRef.current = null;
    }
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  // 2. REQUERIMIENTO: Usando inteligencia artificial buscará un rostro en tiempo real
  const analyzeFaceInFrame = (videoEl) => {
    if (!videoEl || videoEl.readyState < 2) return { detected: false };

    const testW = 120;
    const testH = 160;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = testW;
    offCanvas.height = testH;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, 0, 0, testW, testH);

    const imgData = ctx.getImageData(0, 0, testW, testH);
    const data = imgData.data;

    let skinPixelsOval = 0;
    let totalSampled = 0;
    let lumSum = 0;
    const lums = [];

    const centerX = testW / 2;
    const centerY = testH / 2;
    const radiusX = testW * 0.38;
    const radiusY = testH * 0.44;

    for (let y = 10; y < testH - 10; y += 3) {
      for (let x = 10; x < testW - 10; x += 3) {
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1.0) {
          totalSampled++;
          const idx = (y * testW + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          lumSum += lum;
          lums.push(lum);

          // Algoritmo de tono de piel humana flexible para múltiples iluminaciones
          const isSkin =
            r > 45 &&
            g > 25 &&
            b > 15 &&
            (Math.max(r, g, b) - Math.min(r, g, b)) > 10 &&
            r >= g &&
            r >= b;

          if (isSkin) skinPixelsOval++;
        }
      }
    }

    const skinRatio = totalSampled > 0 ? skinPixelsOval / totalSampled : 0;
    const meanLum = totalSampled > 0 ? lumSum / totalSampled : 0;
    let varSum = 0;
    for (let i = 0; i < lums.length; i++) {
      const diff = lums[i] - meanLum;
      varSum += diff * diff;
    }
    const lumStd = lums.length > 0 ? Math.sqrt(varSum / lums.length) : 0;

    // Detectado si hay proporción de piel o contraste facial de ojos/boca en el óvalo
    const detected = skinRatio >= 0.16 || (skinRatio >= 0.10 && lumStd > 18);
    return { detected, ratio: skinRatio };
  };

  const startFaceDetectionLoop = () => {
    if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);

    if (scanHintTimerRef.current) clearTimeout(scanHintTimerRef.current);
    // Breve inspección (3.8s): Si no se detecta rostro estable, conmutar directamente a teclado
    scanHintTimerRef.current = setTimeout(() => {
      stopCamera();
      sounds.warning();
      setKeypadReason('Rostro no identificado tras la inspección. Digita tu número de socio:');
      setViewState('keypad');
    }, 3800);

    let stableCount = 0;
    detectIntervalRef.current = setInterval(() => {
      if (isCapturingRef.current) return;
      if (!videoRef.current) return;

      const analysis = analyzeFaceInFrame(videoRef.current);
      if (analysis.detected) {
        stableCount++;
        setFaceDetected(true);
        setHudStatus('¡Rostro detectado! Mantén la posición...');

        // Cuando el rostro se mantiene estable por 2 lecturas, autodisparo
        if (stableCount >= 2 && !countdownTimerRef.current) {
          sounds.beep();
          triggerAutoCapture();
        }
      } else {
        stableCount = 0;
        setFaceDetected(false);
        setHudStatus('Centra tu rostro en el óvalo...');
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setCountdown(null);
        }
      }
    }, 250);
  };

  // 3. REQUERIMIENTO: Al detectarlo tomará una foto
  const triggerAutoCapture = () => {
    let count = 2;
    setCountdown(count);

    countdownTimerRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        sounds.beep();
      } else {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdown(null);
        takeSnapshotAndSend();
      }
    }, 600);
  };

  const takeSnapshotAndSend = async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    sounds.capture();

    const vid = videoRef.current;
    if (!vid) {
      isCapturingRef.current = false;
      stopCamera();
      setViewState('keypad');
      return;
    }

    const cvs = canvasRef.current || document.createElement('canvas');
    cvs.width = vid.videoWidth || 640;
    cvs.height = vid.videoHeight || 480;

    const ctx = cvs.getContext('2d');
    // Espejo idéntico al preview con ajuste de contraste y luminosidad adaptativa
    ctx.translate(cvs.width, 0);
    ctx.scale(-1, 1);
    ctx.filter = 'contrast(1.12) brightness(1.08) saturate(1.04)';
    ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);

    const base64Photo = cvs.toDataURL('image/webp', 0.85);
    setCapturedPhotoUrl(base64Photo);

    // Pausar video y cambiar estado a análisis
    try { vid.pause(); } catch (e) {}
    setViewState('analyzing');
    setHudStatus('Comparando con fotos en UBE...');

    console.log('[AUDITORIA REACT CHECADOR] Foto tomada:', {
      resolucion: `${cvs.width}x${cvs.height}`,
      tamanoAproxBytes: Math.round(base64Photo.length * 0.75),
      timestamp: new Date().toISOString()
    });

    try {
      // 4. REQUERIMIENTO: Se la enviará a UBE, este la recibirá y la comparará con fotos guardadas
      const res = await sendReconocimientoFacial(base64Photo);
      console.log('[AUDITORIA REACT CHECADOR] Respuesta recibida:', res);
      if (res && res.topComparaciones) {
        console.table(res.topComparaciones);
      }

      if (res && res.success && res.match) {
        sounds.success();
        stopCamera();
        setMatchedData(res);
        setViewState('matched');
      } else {
        // 7. REQUERIMIENTO: Si no encuentra la foto le solicitará su número de socio
        stopCamera();
        sounds.warning();
        const scoreMsg = res?.score !== undefined ? ` (${res.score}% de similitud, mín. 70%)` : '';
        setKeypadReason(`Rostro no verificado${scoreMsg}. Digita tu número de socio para registrar asistencia:`);
        setViewState('keypad');
      }
    } catch (err) {
      console.error('[Checador] Error en reconocimiento facial:', err);
      stopCamera();
      sounds.warning();
      setKeypadReason('Error de conexión con UBE. Digita tu número de socio para registrarte:');
      setViewState('keypad');
    } finally {
      isCapturingRef.current = false;
    }
  };

  // 8. REGISTRAR ASISTENCIA (Entrada o Salida con 1 clic)
  const handleRegisterAttendance = async (elemId, shiftName, tipo = 'entrada') => {
    try {
      sounds.click();
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const horaStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const horaFull = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (tipo === 'salida') {
        await registrarAsistenciaSalida({
          elemId: String(elemId),
          turno: shiftName || 'matutino',
          hora: horaStr,
          foto: capturedPhotoUrl
        });
      } else {
        await registrarAsistenciaEntrada({
          elemId: String(elemId),
          turno: shiftName || 'matutino',
          hora: horaStr,
          foto: capturedPhotoUrl
        });
      }

      sounds.success();
      setSuccessInfo({
        elemId,
        tipo: tipo === 'salida' ? 'Salida' : 'Entrada',
        hora: horaFull,
        nombre: matchedData?.elemento?.nombre || socioShiftData?.elemento?.nombre || `Socio #${elemId}`,
        turno: shiftName || 'Turno Activo'
      });
      setViewState('success');

      // Reinicio automático para el siguiente oficial después de 5 segundos
      setTimeout(() => {
        handleResetFlow();
      }, 5000);
    } catch (err) {
      alert(`Error registrando ${tipo}: ` + (err.message || 'Error de red'));
    }
  };

  // CONSULTAR TURNO POR NÚMERO DE SOCIO (Fallback)
  const handleConsultarSocio = async () => {
    const idVal = socioInput.trim();
    if (!idVal) {
      sounds.warning();
      return;
    }

    try {
      setSearchingSocio(true);
      sounds.click();
      const data = await fetchTurnoDisponible(idVal);
      if (data && data.success) {
        sounds.success();
        setSocioShiftData(data);
      } else {
        sounds.warning();
        alert(data.error || 'Número de socio no encontrado en el sistema');
      }
    } catch (e) {
      sounds.warning();
      alert('No se pudo consultar el número de socio en UBE');
    } finally {
      setSearchingSocio(false);
    }
  };

  const handleKeypadPress = (val) => {
    sounds.click();
    if (val === 'C') {
      setSocioInput('');
      setSocioShiftData(null);
    } else if (val === 'DEL') {
      setSocioInput((prev) => prev.slice(0, -1));
    } else {
      if (socioInput.length < 10) {
        setSocioInput((prev) => prev + val);
      }
    }
  };

  const handleResetFlow = () => {
    setMatchedData(null);
    setSocioShiftData(null);
    setSocioInput('');
    setCapturedPhotoUrl(null);
    setSuccessInfo(null);
    initCameraFlow();
  };

  const backendBase = resolveBackendBase();

  return (
    <div className="checador-container">
      {/* HEADER */}
      <div className="checador-header">
        <div className="checador-title-box">
          <span style={{ fontSize: '1.2rem' }}>🕒</span>
          <h1 className="checador-title">Checador Facial</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="cdi-theme-btn"
            onClick={() => { sounds.click(); if (onToggleTheme) onToggleTheme(); }}
            title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
            style={{ cursor: 'pointer' }}
          >
            <span>{theme === 'light' ? '☀️' : '🌙'}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
          </button>
          <div className="checador-clock">{currentTime}</div>
        </div>
      </div>

      <canvas ref={canvasRef} className="checador-canvas-hidden" />

      {/* CASO 1: VISTA DE CÁMARA & ESCANEO FACIAL */}
      {(viewState === 'requesting_camera' || viewState === 'scanning' || viewState === 'analyzing') && (
        <div className="checador-camera-box">
          <video ref={videoRef} className="checador-video-stream" autoPlay playsInline muted />

          <div className="checador-hud">
            <div className="hud-badge-status">
              {viewState === 'analyzing' ? '⏳' : faceDetected ? '🟢' : '🔍'} {hudStatus}
            </div>

            <div className={`hud-oval-frame ${faceDetected ? 'face-detected' : ''}`}>
              <div className="hud-scanner-bar" />
              {countdown && <div className="hud-countdown-number">{countdown}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
              <button
                type="button"
                className="hud-manual-capture-btn"
                onClick={() => takeSnapshotAndSend()}
                disabled={viewState === 'analyzing'}
              >
                {viewState === 'analyzing' ? '⏳ Verificando en UBE...' : '📸 Tomar Foto y Verificar'}
              </button>

              <button
                type="button"
                className="hud-keypad-switch-btn"
                onClick={() => {
                  stopCamera();
                  setKeypadReason('Digita tu número de socio para verificar turno:');
                  setViewState('keypad');
                }}
              >
                🔢 Ingresar con Número de Socio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASO 2: ROSTRO IDENTIFICADO */}
      {viewState === 'matched' && matchedData && (
        <div className="checador-matched-card">
          <div className="matched-user-row">
            <div className="matched-avatar-box">
              <img
                src={
                  matchedData.elemento?.foto
                    ? `${backendBase}${matchedData.elemento.foto}`
                    : capturedPhotoUrl
                }
                alt={matchedData.elemento?.nombre}
              />
            </div>
            <div className="matched-user-details">
              <div className="matched-name">{matchedData.elemento?.nombre}</div>
              <div className="matched-puesto">{matchedData.elemento?.puesto || 'Elemento de Seguridad'}</div>
              <div className="matched-score-badge">
                <span>✓ Coincidencia:</span>
                <strong>{matchedData.score}%</strong>
              </div>
            </div>
          </div>

          {/* ETIQUETA EN TURNO / ENTRADA PENDIENTE */}
          <div className={`matched-status-indicator ${matchedData.shift?.enTurno ? 'status-en-turno' : 'status-pendiente'}`}>
            <span style={{ fontSize: '1.2rem' }}>{matchedData.shift?.enTurno ? '🟢' : '⏳'}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ fontSize: '0.92rem' }}>
                {matchedData.shift?.enTurno ? 'ESTADO: EN TURNO' : 'ESTADO: ENTRADA PENDIENTE'}
              </strong>
              {matchedData.shift?.enTurno && (matchedData.shift?.horaEntrada || matchedData.shift?.horaRegistrada) && (
                <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                  Entrada registrada a las {matchedData.shift?.horaEntrada || matchedData.shift?.horaRegistrada} hrs
                </span>
              )}
            </div>
          </div>

          <div className="matched-shift-banner">
            <div className="shift-banner-title">
              <span>📅</span>
              <span>{matchedData.shift?.targetLabel || 'Turno Asignado Hoy'}</span>
            </div>
            <div className="shift-banner-time">
              Horario: {matchedData.shift?.targetHorario || '06:00 a 14:00 hrs'}
            </div>
          </div>

          {/* BOTÓN SALIDA O ENTRADA SEGÚN EL ESTADO */}
          {matchedData.shift?.enTurno ? (
            <button
              type="button"
              className="btn-register-salida"
              onClick={() => handleRegisterAttendance(matchedData.elemento?.id, matchedData.shift?.targetShift, 'salida')}
            >
              <span style={{ fontSize: '1.25rem' }}>🚪</span>
              <span>REGISTRAR MI SALIDA</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-register-attendance"
              onClick={() => handleRegisterAttendance(matchedData.elemento?.id, matchedData.shift?.targetShift, 'entrada')}
            >
              <span style={{ fontSize: '1.25rem' }}>📥</span>
              <span>REGISTRAR MI ENTRADA</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetFlow}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '4px'
            }}
          >
            ← Cancelar / Escanear de nuevo
          </button>
        </div>
      )}

      {/* CASO 3: NÚMERO DE SOCIO (CUANDO NO HAY CÁMARA O NO SE ENCONTRÓ COINCIDENCIA) */}
      {viewState === 'keypad' && (
        <div className="checador-keypad-card">
          <div className="keypad-notice-box">
            <span>ℹ️</span>
            <span>
              {keypadReason || (!hasCamera
                ? 'Dispositivo sin cámara. Ingresa tu número de socio:'
                : 'Rostro no identificado. Ingresa tu número de socio:')
              }
            </span>
          </div>

          <div className="keypad-display-row">
            <input
              type="text"
              inputMode="numeric"
              className="keypad-input-field"
              value={socioInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setSocioInput(val);
                if (!val) setSocioShiftData(null);
              }}
              placeholder="N° DE SOCIO"
              autoFocus
            />
          </div>

          {!socioShiftData ? (
            <>
              {/* Botón para desplegar teclado numérico en pantalla en PC */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNumpad(!showNumpad)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: showNumpad ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '20px',
                    padding: '5px 12px',
                    color: showNumpad ? '#38bdf8' : '#94a3b8',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Mostrar/ocultar teclado en pantalla"
                >
                  <span>⌨️</span>
                  <span>Teclado en pantalla</span>
                  <span>{showNumpad ? '▲' : '▼'}</span>
                </button>
              </div>

              {showNumpad && (
                <div className="checador-numpad-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`numpad-key ${key === 'C' || key === 'DEL' ? 'key-action' : ''}`}
                      onClick={() => handleKeypadPress(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn-search-socio"
                disabled={!socioInput || searchingSocio}
                onClick={handleConsultarSocio}
              >
                {searchingSocio ? 'Consultando en UBE...' : 'CONSULTAR TURNO DISPONIBLE'}
              </button>

              {hasCamera && (
                <button
                  type="button"
                  onClick={handleResetFlow}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                >
                  📷 Volver a intentar con Cámara
                </button>
              )}
            </>
          ) : (
            /* SOCIO ENCONTRADO CON TURNO DISPONIBLE */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="matched-user-row">
                <div className="matched-avatar-box">
                  <img
                    src={`${backendBase}/api/photos/elementos/${socioInput}`}
                    onError={(e) => { e.currentTarget.src = 'iconos/silueta.svg'; }}
                    alt={socioShiftData.elemento?.nombre}
                  />
                </div>
                <div className="matched-user-details">
                  <div className="matched-name">{socioShiftData.elemento?.nombre}</div>
                  <div className="matched-puesto">{socioShiftData.elemento?.puesto || 'Elemento de Seguridad'}</div>
                  <div style={{ color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700 }}>
                    Socio #{socioInput}
                  </div>
                </div>
              </div>

              {/* ETIQUETA EN TURNO / ENTRADA PENDIENTE */}
              <div className={`matched-status-indicator ${(socioShiftData.enTurno || socioShiftData.shift?.enTurno) ? 'status-en-turno' : 'status-pendiente'}`}>
                <span style={{ fontSize: '1.2rem' }}>{(socioShiftData.enTurno || socioShiftData.shift?.enTurno) ? '🟢' : '⏳'}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '0.92rem' }}>
                    {(socioShiftData.enTurno || socioShiftData.shift?.enTurno) ? 'ESTADO: EN TURNO' : 'ESTADO: ENTRADA PENDIENTE'}
                  </strong>
                  {(socioShiftData.enTurno || socioShiftData.shift?.enTurno) && (socioShiftData.horaEntrada || socioShiftData.shift?.horaEntrada) && (
                    <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>
                      Entrada registrada a las {socioShiftData.horaEntrada || socioShiftData.shift?.horaEntrada} hrs
                    </span>
                  )}
                </div>
              </div>

              <div className="matched-shift-banner">
                <div className="shift-banner-title">
                  <span>📅</span>
                  <span>{socioShiftData.targetLabel || 'Turno Asignado Hoy'}</span>
                </div>
                <div className="shift-banner-time">
                  Horario: {socioShiftData.targetHorario || '06:00 a 14:00 hrs'}
                </div>
              </div>

              {(socioShiftData.enTurno || socioShiftData.shift?.enTurno) ? (
                <button
                  type="button"
                  className="btn-register-salida"
                  onClick={() => handleRegisterAttendance(socioInput, socioShiftData.targetShift, 'salida')}
                >
                  <span style={{ fontSize: '1.25rem' }}>🚪</span>
                  <span>REGISTRAR MI SALIDA</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-register-attendance"
                  onClick={() => handleRegisterAttendance(socioInput, socioShiftData.targetShift, 'entrada')}
                >
                  <span style={{ fontSize: '1.25rem' }}>📥</span>
                  <span>REGISTRAR MI ENTRADA</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSocioShiftData(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ← Ingresar otro número de socio
              </button>
            </div>
          )}
        </div>
      )}

      {/* CASO 4: ASISTENCIA REGISTRADA EXITOSAMENTE */}
      {viewState === 'success' && successInfo && (
        <div className="attendance-success-voucher">
          <div className="success-icon-badge">✓</div>
          <h2 className="success-voucher-title">
            ¡{successInfo.tipo ? `${successInfo.tipo.toUpperCase()} REGISTRADA!` : 'ASISTENCIA REGISTRADA!'}
          </h2>
          <div className="success-voucher-time">{successInfo.hora}</div>
          <p style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px' }}>
            {successInfo.nombre}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '18px' }}>
            {successInfo.tipo === 'Salida' ? 'Salida de turno registrada en UBE para ' : 'Entrada de turno registrada en UBE para '} {successInfo.turno}
          </p>
          <button
            type="button"
            className="btn-register-attendance"
            style={{ background: 'rgba(255,255,255,0.15)', boxShadow: 'none' }}
            onClick={handleResetFlow}
          >
            Siguiente Oficial
          </button>
        </div>
      )}
    </div>
  );
}
