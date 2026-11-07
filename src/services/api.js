/**
 * Servicio Centralizado de Conexión a UBE (Universal Backend Engine)
 * Compatible con:
 * - Servidor Local UBE (:7001 / :7002)
 * - Red de Caseta (10.x / 192.168.x)
 * - Cloudflare Worker Oficial Permanente (https://oxosd450mlh.taile94978.ts.net)
 */

export const resolveBackendBase = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const qBackend = urlParams.get('backend') || urlParams.get('api');
  if (qBackend) {
    try { localStorage.setItem('regas_active_api_base', qBackend); } catch (e) {}
    return qBackend.replace(/\/+$/, '');
  }
  const qIp = urlParams.get('ip');
  if (qIp) {
    const formatted = `http://${qIp}:7001`;
    try { localStorage.setItem('regas_active_api_base', formatted); } catch (e) {}
    return formatted;
  }

  const h = window.location.hostname;
  const p = window.location.port;

  // 1. Si se sirve directamente desde UBE (puerto 7001)
  if (p === '7001') return '';

  // 2. Si corre en localhost o 127.0.0.1
  if (h === 'localhost' || h === '127.0.0.1') return 'http://127.0.0.1:7001';

  // 3. Red interna caseta
  if (h.startsWith('10.') || h.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return `http://${h}:7001`;
  }

  // 4. Caché de localStorage
  try {
    const cached = localStorage.getItem('regas_active_api_base');
    if (cached && (cached.includes('trycloudflare.com') || cached.includes('10.200.79.175') || cached.includes('ngrok') || cached.includes('workers.dev') || cached.includes('cic-10.com') || (window.location.protocol === 'https:' && cached.startsWith('http:')))) {
      localStorage.removeItem('regas_active_api_base');
    } else if (cached && (window.location.protocol !== 'https:' || cached.startsWith('https:'))) {
      return cached.replace(/\/+$/, '');
    }
  } catch (e) {}

  // 5. Cloudflare Worker Permanente UBE (Por defecto)
  // Canal de emergencia Ngrok (desactivado por defecto; se activa solo con ?emergency=1 o ?backend=ngrok)
  const isEmergency = urlParams.get('emergency') === '1' || urlParams.get('backend') === 'ngrok';
  if (isEmergency) {
    return 'https://oxosd450mlh.taile94978.ts.net';
  }
  return 'https://oxosd450mlh.taile94978.ts.net';
};

export const BACKEND_BASE = resolveBackendBase();

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Bypass-Tunnel-Reminder': 'true',
  'bypass-tunnel-reminder': 'true'
};

async function apiRequest(endpoint, options = {}) {
  const base = options._baseOverride || resolveBackendBase();
  const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      let errMessage = `Error HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error) errMessage = errJson.error;
        if (errJson.message) errMessage = errJson.message;
      } catch (e) {}
      const err = new Error(errMessage);
      err.status = response.status;
      throw err;
    }
    return response.json();
  } catch (netErr) {
    const fallbackBase = 'https://oxosd450mlh.taile94978.ts.net';
    if (base !== fallbackBase && !options._isRetry) {
      console.warn('[Mini Apps ⚠️] Reintentando ' + endpoint + ' vía Cloudflare Worker...');
      return apiRequest(endpoint, { ...options, _isRetry: true, _baseOverride: fallbackBase });
    }
    throw netErr;
  }
}

// ==========================================
// IDENTIFICACIÓN Y TELEMETRÍA DEL DISPOSITIVO
// ==========================================
export async function sendDeviceIdentifySignal() {
  const deviceId = getDeviceUuid();
  return apiRequest('/api/cdi/devices/identify', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      timestamp: Date.now()
    })
  });
}

export function getDeviceUuid() {
  if (typeof window === 'undefined') return 'server_node';
  // 1. Preservar intactos los dispositivos que ya se han identificado previamente
  let id = localStorage.getItem('regas_cdi_device_uuid');
  if (id) {
    return id;
  }

  // 2. Solo para NUEVOS dispositivos (o si borraron caché/cookies):
  try {
    const params = new URLSearchParams(window.location.search);
    const rawCaseta = params.get('caseta') || params.get('c');
    const devParam = params.get('dev') || params.get('device_id');
    if (devParam) {
      id = devParam.trim();
    } else if (rawCaseta) {
      // Apuntar con parámetro de caseta, sustituyendo espacios por "_"
      const cleanSlug = rawCaseta.trim().replace(/\s+/g, '_');
      id = 'dev_' + cleanSlug;
    }
  } catch (e) {}

  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  try {
    localStorage.setItem('regas_cdi_device_uuid', id);
  } catch (e) {}

  return id;
}

export function getTodayDateIso() {
  try {
    const mx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(mx)) return mx;
  } catch (e) {}
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function detectDeviceInfo() {
  if (typeof navigator === 'undefined') return { model: 'Dispositivo Web', type: 'pc', browser: 'Navegador Web', userAgent: '' };
  const ua = navigator.userAgent || '';
  let model = 'Dispositivo Web';
  let type = 'pc';

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile);
  type = isMobile ? 'mobile' : 'pc';

  if (/iPhone/i.test(ua)) {
    model = 'Apple iPhone';
  } else if (/iPad/i.test(ua)) {
    model = 'Apple iPad';
    type = 'mobile';
  } else if (/Android/i.test(ua)) {
    const match = ua.match(/Android[^;]+;\s*([^;)]+)\)/i);
    if (match && match[1]) {
      model = match[1].replace(/Build\/.*/i, '').trim();
    } else {
      model = 'Android';
    }
  } else if (/Windows NT/i.test(ua)) {
    model = 'PC Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    model = 'Mac (macOS)';
  } else if (/Linux/i.test(ua)) {
    model = 'PC Linux';
  }

  let browser = 'Navegador Web';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/SamsungBrowser\//i.test(ua)) browser = 'Samsung Internet';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';

  return { model, type, browser, userAgent: ua };
}

let cachedLocation = null;
let requestingLocation = false;

export function requestDeviceLocation(onReady) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    cachedLocation = { status: 'unsupported', error: 'GPS no soportado' };
    if (onReady) onReady(cachedLocation);
    return;
  }

  // Detectar si el navegador está en un contexto no seguro (HTTP en IP de red local)
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    cachedLocation = {
      status: 'error',
      error: 'Red local HTTP (Requiere HTTPS para GPS de hardware)'
    };
    if (onReady) onReady(cachedLocation);
    return;
  }

  if (requestingLocation) return;
  requestingLocation = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      requestingLocation = false;
      cachedLocation = {
        status: 'ok',
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy),
        timestamp: pos.timestamp
      };
      if (onReady) onReady(cachedLocation);
    },
    (err) => {
      requestingLocation = false;
      let errText = 'GPS no disponible';
      const rawMsg = (err && err.message) ? err.message : '';
      if (/secure origins|permanently-removed|insecure/i.test(rawMsg) || (typeof window !== 'undefined' && window.isSecureContext === false)) {
        errText = 'Red local HTTP (Requiere HTTPS para GPS de hardware)';
      } else if (err.code === 1) {
        errText = 'Permiso GPS denegado por el usuario';
      } else if (err.code === 2) {
        errText = 'Señal GPS no disponible';
      } else if (err.code === 3) {
        errText = 'Tiempo de espera GPS agotado';
      } else if (rawMsg) {
        errText = rawMsg;
      }

      cachedLocation = { status: 'error', error: errText };
      if (onReady) onReady(cachedLocation);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

export function getCachedLocation() {
  return cachedLocation;
}

// GESTIÓN DE PERMISOS / FUNCIONES ACTIVAS DEL DISPOSITIVO
export function getDeviceFeatures() {
  try {
    const raw = localStorage.getItem('regas_cdi_device_features');
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        return {
          checador: parsed.checador === true,
          recorridos: parsed.recorridos === true,
          bitacoras: (parsed.bitacoras === true || parsed.bitacora === true),
          mec: parsed.mec === true
        };
      }
    }
  } catch (e) {}
  return { checador: false, recorridos: false, bitacoras: false, mec: false };
}

export function saveDeviceFeatures(features) {
  if (!features) return;
  let parsed = features;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch(e) {}
  }
  if (!parsed || typeof parsed !== 'object') return;
  const normalized = {
    checador: parsed.checador === true,
    recorridos: parsed.recorridos === true,
    bitacoras: (parsed.bitacoras === true || parsed.bitacora === true),
    mec: parsed.mec === true
  };
  try {
    localStorage.setItem('regas_cdi_device_features', JSON.stringify(normalized));
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('miniapps_features_updated', { detail: normalized }));
  }
}

export async function fetchDeviceFeatures() {
  const devId = getDeviceUuid();
  try {
    const res = await apiRequest(`/api/cdi/devices/features?deviceId=${encodeURIComponent(devId)}`);
    if (res && res.features) {
      saveDeviceFeatures(res.features);
      return res.features;
    }
  } catch (e) {}
  return getDeviceFeatures();
}

// LATIDO / SEÑAL EN VIVO HACIA EL MONITOR DEL OPERADOR (CCO)
export async function sendDeviceHeartbeat(caseta) {
  const devId = getDeviceUuid();
  const info = detectDeviceInfo();
  const payload = {
    deviceId: devId,
    deviceModel: info.model,
    deviceType: info.type,
    browser: info.browser,
    userAgent: info.userAgent,
    caseta: caseta || 'Sin caseta seleccionada',
    location: cachedLocation,
    lastSeen: new Date().toISOString(),
    timestamp: Date.now()
  };

  try {
    const res = await apiRequest('/api/cdi/device-heartbeat', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res && res.features) {
      saveDeviceFeatures(res.features);
    }
    if (res && res.caseta) {
      localStorage.setItem('selectedCaseta', res.caseta);
      localStorage.setItem('regas_cdi_last_caseta', res.caseta);
      localStorage.setItem('caseta_seleccionada_cic', res.caseta);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('miniapps_caseta_updated', { detail: { caseta: res.caseta } }));
      }
    }
    return res;
  } catch (err) {
    console.warn('[Heartbeat] No se pudo enviar señal al monitor:', err.message);
    return null;
  }
}


// ACTUALIZAR CASETA EXPLICITAMENTE EN EL MONITOR Y BD
export async function updateDeviceCaseta(caseta) {
  const devId = getDeviceUuid();
  return apiRequest('/api/cdi/devices/caseta', {
    method: 'POST',
    body: JSON.stringify({ deviceId: devId, caseta, source: 'mobile' })
  });
}
// ==========================================
// 1. CHECADOR & ASISTENCIA FACIAL IA
// ==========================================
export async function sendReconocimientoFacial(fotoBase64) {
  return apiRequest('/api/asistencia/reconocimiento-facial', {
    method: 'POST',
    body: JSON.stringify({ foto: fotoBase64 })
  });
}

export async function fetchTurnoDisponible(socioId) {
  return apiRequest(`/api/asistencia/turno-disponible?id=${encodeURIComponent(socioId)}`);
}

export async function registrarAsistenciaEntrada(payload) {
  return apiRequest('/api/asistencia/entrada', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function registrarAsistenciaSalida(payload) {
  return apiRequest('/api/asistencia/salida', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ==========================================
// 2. CDI (CONTEO DE INGRESOS CON SEÑAL AL MONITOR)
// ==========================================
export async function fetchCdiCounts(fecha) {
  const d = fecha || getTodayDateIso();
  return apiRequest(`/api/cdi?fecha=${d}`);
}

export async function incrementCdiCount(caseta, category, delta = 1) {
  const d = getTodayDateIso();
  const devId = getDeviceUuid();
  return apiRequest('/api/cdi/increment', {
    method: 'POST',
    body: JSON.stringify({
      fecha: d,
      caseta,
      categoria: category,
      category,
      count: delta,
      delta,
      deviceId: devId,
      location: cachedLocation,
      timestamp: Date.now()
    })
  });
}

export async function syncCdiCounts(caseta, counts, fecha) {
  return apiRequest('/api/cdi/sync', {
    method: 'POST',
    body: JSON.stringify({
      caseta,
      counts,
      fecha: fecha || getTodayDateIso()
    })
  });
}

export async function saveCdiEstacionamiento(caseta, valores, fecha) {
  const d = fecha || getTodayDateIso();
  const devId = getDeviceUuid();
  const horaRegistro = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return apiRequest('/api/cdi/estacionamiento', {
    method: 'POST',
    body: JSON.stringify({
      fecha: d,
      caseta,
      valores,
      horaRegistro,
      deviceId: devId,
      timestamp: Date.now()
    })
  });
}

export async function clearCdiEstacionamiento(caseta, fecha) {
  const d = fecha || getTodayDateIso();
  const devId = getDeviceUuid();
  return apiRequest('/api/cdi/estacionamiento', {
    method: 'POST',
    body: JSON.stringify({
      fecha: d,
      caseta,
      clear: true,
      action: 'clear',
      deviceId: devId,
      timestamp: Date.now()
    })
  });
}

// CONEXIÓN SSE EN VIVO AL MONITOR
export function initCdiSse(onCdiUpdate, onDeviceUpdate) {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};
  const base = resolveBackendBase();
  const url = `${base}/api/events`;

  let eventSource = null;
  try {
    eventSource = new EventSource(url);
    eventSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg && msg.type === 'cdi_update' && onCdiUpdate) {
          onCdiUpdate(msg.payload);
        }
        if (msg && msg.type === 'cdi_device_update') {
          const myDevId = getDeviceUuid();
          const p = msg.payload || {};
          const pId = (p.deviceId || p._id || '').trim();
          if (pId === myDevId.trim() || pId === 'all') {
            if (p.features) {
              saveDeviceFeatures(p.features);
            }
            if (p.caseta) {
              localStorage.setItem('selectedCaseta', p.caseta);
              localStorage.setItem('regas_cdi_last_caseta', p.caseta);
              localStorage.setItem('caseta_seleccionada_cic', p.caseta);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('miniapps_caseta_updated', { detail: { caseta: p.caseta } }));
              }
            }
          }
          if (onDeviceUpdate) {
            onDeviceUpdate(p);
          }
        }
        if (msg && msg.type === 'cdi_caseta_change') {
          const myDevId = getDeviceUuid();
          const p = msg.payload || {};
          const pId = (p.deviceId || p._id || '').trim();
          if (pId === myDevId.trim() || pId === 'all') {
            if (p.caseta) {
              localStorage.setItem('selectedCaseta', p.caseta);
              localStorage.setItem('regas_cdi_last_caseta', p.caseta);
              localStorage.setItem('caseta_seleccionada_cic', p.caseta);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('miniapps_caseta_updated', { detail: { caseta: p.caseta } }));
              }
            }
          }
          if (onDeviceUpdate) {
            onDeviceUpdate(p);
          }
        }
        if (msg && msg.type === 'cdi_force_reload') {
          const myDevId = getDeviceUuid();
          const target = (msg.payload && msg.payload.targetDeviceId) ? msg.payload.targetDeviceId.trim() : 'all';
          if (target === 'all' || target === myDevId.trim()) {
            // Si el evento solo es reasignación de caseta, no forzar recarga destructiva del navegador
            if (msg.payload && msg.payload.action === 'caseta_change') {
              if (msg.payload.caseta) {
                localStorage.setItem('selectedCaseta', msg.payload.caseta);
                localStorage.setItem('regas_cdi_last_caseta', msg.payload.caseta);
                localStorage.setItem('caseta_seleccionada_cic', msg.payload.caseta);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('miniapps_caseta_updated', { detail: { caseta: msg.payload.caseta } }));
                }
              }
              return;
            }
            console.log('[SSE 🔄] Orden remota de recarga/actualización recibida de RegAs 3');
            fetchDeviceFeatures().then((feat) => {
              if (feat) saveDeviceFeatures(feat);
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            });
          }
        }
      } catch (err) {}
    };
    eventSource.onerror = () => {
      // Reconexión silenciosa de SSE
    };
  } catch (err) {
    console.warn('[SSE] Error conectando a flujo de eventos:', err);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

// ==========================================
// 3. RECORRIDOS DE SEGURIDAD
// ==========================================
export async function fetchRecorridos(fecha, schemaId) {
  let url = '/api/recorridos?';
  if (fecha) url += `fecha=${encodeURIComponent(fecha)}&`;
  if (schemaId) url += `schemaId=${encodeURIComponent(schemaId)}&`;
  return apiRequest(url);
}

export async function saveRecorrido(recorrido) {
  return apiRequest('/api/recorridos', {
    method: 'POST',
    body: JSON.stringify(recorrido)
  });
}

export async function sendRecorridoLocationPing(pingData) {
  return apiRequest('/api/recorridos/location', {
    method: 'POST',
    body: JSON.stringify(pingData)
  });
}

// ==========================================
// 4. BITÁCORAS
// ==========================================
export async function fetchBitacoras(fecha, schemaId) {
  let url = '/api/bitacoras?';
  if (fecha) url += `fecha=${encodeURIComponent(fecha)}&`;
  if (schemaId && schemaId !== 'all') url += `schemaId=${encodeURIComponent(schemaId)}&`;
  return apiRequest(url);
}

export async function saveBitacora(bitacora) {
  return apiRequest('/api/bitacoras', {
    method: 'POST',
    body: JSON.stringify(bitacora)
  });
}

// ==========================================
// 5. MEC (MONITOREO EN CARRETERA)
// ==========================================
export async function sendMecLocationPing(pingData) {
  return apiRequest('/api/mec/location', {
    method: 'POST',
    body: JSON.stringify(pingData)
  });
}

export async function fetchMecActiveMonitorings() {
  return apiRequest('/api/mec/active');
}

export async function startMecMonitoring(data) {
  return apiRequest('/api/mec/start', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function addMecCheckpoint(id, cpData) {
  return apiRequest(`/api/mec/${encodeURIComponent(id)}/checkpoint`, {
    method: 'POST',
    body: JSON.stringify(cpData)
  });
}

export async function finishMecMonitoring(id, finishData) {
  return apiRequest(`/api/mec/${encodeURIComponent(id)}/finish`, {
    method: 'POST',
    body: JSON.stringify(finishData)
  });
}

export async function fetchBorderWaitTimes(refresh = false) {
  return apiRequest(`/api/mec/border-wait-times${refresh ? '?refresh=true' : ''}`);
}

// ==========================================
// AUDIO FEEDBACK (Web Audio API - 0 dependencies)
// ==========================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

export const sounds = {
  click: () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
  },
  beep: () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1046, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {}
  },
  success: () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + idx * 0.08;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.15);
      });
    } catch (e) {}
  },
  warning: () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }
};
