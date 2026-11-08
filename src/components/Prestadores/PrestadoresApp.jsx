import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  fetchPrestadoresStats,
  fetchPrestadoresActivos,
  fetchPrestadoresRegistros,
  fetchNextFolio,
  registrarPrestadorEntrada,
  registrarPrestadorSalida,
  vincularPrestadorHerramientas,
  fetchPrestadorHerramientas,
  getDeviceUuid,
  sendDeviceIdentifySignal,
  sounds,
  initCdiSse
} from '../../services/api';
import './PrestadoresApp.css';

// Catálogos oficiales extraídos directamente de los Microsoft Forms
const COMPANIAS_CATALOG = [
  'LINC SERVICE',
  'PHS',
  'DELTA SOLUTION',
  'SINSA',
  'QUIMERA',
  'AIRACCSA',
  'GUBR',
  'VERTICE',
  'JazzCleanner',
  'Siae',
  'RENCLA',
  'TLCOMTEK',
  'MEGA VRF',
  'OTRA EMPRESA'
];

const ACCESOS_CATALOG = [
  'Edison',
  'Impulso',
  'Michelena',
  'Simón Bolivar',
  'OTRO ACCESO'
];

const TRABAJOS_CATALOG = [
  'Pintura',
  'Tablaroca',
  'Albañilería',
  'Instalaciones electricas',
  'Montaje',
  'Acabados',
  'Instalación de Cableado',
  'Mantenimiento preventivo',
  'Residente',
  'Segurista',
  'Evento',
  'Soldadura',
  'Proveedor',
  'OTRO TRABAJO'
];

const EDIFICIOS_CATALOG = [
  'Tienda OXXO',
  'Edificio Rojo / Edison',
  'Edificio Azul / Administrativo',
  'Edificio Amarillo / RH',
  'Edificio Morado / Almacén',
  'Edificio Expansión',
  'Edificio Naranja / TI',
  'Edificio Rosa / Anexo TI',
  'Edificio Vede / Logística - Inovation HUB',
  'Edificio Gris / IMMEX',
  'Edificio Anexo Edison',
  'Edificio Michelena',
  'Área de Balance',
  'OTRO EDIFICIO'
];

const TOOL_SUGGESTIONS = [
  '1 Taladro inalámbrico',
  '1 Escalera de tijera',
  '1 Extensión eléctrica 20m',
  '1 Caja de herramientas manuales',
  '1 Multímetro digital',
  '1 Rotomartillo',
  '1 Esmeril angular',
  '1 Cautín eléctrico',
  '1 Juego de desarmadores',
  '1 Cinta métrica 5m'
];

export default function PrestadoresApp({ features = {}, isPc = false, caseta = 'Caseta Principal' }) {
  // 1. Detección de vista: ¿Es el contratista llenando herramientas por QR?
  const [urlParams] = useState(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  });

  const isContractorToolMode = urlParams.get('action') === 'herramientas' || urlParams.get('mode') === 'herramientas';

  // 2. Estado de Seguridad: ¿Desbloqueado desde RegAs 3?
  // (La vista de contratista para llenar herramientas siempre es accesible desde su móvil vía QR)
  const isUnlocked = features.prestadores === true || isContractorToolMode;

  const [activeTab, setActiveTab] = useState('nuevo'); // 'nuevo' | 'activos' | 'historial'
  const [tipoRegistro, setTipoRegistro] = useState('Entrada'); // 'Entrada' | 'Salida'

  // Folio de acceso actual
  const [currentFolio, setCurrentFolio] = useState('');
  const [identifyingDevice, setIdentifyingDevice] = useState(false);

  // Formulario Entrada (Prestadores de Servicio)
  const [acceso, setAcceso] = useState('Edison');
  const [empresa, setEmpresa] = useState('LINC SERVICE');
  const [empresaOtra, setEmpresaOtra] = useState('');
  const [nombrePersona, setNombrePersona] = useState('');
  const [gafeteAsignado, setGafeteAsignado] = useState('');
  const [alarmaIncendio, setAlarmaIncendio] = useState('No');
  const [tipoTrabajos, setTipoTrabajos] = useState('Mantenimiento preventivo');
  const [tipoTrabajosOtro, setTipoTrabajosOtro] = useState('');
  const [edificio, setEdificio] = useState('Edificio Rojo / Edison');
  const [edificioOtro, setEdificioOtro] = useState('');
  const [manualHerramientas, setManualHerramientas] = useState('');

  // Formulario Salida
  const [gafeteEntrega, setGafeteEntrega] = useState('0');
  const [empresaSale, setEmpresaSale] = useState('LINC SERVICE');
  const [salidaPrestadorSeleccionado, setSalidaPrestadorSeleccionado] = useState(null);

  // Formulario Móvil Contratista (Registro de Herramientas)
  const [toolFolio, setToolFolio] = useState(() => urlParams.get('folio') || '');
  const [toolEmpresa, setToolEmpresa] = useState(() => urlParams.get('empresa') || '');
  const [toolNombre, setToolNombre] = useState(() => urlParams.get('nombre') || '');
  const [toolEmail, setToolEmail] = useState('');
  const [toolList, setToolList] = useState('');
  const [toolSubmittedTicket, setToolSubmittedTicket] = useState(null);

  // Datos en vivo
  const [stats, setStats] = useState({
    activosDentro: 0,
    totalIngresos: 0,
    totalSalidas: 0,
    conHerramientas: 0,
    conRiesgoAlarma: 0
  });
  const [activosList, setActivosList] = useState([]);
  const [historialList, setHistorialList] = useState([]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [selectedToolsModal, setSelectedToolsModal] = useState(null);

  // Estado del QR en pantalla de PC
  const [qrBaseMode, setQrBaseMode] = useState('tailscale'); // 'tailscale' | 'nube' | 'lan'
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [recentLiveTools, setRecentLiveTools] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });

  // Cargar folio consecutivo
  const refreshFolio = async () => {
    try {
      const res = await fetchNextFolio();
      if (res && res.folio) {
        setCurrentFolio(res.folio);
      }
    } catch (e) {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const fallback = `FOL-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(Math.floor(Math.random() * 900) + 100, 4)}`;
      setCurrentFolio(fallback);
    }
  };

  const loadStatsAndActivos = async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        fetchPrestadoresStats(),
        fetchPrestadoresActivos()
      ]);
      if (sRes && sRes.stats) setStats(sRes.stats);
      if (aRes && aRes.activos) setActivosList(aRes.activos);
    } catch (e) {
      console.warn('[Prestadores] Error cargando stats y activos:', e.message);
    }
  };

  useEffect(() => {
    if (isUnlocked) {
      refreshFolio();
      loadStatsAndActivos();
    }
  }, [isUnlocked]);

  // Generación de QR en PC según modo de conexión
  useEffect(() => {
    if (!currentFolio) return;

    let base = 'https://oxosd450mlh.taile94978.ts.net';
    if (qrBaseMode === 'nube') {
      base = 'https://cic-os-miniapps.web.app';
    } else if (qrBaseMode === 'lan') {
      const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
      base = `http://${host}:7006`;
    }

    const effEmpresa = empresa === 'OTRA EMPRESA' ? empresaOtra : empresa;
    const qrTargetUrl = `${base}/?app=prestadores&action=herramientas&folio=${encodeURIComponent(currentFolio)}&empresa=${encodeURIComponent(effEmpresa || '')}&nombre=${encodeURIComponent(nombrePersona || '')}`;

    QRCode.toDataURL(qrTargetUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.warn('[QR Error]', err));
  }, [currentFolio, qrBaseMode, empresa, empresaOtra, nombrePersona]);

  // Escucha de eventos SSE en tiempo real
  useEffect(() => {
    const cleanupSse = initCdiSse(null, null, (customMsg) => {
      if (!customMsg) return;
      if (customMsg.type === 'prestadores_herramientas_vinculadas') {
        const payload = customMsg.payload || {};
        sounds.success();
        setRecentLiveTools(payload);
        loadStatsAndActivos();
        if (payload.folio === currentFolio) {
          setStatusMessage({
            text: `✅ ¡El contratista registró sus herramientas para el Folio ${payload.folio}!`,
            type: 'success'
          });
        }
      } else if (customMsg.type === 'prestadores_nuevo_ingreso' || customMsg.type === 'prestadores_salida') {
        loadStatsAndActivos();
      }
    });

    return () => {
      if (typeof cleanupSse === 'function') cleanupSse();
    };
  }, [currentFolio]);

  // Identificar dispositivo hacia RegAs
  const handleIdentify = async () => {
    sounds.click();
    setIdentifyingDevice(true);
    try {
      await sendDeviceIdentifySignal();
      sounds.success();
      alert('🔔 Señal enviada a CCO / RegAs 3. Solicita al operador que active la casilla "🛠️ Prestadores" para tu dispositivo.');
    } catch (e) {
      alert('No se pudo contactar con RegAs 3: ' + e.message);
    }
    setTimeout(() => setIdentifyingDevice(false), 2500);
  };

  // ==========================================
  // MANEJO FORMULARIO ENTRADA
  // ==========================================
  const handleSubmitEntrada = async (e) => {
    e.preventDefault();
    if (!nombrePersona.trim()) {
      sounds.warning();
      alert('Ingresa el nombre de la persona a ingresar.');
      return;
    }
    const finalEmpresa = empresa === 'OTRA EMPRESA' ? empresaOtra.trim() : empresa;
    if (!finalEmpresa) {
      sounds.warning();
      alert('Selecciona o escribe el nombre de la compañía.');
      return;
    }
    const finalTrabajos = tipoTrabajos === 'OTRO TRABAJO' ? tipoTrabajosOtro.trim() : tipoTrabajos;
    const finalEdificio = edificio === 'OTRO EDIFICIO' ? edificioOtro.trim() : edificio;

    setSubmitting(true);
    try {
      sounds.click();
      const payload = {
        folio: currentFolio,
        nombre: nombrePersona.trim().toUpperCase(),
        empresa: finalEmpresa,
        acceso,
        gafeteAsignado: gafeteAsignado ? parseInt(gafeteAsignado, 10) : 0,
        alarmaIncendio,
        tipoTrabajos: finalTrabajos,
        edificio: finalEdificio,
        caseta,
        deviceId: getDeviceUuid(),
        herramientasRaw: manualHerramientas,
        herramientas: manualHerramientas ? manualHerramientas.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : []
      };

      const res = await registrarPrestadorEntrada(payload);
      sounds.success();
      setStatusMessage({
        text: `✅ Ingreso de ${nombrePersona.toUpperCase()} registrado exitosamente con Folio ${res.registro.folio}.`,
        type: 'success'
      });

      // Limpiar campos
      setNombrePersona('');
      setGafeteAsignado('');
      setManualHerramientas('');
      setRecentLiveTools(null);
      refreshFolio();
      loadStatsAndActivos();
    } catch (err) {
      sounds.warning();
      setStatusMessage({ text: 'Error al registrar: ' + err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // MANEJO FORMULARIO SALIDA
  // ==========================================
  const handleSubmitSalida = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      sounds.click();
      const payload = {
        folio: salidaPrestadorSeleccionado ? salidaPrestadorSeleccionado.folio : '',
        gafeteEntrega: parseInt(gafeteEntrega || 0, 10),
        empresaSale: salidaPrestadorSeleccionado ? salidaPrestadorSeleccionado.empresa : empresaSale,
        nombre: salidaPrestadorSeleccionado ? salidaPrestadorSeleccionado.nombre : ''
      };

      const res = await registrarSalida(payload);
      sounds.success();
      setStatusMessage({
        text: `🚪 Salida registrada exitosamente para ${res.registro.nombre}.`,
        type: 'success'
      });
      setGafeteEntrega('0');
      setSalidaPrestadorSeleccionado(null);
      loadStatsAndActivos();
    } catch (err) {
      sounds.warning();
      setStatusMessage({ text: 'Error en salida: ' + err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // MANEJO FORMULARIO HERRAMIENTAS (CONTRATISTA VÍA QR)
  // ==========================================
  const handleSubmitHerramientas = async (e) => {
    e.preventDefault();
    if (!toolFolio.trim()) {
      alert('El Folio de Acceso es requerido. Solicítalo al personal de seguridad.');
      return;
    }
    if (!toolEmail.trim() || !toolEmail.includes('@')) {
      alert('Ingresa un correo electrónico válido.');
      return;
    }
    if (!toolList.trim()) {
      alert('Ingresa el listado de herramientas que llevas a las instalaciones.');
      return;
    }

    setSubmitting(true);
    try {
      sounds.click();
      const res = await vincularPrestadorHerramientas({
        folio: toolFolio.trim(),
        empresa: toolEmpresa.trim(),
        nombre: toolNombre.trim().toUpperCase(),
        correo: toolEmail.trim(),
        listadoHerramientas: toolList.trim(),
        origen: 'smartphone_qr'
      });
      sounds.success();
      setToolSubmittedTicket(res);
    } catch (err) {
      sounds.warning();
      alert('Error registrando herramientas: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToolChip = (chipText) => {
    sounds.click();
    setToolList(prev => (prev ? `${prev}\n${chipText}` : chipText));
  };

  // ==========================================
  // VISTA 1: REGISTRO DE HERRAMIENTAS (CONTRATISTA MÓVIL POR QR)
  // ==========================================
  if (isContractorToolMode) {
    if (toolSubmittedTicket) {
      return (
        <div className="prestadores-container">
          <div className="prestadores-card" style={{ maxWidth: 480, margin: '1rem auto', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', margin: '0 0 6px' }}>
              Herramientas Registradas
            </h2>
            <p style={{ fontSize: '0.86rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Tu declaración fue enviada y vinculada en tiempo real a la pantalla de caseta.
            </p>

            <div className="prestadores-folio-tag" style={{ fontSize: '1.2rem', padding: '6px 14px' }}>
              FOLIO: {toolSubmittedTicket.folio}
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: 12, margin: '14px 0' }}>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Compañía: <strong>{toolEmpresa || 'Prestador de Servicio'}</strong></div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Registró: <strong>{toolNombre || toolEmail}</strong></div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: '6px' }}>Herramientas ({toolSubmittedTicket.count}):</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.82rem', color: '#e2e8f0' }}>
                {(toolSubmittedTicket.herramientas || []).map((t, idx) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4 }}>
              Muestra esta pantalla al personal de seguridad para el cotejo físico de tus herramientas.
            </div>

            <button
              type="button"
              className="prestadores-submit-btn btn-entrada"
              style={{ marginTop: '1.25rem' }}
              onClick={() => {
                setToolSubmittedTicket(null);
                setToolList('');
              }}
            >
              Nuevo Registro de Herramientas
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="prestadores-container">
        <div className="prestadores-card" style={{ maxWidth: 520, margin: '0.5rem auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <div className="prestadores-title-icon" style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)' }}>
              🛠️
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Registro de Herramientas</h2>
              <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: 0 }}>
                Asegura el registro de tus herramientas antes de ingresar a las instalaciones.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitHerramientas}>
            <div className="prestadores-field-group">
              <label className="prestadores-label">
                Folio de acceso? <span className="prestadores-required">*</span>
              </label>
              <span className="prestadores-sublabel">
                Solicitar al personal de seguridad el folio de registro que se generó con su acceso.
              </span>
              <input
                type="text"
                className="prestadores-input"
                style={{ fontWeight: 700, letterSpacing: '0.04em' }}
                value={toolFolio}
                onChange={e => setToolFolio(e.target.value)}
                placeholder="Ej. FOL-20261108-0001"
                required
              />
            </div>

            <div className="prestadores-field-group">
              <label className="prestadores-label">
                ¿Compañía a la que pertenece? <span className="prestadores-required">*</span>
              </label>
              <input
                type="text"
                className="prestadores-input"
                value={toolEmpresa}
                onChange={e => setToolEmpresa(e.target.value)}
                placeholder="Nombre de la empresa prestadora"
                required
              />
            </div>

            <div className="prestadores-field-group">
              <label className="prestadores-label">
                ¿Nombre de la persona que realiza registro?
              </label>
              <input
                type="text"
                className="prestadores-input"
                value={toolNombre}
                onChange={e => setToolNombre(e.target.value.toUpperCase())}
                placeholder="NOMBRE COMPLETO"
              />
            </div>

            <div className="prestadores-field-group">
              <label className="prestadores-label">
                ¿Correo de la persona que realiza el registro? <span className="prestadores-required">*</span>
              </label>
              <input
                type="email"
                className="prestadores-input"
                value={toolEmail}
                onChange={e => setToolEmail(e.target.value)}
                placeholder="ejemplo@empresa.com"
                required
              />
            </div>

            <div className="prestadores-field-group">
              <label className="prestadores-label">
                ¿Listado de herramientas que ingresa? <span className="prestadores-required">*</span>
              </label>
              <span className="prestadores-sublabel">
                (Ejemplo: 2 rodillos, 1 escalera, 1 cinta métrica...)
              </span>
              <textarea
                className="prestadores-textarea"
                rows={4}
                value={toolList}
                onChange={e => setToolList(e.target.value)}
                placeholder="Escribe cada herramienta en un renglón nuevo..."
                required
              />
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                Atajos rápidos: Pulsa para añadir herramientas frecuentes:
              </div>
              <div className="prestadores-chips-wrap">
                {TOOL_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="prestadores-tool-chip"
                    onClick={() => handleAddToolChip(s)}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="prestadores-submit-btn btn-entrada"
              disabled={submitting}
            >
              {submitting ? 'Enviando declaración...' : '📥 Registrar e Ingresar Herramientas'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 2: BLOQUEADA POR DEFECTO (SEGURIDAD CIC OS 3)
  // ==========================================
  if (!isUnlocked) {
    return (
      <div className="prestadores-container">
        <div className="prestadores-locked-screen">
          <div className="prestadores-locked-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="prestadores-locked-title">Módulo Prestadores Bloqueado</h2>
          <p className="prestadores-locked-desc">
            Por política de seguridad unificada de CIC OS 3, este módulo está bloqueado por defecto.
            Solo el operador central desde <strong>RegAs 3 / CCO</strong> puede desbloquearlo activando la casilla <em>🛠️ Prestadores</em> para este equipo.
          </p>

          <div className="prestadores-device-badge">
            ID de Dispositivo: {getDeviceUuid()}
          </div>

          <button
            type="button"
            className="prestadores-btn-identify"
            onClick={handleIdentify}
            disabled={identifyingDevice}
          >
            <span>🔔</span>
            <span>{identifyingDevice ? 'Emitiendo señal sonora a RegAs...' : 'Identificar Dispositivo en RegAs 3'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VISTA 3: GESTIÓN PRINCIPAL DE CASETA (PC / TABLET)
  // ==========================================
  return (
    <div className="prestadores-container">
      {/* Encabezado */}
      <header className="prestadores-header">
        <div className="prestadores-title-wrap">
          <div className="prestadores-title-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div>
            <h1 className="prestadores-title">Prestadores de Servicio & Herramientas</h1>
            <p className="prestadores-subtitle">Control de accesos y vinculación de herramientas en tiempo real</p>
          </div>
        </div>

        <button
          type="button"
          className="prestadores-btn-identify"
          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
          onClick={handleIdentify}
        >
          <span>📍</span>
          <span>{caseta}</span>
        </button>
      </header>

      {/* Tarjetas de Estadísticas */}
      <div className="prestadores-stats-grid">
        <div className="prestadores-stat-card">
          <span className="prestadores-stat-icon">👷</span>
          <div>
            <div className="prestadores-stat-num" style={{ color: '#10b981' }}>{stats.activosDentro}</div>
            <div className="prestadores-stat-label">En Instalaciones</div>
          </div>
        </div>
        <div className="prestadores-stat-card">
          <span className="prestadores-stat-icon">🚪</span>
          <div>
            <div className="prestadores-stat-num" style={{ color: '#f59e0b' }}>{stats.totalSalidas}</div>
            <div className="prestadores-stat-label">Salidas Hoy</div>
          </div>
        </div>
        <div className="prestadores-stat-card">
          <span className="prestadores-stat-icon">🧰</span>
          <div>
            <div className="prestadores-stat-num" style={{ color: '#06b6d4' }}>{stats.conHerramientas}</div>
            <div className="prestadores-stat-label">Con Herramientas</div>
          </div>
        </div>
        <div className="prestadores-stat-card">
          <span className="prestadores-stat-icon">🔥</span>
          <div>
            <div className="prestadores-stat-num" style={{ color: stats.conRiesgoAlarma > 0 ? '#ef4444' : '#94a3b8' }}>
              {stats.conRiesgoAlarma}
            </div>
            <div className="prestadores-stat-label">Riesgo Alarma Incendio</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="prestadores-tabs">
        <button
          type="button"
          className={`prestadores-tab-btn ${activeTab === 'nuevo' ? 'active' : ''}`}
          onClick={() => { sounds.click(); setActiveTab('nuevo'); }}
        >
          <span>✍️ Registro Rápido</span>
        </button>
        <button
          type="button"
          className={`prestadores-tab-btn ${activeTab === 'activos' ? 'active' : ''}`}
          onClick={() => { sounds.click(); setActiveTab('activos'); loadStatsAndActivos(); }}
        >
          <span>👷 En Instalaciones</span>
          <span className="prestadores-tab-counter">{stats.activosDentro}</span>
        </button>
        <button
          type="button"
          className={`prestadores-tab-btn ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={async () => {
            sounds.click();
            setActiveTab('historial');
            const res = await fetchPrestadoresRegistros();
            if (res && res.registros) setHistorialList(res.registros);
          }}
        >
          <span>📋 Historial de Accesos</span>
        </button>
      </nav>

      {statusMessage.text && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            marginBottom: 12,
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: statusMessage.type === 'success' ? '#34d399' : '#fca5a5',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage({ text: '', type: '' })}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* CONTENIDO DE TABS */}
      {activeTab === 'nuevo' && (
        <div className="prestadores-split-layout">
          {/* PANEL IZQUIERDO: FORMULARIO OFICIAL (ENTRADA / SALIDA) */}
          <div className="prestadores-card">
            {/* Toggle Entrada / Salida */}
            <div className="prestadores-type-toggle">
              <button
                type="button"
                className={`prestadores-type-btn is-entrada ${tipoRegistro === 'Entrada' ? 'active' : ''}`}
                onClick={() => { sounds.click(); setTipoRegistro('Entrada'); }}
              >
                <span>🟢 Entrada</span>
              </button>
              <button
                type="button"
                className={`prestadores-type-btn is-salida ${tipoRegistro === 'Salida' ? 'active' : ''}`}
                onClick={() => { sounds.click(); setTipoRegistro('Salida'); }}
              >
                <span>🟠 Salida</span>
              </button>
            </div>

            {tipoRegistro === 'Entrada' ? (
              <form onSubmit={handleSubmitEntrada}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Folio generado automáticamente:</span>
                  <span className="prestadores-folio-tag">{currentFolio || 'Generando...'}</span>
                </div>

                {/* 1. Acceso por donde ingresa */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    Acceso por dónde ingresa <span className="prestadores-required">*</span>
                  </label>
                  <select
                    className="prestadores-select"
                    value={acceso}
                    onChange={e => setAcceso(e.target.value)}
                  >
                    {ACCESOS_CATALOG.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Compañía prestadora */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Nombre de compañía prestadora de servicios? <span className="prestadores-required">*</span>
                  </label>
                  <select
                    className="prestadores-select"
                    value={empresa}
                    onChange={e => setEmpresa(e.target.value)}
                  >
                    {COMPANIAS_CATALOG.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {empresa === 'OTRA EMPRESA' && (
                    <input
                      type="text"
                      className="prestadores-input"
                      style={{ marginTop: 6 }}
                      placeholder="Escribe el nombre de la compañía..."
                      value={empresaOtra}
                      onChange={e => setEmpresaOtra(e.target.value.toUpperCase())}
                      required
                    />
                  )}
                </div>

                {/* 3. Nombre persona */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Nombre persona a ingresar? <span className="prestadores-required">*</span>
                  </label>
                  <span className="prestadores-sublabel">USAR SOLO "MAYÚSCULAS" Ejem: LUIS RICARDO LOPEZ RUIZ</span>
                  <input
                    type="text"
                    className="prestadores-input"
                    value={nombrePersona}
                    onChange={e => setNombrePersona(e.target.value.toUpperCase())}
                    placeholder="LUIS RICARDO LOPEZ RUIZ"
                    required
                  />
                </div>

                {/* 4. Número de gafete asignado */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Número de gafete asignado? <span className="prestadores-required">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="prestadores-input"
                    value={gafeteAsignado}
                    onChange={e => setGafeteAsignado(e.target.value)}
                    placeholder="1 a 10"
                    required
                  />
                </div>

                {/* 5. Alarma contra incendio */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    Existe riesgo de activar el sistema de alarma contra incendio? <span className="prestadores-required">*</span>
                  </label>
                  <div className="prestadores-radio-group">
                    <div
                      className={`prestadores-radio-pill ${alarmaIncendio === 'Si' ? 'selected' : ''}`}
                      onClick={() => setAlarmaIncendio('Si')}
                    >
                      ⚠️ Sí, existe riesgo
                    </div>
                    <div
                      className={`prestadores-radio-pill ${alarmaIncendio === 'No' ? 'selected' : ''}`}
                      onClick={() => setAlarmaIncendio('No')}
                    >
                      🛡️ No hay riesgo
                    </div>
                  </div>
                </div>

                {/* 6. Tipo de trabajos */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Tipo de trabajos a realizar? <span className="prestadores-required">*</span>
                  </label>
                  <select
                    className="prestadores-select"
                    value={tipoTrabajos}
                    onChange={e => setTipoTrabajos(e.target.value)}
                  >
                    {TRABAJOS_CATALOG.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {tipoTrabajos === 'OTRO TRABAJO' && (
                    <input
                      type="text"
                      className="prestadores-input"
                      style={{ marginTop: 6 }}
                      placeholder="Especifica el tipo de trabajo..."
                      value={tipoTrabajosOtro}
                      onChange={e => setTipoTrabajosOtro(e.target.value)}
                      required
                    />
                  )}
                </div>

                {/* 7. Edificio */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Edificio en donde se realizarán las actividades? <span className="prestadores-required">*</span>
                  </label>
                  <select
                    className="prestadores-select"
                    value={edificio}
                    onChange={e => setEdificio(e.target.value)}
                  >
                    {EDIFICIOS_CATALOG.map(ed => (
                      <option key={ed} value={ed}>{ed}</option>
                    ))}
                  </select>
                  {edificio === 'OTRO EDIFICIO' && (
                    <input
                      type="text"
                      className="prestadores-input"
                      style={{ marginTop: 6 }}
                      placeholder="Especifica el edificio o área..."
                      value={edificioOtro}
                      onChange={e => setEdificioOtro(e.target.value)}
                      required
                    />
                  )}
                </div>

                {/* Captura manual de herramientas (opcional si el contratista no usa smartphone) */}
                <div className="prestadores-field-group" style={{ marginTop: 8 }}>
                  <label className="prestadores-label">
                    Herramientas declaradas en caseta (opcional si el contratista no usa el QR)
                  </label>
                  <textarea
                    className="prestadores-textarea"
                    rows={2}
                    value={manualHerramientas}
                    onChange={e => setManualHerramientas(e.target.value)}
                    placeholder="Ej. 1 rotomartillo, 1 extensión, 1 caja de herramientas..."
                  />
                </div>

                <button
                  type="submit"
                  className="prestadores-submit-btn btn-entrada"
                  disabled={submitting}
                >
                  {submitting ? 'Registrando...' : '✅ Registrar Ingreso de Prestador'}
                </button>
              </form>
            ) : (
              /* FORMULARIO DE SALIDA */
              <form onSubmit={handleSubmitSalida}>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 12 }}>
                  Selecciona a un prestador actualmente en instalaciones para salida rápida, o ingresa su gafete/empresa:
                </div>

                {activosList.length > 0 && (
                  <div className="prestadores-field-group">
                    <label className="prestadores-label">Prestador en instalaciones:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                      {activosList.map(a => (
                        <div
                          key={a._id || a.folio}
                          onClick={() => {
                            sounds.click();
                            setSalidaPrestadorSeleccionado(a);
                            setGafeteEntrega(String(a.gafeteAsignado || 0));
                            setEmpresaSale(a.empresa);
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: salidaPrestadorSeleccionado?.folio === a.folio ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${salidaPrestadorSeleccionado?.folio === a.folio ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: '0.85rem' }}>{a.nombre}</strong>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{a.empresa} • Gafete: #{a.gafeteAsignado || 0}</div>
                          </div>
                          {a.herramientasCount > 0 && (
                            <span className="prestadores-badge badge-tools">🧰 {a.herramientasCount} herram.</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Número de gafete que entrega */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿Número de gafete que entrega? <span className="prestadores-required">*</span>
                  </label>
                  <span className="prestadores-sublabel">Si no se le entrego gafete el numero a registrar es 0 cero</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className="prestadores-input"
                    value={gafeteEntrega}
                    onChange={e => setGafeteEntrega(e.target.value)}
                    required
                  />
                </div>

                {/* Empresa que sale */}
                <div className="prestadores-field-group">
                  <label className="prestadores-label">
                    ¿De qué Empresa es el prestador de servicio que sale? <span className="prestadores-required">*</span>
                  </label>
                  <select
                    className="prestadores-select"
                    value={empresaSale}
                    onChange={e => setEmpresaSale(e.target.value)}
                  >
                    {COMPANIAS_CATALOG.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {salidaPrestadorSeleccionado?.herramientas?.length > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: 12, padding: 10, margin: '10px 0' }}>
                    <strong style={{ color: '#fbbf24', fontSize: '0.82rem' }}>⚠️ Verificar salida de herramientas:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.78rem' }}>
                      {salidaPrestadorSeleccionado.herramientas.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  className="prestadores-submit-btn btn-salida"
                  disabled={submitting}
                >
                  {submitting ? 'Procesando...' : '🟠 Registrar Salida de Prestador'}
                </button>
              </form>
            )}
          </div>

          {/* PANEL DERECHO (PC): QR DE VINCULACIÓN DE HERRAMIENTAS */}
          <div className="prestadores-qr-panel">
            <span className="prestadores-qr-badge">
              <span>📱</span>
              <span>Vinculación QR Móvil</span>
            </span>

            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 4px' }}>
              Registro de Herramientas
            </h3>

            <div className="prestadores-folio-tag">
              FOLIO: {currentFolio || '---'}
            </div>

            <div className="prestadores-qr-img-wrapper">
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="QR Herramientas" className="prestadores-qr-img" />
              ) : (
                <div style={{ width: 190, height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Generando QR...
                </div>
              )}
            </div>

            <p className="prestadores-qr-desc">
              Pide al contratista escanear este QR con la cámara de su smartphone para registrar su listado de herramientas.
            </p>

            {/* Selector de red de vinculación (Tailscale / Nube / LAN) */}
            <div className="prestadores-url-selector">
              <button
                type="button"
                className={`prestadores-url-pill ${qrBaseMode === 'tailscale' ? 'active' : ''}`}
                onClick={() => setQrBaseMode('tailscale')}
                title="Túnel Seguro Tailscale"
              >
                🌐 Tailscale
              </button>
              <button
                type="button"
                className={`prestadores-url-pill ${qrBaseMode === 'nube' ? 'active' : ''}`}
                onClick={() => setQrBaseMode('nube')}
                title="Firebase Hosting"
              >
                ☁️ Nube
              </button>
              <button
                type="button"
                className={`prestadores-url-pill ${qrBaseMode === 'lan' ? 'active' : ''}`}
                onClick={() => setQrBaseMode('lan')}
                title="Red Local Wi-Fi Caseta"
              >
                🏢 LAN
              </button>
            </div>

            {/* Notificación en vivo si el contratista ya envió herramientas */}
            {recentLiveTools && (
              <div className="prestadores-live-tool-notice">
                <div className="prestadores-live-tool-header">
                  <span>🔔 Herramientas Recibidas</span>
                  <span>{recentLiveTools.count} items</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                  Folio: {recentLiveTools.folio}
                </div>
                <ul className="prestadores-live-tool-list">
                  {(recentLiveTools.herramientas || []).map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: EN INSTALACIONES (ACTIVOS) */}
      {activeTab === 'activos' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              type="text"
              className="prestadores-input"
              placeholder="Buscar por nombre, empresa o folio..."
              value={filtroBusqueda}
              onChange={e => setFiltroBusqueda(e.target.value)}
            />
          </div>

          {activosList.length === 0 ? (
            <div className="prestadores-card" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🍃</div>
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>No hay prestadores adentro</h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Todos los contratistas han registrado su salida o aún no se han registrado ingresos hoy.
              </p>
            </div>
          ) : (
            <div className="prestadores-activos-list">
              {activosList
                .filter(a => {
                  if (!filtroBusqueda.trim()) return true;
                  const q = filtroBusqueda.toLowerCase();
                  return (
                    (a.nombre || '').toLowerCase().includes(q) ||
                    (a.empresa || '').toLowerCase().includes(q) ||
                    (a.folio || '').toLowerCase().includes(q) ||
                    (a.edificio || '').toLowerCase().includes(q)
                  );
                })
                .map(item => (
                  <div key={item._id || item.folio} className="prestadores-item-card">
                    <div className="prestadores-item-header">
                      <div>
                        <div className="prestadores-item-name">{item.nombre}</div>
                        <div className="prestadores-item-company">{item.empresa}</div>
                      </div>
                      <span className="prestadores-folio-tag" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                        {item.folio}
                      </span>
                    </div>

                    <div className="prestadores-item-badges">
                      <span className="prestadores-badge badge-gafete">
                        🎫 Gafete #{item.gafeteAsignado || 0}
                      </span>
                      <span className="prestadores-badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                        🏢 {item.edificio}
                      </span>
                      <span className="prestadores-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                        🛠️ {item.tipoTrabajos}
                      </span>

                      {item.herramientasCount > 0 ? (
                        <span
                          className="prestadores-badge badge-tools"
                          onClick={() => { sounds.click(); setSelectedToolsModal(item); }}
                          title="Clic para ver listado de herramientas"
                        >
                          🧰 {item.herramientasCount} herramientas (Ver)
                        </span>
                      ) : (
                        <span className="prestadores-badge badge-no-tools">
                          Sin herramientas
                        </span>
                      )}

                      {item.alarmaIncendio === 'Si' && (
                        <span className="prestadores-badge badge-fire">
                          🔥 Riesgo Alarma Incendio
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>Ingreso: {item.horaEntrada || item.hora} ({item.acceso})</span>
                      <button
                        type="button"
                        className="prestadores-btn-action prestadores-btn-salida-fast"
                        onClick={() => {
                          sounds.click();
                          setSalidaPrestadorSeleccionado(item);
                          setGafeteEntrega(String(item.gafeteAsignado || 0));
                          setEmpresaSale(item.empresa);
                          setActiveTab('nuevo');
                          setTipoRegistro('Salida');
                        }}
                      >
                        🟠 Dar Salida
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: HISTORIAL */}
      {activeTab === 'historial' && (
        <div className="prestadores-card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>
            Historial de Ingresos y Salidas de Prestadores
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {historialList.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Sin registros encontrados.</p>
            ) : (
              historialList.map(h => (
                <div
                  key={h._id || h.folio}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{h.nombre}</strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: h.estatus === 'DENTRO' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: h.estatus === 'DENTRO' ? '#34d399' : '#fbbf24'
                      }}
                    >
                      {h.estatus === 'DENTRO' ? '🟢 EN INSTALACIONES' : '🟠 SALIDA'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                    {h.empresa} • Folio: {h.folio} • Gafete: #{h.gafeteAsignado || h.gafeteEntrega || 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Entrada: {h.fechaEntrada || h.fecha} {h.horaEntrada || h.hora} {h.horaSalida ? `| Salida: ${h.horaSalida}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE HERRAMIENTAS */}
      {selectedToolsModal && (
        <div className="prestadores-modal-backdrop" onClick={() => setSelectedToolsModal(null)}>
          <div className="prestadores-modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#38bdf8' }}>
                🧰 Herramientas de {selectedToolsModal.nombre}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedToolsModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 10 }}>
              Empresa: <strong>{selectedToolsModal.empresa}</strong> • Folio: <strong>{selectedToolsModal.folio}</strong>
            </div>

            <div style={{ maxHeight: 220, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 12 }}>
              {(selectedToolsModal.herramientas || []).length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No se registraron herramientas.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.84rem' }}>
                  {selectedToolsModal.herramientas.map((h, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{h}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="prestadores-submit-btn btn-entrada"
              style={{ marginTop: 14 }}
              onClick={() => setSelectedToolsModal(null)}
            >
              Cerrar Consulta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
