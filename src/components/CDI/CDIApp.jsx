import React, { useState, useEffect, useRef } from 'react';
import './CDIApp.css';
import {
  fetchCdiCounts,
  incrementCdiCount,
  saveCdiEstacionamiento,
  clearCdiEstacionamiento,
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

const canonicalCasetaName = (name) => {
  const n = normCaseta(name);
  if (n === 'recepcion edison') return 'Recepción Edison';
  if (n.includes('simon') && n.includes('bolivar')) return 'Simón Bolívar';
  return name || 'Recepción Edison';
};

// Esquema oficial de Disponibilidad de Estacionamiento basado en MS Forms (https://forms.office.com/r/keLXCZDW7m)
// Se llena solo una vez al día a las 10:00 AM
const PARKING_SCHEMAS = {
  'michelena': {
    caseta: 'Michelena',
    icon: '📍',
    totalCapacity: 352, // 164 + 18 + 170
    sections: [
      {
        title: 'Michelena',
        icon: '📍',
        fields: [
          { key: 'michelena_ordinarios', label: 'Ordinarios', shortLabel: 'Ord.', total: 164, subtitle: 'Cajones ordinarios totales: 164' },
          { key: 'michelena_exclusivos', label: 'Exclusivos', shortLabel: 'Excl.', total: 18, subtitle: 'Cajones exclusivos totales: 18' }
        ]
      },
      {
        title: 'Estacionamiento Anexo (Michelenita)',
        icon: '🅿️',
        fields: [
          { key: 'anexo_ordinarios', label: 'Ordinarios', shortLabel: 'Anexo', total: 170, subtitle: 'Cajones totales: 170' }
        ]
      }
    ]
  },
  'impulso': {
    caseta: 'Impulso',
    icon: '⚡',
    totalCapacity: 268, // 203 + 39 + 26
    sections: [
      {
        title: 'Impulso',
        icon: '⚡',
        fields: [
          { key: 'impulso_ordinarios', label: 'Ordinarios', shortLabel: 'Ord.', total: 203, subtitle: 'Cajones ordinarios totales: 203' },
          { key: 'impulso_exclusivos', label: 'Exclusivos', shortLabel: 'Excl.', total: 39, subtitle: 'Cajones exclusivos totales: 39' }
        ]
      },
      {
        title: 'Estacionamiento Anexo Domínguez',
        icon: '🅿️',
        fields: [
          { key: 'anexo_dominguez_ordinarios', label: 'Ordinarios', shortLabel: 'Domínguez', total: 26, subtitle: 'Cajones totales: 26 (En remodelación)' }
        ]
      }
    ]
  },
  'edison': {
    caseta: 'Edison',
    icon: '🛡️',
    totalCapacity: 112, // 43 + 44 + 25
    sections: [
      {
        title: 'Edison',
        icon: '🛡️',
        fields: [
          { key: 'edison_ordinarios', label: 'Ordinarios', shortLabel: 'Ord.', total: 43, subtitle: 'Cajones ordinarios totales: 43' },
          { key: 'edison_exclusivos', label: 'Exclusivos', shortLabel: 'Excl.', total: 44, subtitle: 'Cajones exclusivos totales: 44' }
        ]
      },
      {
        title: 'Estacionamiento Anexo Vías',
        icon: '🅿️',
        fields: [
          { key: 'anexo_vias_ordinarios', label: 'Ordinarios', shortLabel: 'Vías', total: 25, subtitle: 'Cajones totales: 25' }
        ]
      }
    ]
  },
  'simon bolivar': {
    caseta: 'Simón Bolívar',
    icon: '🏛️',
    totalCapacity: 24,
    sections: [
      {
        title: 'Simón Bolívar',
        icon: '🏛️',
        fields: [
          { key: 'disponibilidad_general', label: 'Disponibilidad General', shortLabel: 'General', total: 24, subtitle: 'Cajones totales: 24' }
        ]
      }
    ]
  },
  'carranza': {
    caseta: 'Carranza',
    icon: '🚪',
    totalCapacity: 126,
    sections: [
      {
        title: 'Carranza',
        icon: '🚪',
        fields: [
          { key: 'disponibilidad_general', label: 'Disponibilidad General', shortLabel: 'General', total: 126, subtitle: 'Cajones totales: 126' }
        ]
      }
    ]
  },
  'universidad': {
    caseta: 'Universidad',
    icon: '🏫',
    totalCapacity: 207,
    sections: [
      {
        title: 'Universidad',
        icon: '🏫',
        fields: [
          { key: 'disponibilidad_general', label: 'Disponibilidad General', shortLabel: 'General', total: 207, subtitle: 'Cajones totales: 207' }
        ]
      }
    ]
  }
};

const PARKING_ORDER = ['edison', 'impulso', 'michelena', 'carranza', 'universidad', 'simon bolivar'];
const TOTAL_PARKING_CAPACITY_ALL = Object.values(PARKING_SCHEMAS).reduce((acc, s) => acc + s.totalCapacity, 0); // 1089

const getParkingSchema = (casetaName) => {
  const clean = normCaseta(String(casetaName || '').replace(' // Call Center', ''));
  return PARKING_SCHEMAS[clean] || null;
};

const isCasetaRecordComplete = (schema, record) => {
  if (!schema || !record || !record.captured || !record.valores) return false;
  return schema.sections.every((sec) =>
    sec.fields.every((f) => {
      const v = record.valores[f.key];
      if (v === undefined || v === null || String(v).trim() === '') return false;
      const num = Number(v);
      return !Number.isNaN(num) && num >= 0;
    })
  );
};

const getCasetaAvailableSum = (schema, record) => {
  if (!isCasetaRecordComplete(schema, record)) return 0;
  let sum = 0;
  schema.sections.forEach((sec) => {
    sec.fields.forEach((f) => {
      sum += Number(record.valores[f.key] || 0);
    });
  });
  return sum;
};

const findCasetaCounts = (casetasMap, targetCaseta) => {
  if (!casetasMap || typeof casetasMap !== 'object') return null;
  const targetNorm = normCaseta(targetCaseta);
  let merged = null;
  for (const [k, v] of Object.entries(casetasMap)) {
    if (normCaseta(k) === targetNorm && v && typeof v === 'object') {
      const intern = Number(v.internos !== undefined ? v.internos : (v.interno || 0));
      const extern = Number(v.externos !== undefined ? v.externos : (v.externo || 0));
      const prest = Number(v.prestadores !== undefined ? v.prestadores : (v.prestador || 0));
      const visit = Number(v.visitas !== undefined ? v.visitas : (v.visita || 0));
      const tot = (typeof v.total === 'number') ? v.total : (intern + extern + prest + visit);
      if (!merged) {
        merged = { internos: intern, externos: extern, prestadores: prest, visitas: visit, total: tot };
      } else {
        merged.internos += intern;
        merged.externos += extern;
        merged.prestadores += prest;
        merged.visitas += visit;
        merged.total += tot;
      }
    }
  }
  return merged;
};

const loadLocalParkingMap = (dateIso) => {
  try {
    const raw = localStorage.getItem(`regas_cdi_parking_${dateIso}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
};

const saveLocalParkingMap = (dateIso, mapObj) => {
  try {
    localStorage.setItem(`regas_cdi_parking_${dateIso}`, JSON.stringify(mapObj));
  } catch (e) {}
};

export default function CDIApp({ theme, onToggleTheme, onIdentifyDevice, isIdentifying }) {
  const [caseta, setCaseta] = useState(() => {
    return canonicalCasetaName(localStorage.getItem('selectedCaseta') || 'Recepción Edison');
  });
  const [mode, setMode] = useState('add'); // 'add' (+1) | 'sub' (-1 / corrección)
  const [counts, setCounts] = useState({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [pendingDeltas, setPendingDeltas] = useState({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState('Monitor Conectado');

  // Estado de la vista de resumen de todas las casetas (en memoria únicamente, NUNCA persistir en navegación ni recargas)
  const [showSummaryView, setShowSummaryView] = useState(false);
  const [ingresosExpanded, setIngresosExpanded] = useState(false);
  const [cajonesExpanded, setCajonesExpanded] = useState(false);
  const [allCasetasData, setAllCasetasData] = useState({});
  const [globalTotals, setGlobalTotals] = useState({ internos: 0, externos: 0, prestadores: 0, visitas: 0, total: 0 });

  // Estado de Disponibilidad de Estacionamiento (Corte único 10:00 AM)
  const [parkingByCaseta, setParkingByCaseta] = useState(() => loadLocalParkingMap(getTodayDateIso()));
  const [parkingReportSentToday, setParkingReportSentToday] = useState(() => {
    try {
      return localStorage.getItem(`regas_cdi_parking_sent_v1_${getTodayDateIso()}`) === '1';
    } catch {
      return false;
    }
  });
  const [showParkingModal, setShowParkingModal] = useState(false);
  const [parkingFormValues, setParkingFormValues] = useState({});
  const [savingParking, setSavingParking] = useState(false);

  const updateParkingReportSent = (isSent) => {
    const todayIso = getTodayDateIso();
    const flag = Boolean(isSent);
    setParkingReportSentToday(flag);
    try {
      localStorage.setItem(`regas_cdi_parking_sent_v1_${todayIso}`, flag ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  };

  // Timers independientes por categoría para no cancelar eventos concurrentes
  const debounceTimersRef = useRef({});
  const pendingDeltasRef = useRef({ internos: 0, externos: 0, prestadores: 0, visitas: 0 });

  const currentDateStr = new Date().toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const mergeRemoteParking = (remoteEst) => {
    if (!remoteEst || typeof remoteEst !== 'object') return;
    const todayIso = getTodayDateIso();
    setParkingByCaseta((prev) => {
      const next = { ...prev };
      Object.entries(remoteEst).forEach(([k, val]) => {
        if (val && val.captured) {
          next[normCaseta(k)] = val;
        } else if (val && val.captured === false) {
          delete next[normCaseta(k)];
        }
      });
      saveLocalParkingMap(todayIso, next);
      return next;
    });
  };

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
        const clean = canonicalCasetaName(newCaseta.trim());
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
          if (cdiPayload.estacionamiento) {
            mergeRemoteParking(cdiPayload.estacionamiento);
          } else if (cdiPayload.cdi && cdiPayload.cdi.estacionamiento) {
            mergeRemoteParking(cdiPayload.cdi.estacionamiento);
          }
          if (typeof cdiPayload.estacionamientoDispatched === 'boolean') {
            updateParkingReportSent(cdiPayload.estacionamientoDispatched);
          } else if (cdiPayload.cdi && typeof cdiPayload.cdi.estacionamientoDispatched === 'boolean') {
            updateParkingReportSent(cdiPayload.cdi.estacionamientoDispatched);
          }

          const hasPending = Object.values(pendingDeltasRef.current).some((v) => v !== 0);
          if (cdiPayload.cdi && cdiPayload.cdi.casetas) {
            setAllCasetasData(cdiPayload.cdi.casetas);
            if (cdiPayload.cdi.totals) {
              setGlobalTotals(cdiPayload.cdi.totals);
              setTotalGeneral(Number(cdiPayload.cdi.totals.total || 0));
            }
            if (!hasPending) {
              const c = findCasetaCounts(cdiPayload.cdi.casetas, caseta);
              setCounts({
                internos: c ? Number(c.internos || 0) : 0,
                externos: c ? Number(c.externos || 0) : 0,
                prestadores: c ? Number(c.prestadores || 0) : 0,
                visitas: c ? Number(c.visitas || 0) : 0
              });
            }
          } else if (cdiPayload.caseta && cdiPayload.casetaCounts) {
            setAllCasetasData(prev => ({
              ...prev,
              [cdiPayload.caseta]: cdiPayload.casetaCounts
            }));
            if (!hasPending) {
              const targetNorm = normCaseta(caseta.replace(' // Call Center', ''));
              if (normCaseta(cdiPayload.caseta) === targetNorm) {
                setCounts({
                  internos: Number(cdiPayload.casetaCounts.internos || 0),
                  externos: Number(cdiPayload.casetaCounts.externos || 0),
                  prestadores: Number(cdiPayload.casetaCounts.prestadores || 0),
                  visitas: Number(cdiPayload.casetaCounts.visitas || 0)
                });
              }
            }
            if (cdiPayload.totals) {
              setGlobalTotals(cdiPayload.totals);
              setTotalGeneral(Number(cdiPayload.totals.total || 0));
            }
          } else if (cdiPayload.totals) {
            setGlobalTotals(cdiPayload.totals);
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

  // Polling cada 4 segundos cuando la vista de resumen de todas las casetas está activa
  useEffect(() => {
    if (!showSummaryView) return;
    loadCounts(caseta);
    const interval = setInterval(() => {
      loadCounts(caseta);
    }, 4000);
    return () => clearInterval(interval);
  }, [showSummaryView, caseta]);

  const loadCounts = async (targetCaseta = caseta) => {
    try {
      setSyncing(true);
      setLastSyncMsg('Sincronizando...');
      const data = await fetchCdiCounts();
      if (data) {
        if (data.cdi && data.cdi.estacionamiento) {
          mergeRemoteParking(data.cdi.estacionamiento);
        } else if (data.estacionamiento) {
          mergeRemoteParking(data.estacionamiento);
        }
        if (data.cdi && typeof data.cdi.estacionamientoDispatched === 'boolean') {
          updateParkingReportSent(data.cdi.estacionamientoDispatched);
        } else if (typeof data.estacionamientoDispatched === 'boolean') {
          updateParkingReportSent(data.estacionamientoDispatched);
        }

        const casetasMap = (data.cdi && data.cdi.casetas) ? data.cdi.casetas : (data.casetas || data);
        if (casetasMap) {
          setAllCasetasData(casetasMap);
        }
        const c = findCasetaCounts(casetasMap, targetCaseta || caseta);
        setCounts({
          internos: c ? Number(c.internos || 0) : 0,
          externos: c ? Number(c.externos || 0) : 0,
          prestadores: c ? Number(c.prestadores || 0) : 0,
          visitas: c ? Number(c.visitas || 0) : 0
        });

        if (data.cdi && data.cdi.totals) {
          setGlobalTotals(data.cdi.totals);
          setTotalGeneral(Number(data.cdi.totals.total || 0));
        } else if (data.totals) {
          setGlobalTotals(data.totals);
          setTotalGeneral(Number(data.totals.total || 0));
        } else if (casetasMap) {
          const sumTotal = Object.values(casetasMap).reduce((acc, obj) => {
            return acc + (Number(obj?.total) || (Number(obj?.internos || 0) + Number(obj?.externos || 0) + Number(obj?.prestadores || 0) + Number(obj?.visitas || 0)));
          }, 0);
          setTotalGeneral(sumTotal);
          setGlobalTotals({ total: sumTotal });
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
    const cleanCaseta = canonicalCasetaName(newCaseta);
    setCaseta(cleanCaseta);
    setShowParkingModal(false);
    localStorage.setItem('selectedCaseta', cleanCaseta);
    localStorage.setItem('regas_cdi_last_caseta', cleanCaseta);
    localStorage.setItem('caseta_seleccionada_cic', cleanCaseta);
    window.postMessage({ type: 'cdi_caseta_changed', caseta: cleanCaseta }, '*');
    // Notificar al monitor del operador del cambio de caseta inmediatamente
    updateDeviceCaseta(cleanCaseta).catch(() => {});
    sendDeviceHeartbeat(cleanCaseta);
  };

  const activeParkingSchema = getParkingSchema(caseta);
  const currentParkingKey = normCaseta(String(caseta || '').replace(' // Call Center', ''));
  const currentParkingRecord = parkingByCaseta[currentParkingKey] || null;
  const isParkingCapturedToday = isCasetaRecordComplete(activeParkingSchema, currentParkingRecord);
  const isParkingLockedToday = Boolean(parkingReportSentToday);
  const currentParkingAvailableSum = getCasetaAvailableSum(activeParkingSchema, currentParkingRecord);

  // Totales globales de disponibilidad de estacionamiento para el Resumen
  let totalParkingAvailableGlobal = 0;
  let totalParkingCapturedCasetas = 0;
  let totalParkingOccupiedAutos = 0;
  PARKING_ORDER.forEach((pKey) => {
    const sch = PARKING_SCHEMAS[pKey];
    const rec = parkingByCaseta[pKey];
    if (isCasetaRecordComplete(sch, rec)) {
      totalParkingCapturedCasetas += 1;
      const avail = getCasetaAvailableSum(sch, rec);
      totalParkingAvailableGlobal += avail;
      // Cálculo de ingresos (autos) ocupados según fórmula de Power Automate (Domínguez = 40 en fórmula PA)
      sch.sections.forEach((sec) => {
        sec.fields.forEach((f) => {
          const cap = f.key === 'anexo_dominguez_ordinarios' ? 40 : f.total;
          const val = Number(rec.valores[f.key] || 0);
          totalParkingOccupiedAutos += Math.max(0, cap - val);
        });
      });
    }
  });

  const isParkingFormComplete = activeParkingSchema
    ? activeParkingSchema.sections.every((sec) =>
        sec.fields.every((f) => {
          const raw = parkingFormValues[f.key];
          if (raw === undefined || raw === null || String(raw).trim() === '') return false;
          const num = parseInt(String(raw).trim(), 10);
          return !Number.isNaN(num) && num >= 0;
        })
      )
    : false;

  const openParkingModal = () => {
    if (!activeParkingSchema) return;
    sounds.click();
    triggerHaptic(25);
    const initialVals = {};
    activeParkingSchema.sections.forEach((sec) => {
      sec.fields.forEach((f) => {
        const savedVal = currentParkingRecord?.valores?.[f.key];
        const hasValidSaved =
          isParkingCapturedToday &&
          savedVal !== undefined &&
          savedVal !== null &&
          String(savedVal).trim() !== '';
        // Por defecto "" cuando nunca se ha llenado para diferenciarlo de un 0 explícito
        initialVals[f.key] = hasValidSaved ? String(savedVal) : '';
      });
    });
    setParkingFormValues(initialVals);
    setShowParkingModal(true);
  };

  const handleParkingFieldChange = (fieldKey, rawVal, maxTotal) => {
    if (isParkingLockedToday) return;
    const cleaned = String(rawVal).replace(/[^0-9]/g, '');
    if (cleaned === '') {
      setParkingFormValues((prev) => ({ ...prev, [fieldKey]: '' }));
      return;
    }
    let num = parseInt(cleaned, 10);
    if (Number.isNaN(num) || num < 0) num = 0;
    if (typeof maxTotal === 'number' && num > maxTotal) {
      num = maxTotal;
    }
    setParkingFormValues((prev) => ({
      ...prev,
      [fieldKey]: String(num)
    }));
  };

  const handleParkingFieldStep = (fieldKey, delta, maxTotal) => {
    if (isParkingLockedToday) return;
    sounds.click();
    triggerHaptic(20);
    setParkingFormValues((prev) => {
      const rawPrev = prev[fieldKey];
      const isEmpty = rawPrev === undefined || rawPrev === null || String(rawPrev).trim() === '';
      let nextNum;
      if (isEmpty) {
        nextNum = delta > 0 ? delta : 0;
      } else {
        const currentNum = parseInt(String(rawPrev), 10) || 0;
        nextNum = Math.max(0, currentNum + delta);
      }
      if (typeof maxTotal === 'number' && nextNum > maxTotal) {
        nextNum = maxTotal;
      }
      return {
        ...prev,
        [fieldKey]: String(nextNum)
      };
    });
  };

  const handleSaveParking = async (e) => {
    if (e) e.preventDefault();
    if (!activeParkingSchema || isParkingLockedToday || savingParking || !isParkingFormComplete) return;

    const numericValues = {};
    activeParkingSchema.sections.forEach((sec) => {
      sec.fields.forEach((f) => {
        const parsed = parseInt(String(parkingFormValues[f.key]).trim(), 10);
        const safeVal = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
        numericValues[f.key] = typeof f.total === 'number' ? Math.min(f.total, safeVal) : safeVal;
      });
    });

    const todayIso = getTodayDateIso();
    const horaRegistro = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const newRecord = {
      caseta: activeParkingSchema.caseta,
      fecha: todayIso,
      horaCorte: '10:00 AM',
      horaRegistro,
      captured: true,
      capturedAt: new Date().toISOString(),
      valores: numericValues
    };

    setSavingParking(true);
    try {
      // Guardar localmente primero para respuesta instantánea
      setParkingByCaseta((prev) => {
        const next = { ...prev, [currentParkingKey]: newRecord };
        saveLocalParkingMap(todayIso, next);
        return next;
      });

      const res = await saveCdiEstacionamiento(caseta, numericValues, todayIso);
      if (res && res.cdi && res.cdi.estacionamiento) {
        mergeRemoteParking(res.cdi.estacionamiento);
      }
      if (res && (res.estacionamientoDispatched === true || res.alreadyDispatched === true || res.cdi?.estacionamientoDispatched === true)) {
        updateParkingReportSent(true);
      }
      sounds.success();
      triggerHaptic(40);
      setShowParkingModal(false);
    } catch (err) {
      console.warn('[CDI Estacionamiento] Guardado localmente (sin conexión inmediata al servidor):', err);
      sounds.success();
      setShowParkingModal(false);
    } finally {
      setSavingParking(false);
    }
  };

  const handleClearParking = async () => {
    if (!activeParkingSchema || isParkingLockedToday || savingParking) return;
    sounds.click();
    triggerHaptic(30);

    // 1. Vaciar todos los campos del formulario a ""
    const emptyVals = {};
    activeParkingSchema.sections.forEach((sec) => {
      sec.fields.forEach((f) => {
        emptyVals[f.key] = '';
      });
    });
    setParkingFormValues(emptyVals);

    // 2. Eliminar registro capturado de esta caseta localmente y en el servidor
    const todayIso = getTodayDateIso();
    setParkingByCaseta((prev) => {
      const next = { ...prev };
      delete next[currentParkingKey];
      saveLocalParkingMap(todayIso, next);
      return next;
    });

    try {
      const res = await clearCdiEstacionamiento(caseta, todayIso);
      if (res && res.cdi && res.cdi.estacionamiento) {
        mergeRemoteParking(res.cdi.estacionamiento);
      }
    } catch (err) {
      console.warn('[CDI Estacionamiento] Borrado local:', err);
    }
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
            setAllCasetasData(res.cdi.casetas);
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
              setGlobalTotals(res.cdi.totals);
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

  // Listado unificado de todas las casetas conocidas
  const seenNorms = new Set();
  const allKnownCasetas = [];
  [...CASETAS, ...Object.keys(allCasetasData || {})].filter(Boolean).forEach((c) => {
    const canonical = canonicalCasetaName(c);
    const n = normCaseta(canonical);
    if (!seenNorms.has(n)) {
      seenNorms.add(n);
      allKnownCasetas.push(canonical);
    }
  });

  return (
    <div className="cdi-container">
      {/* VISTA RESUMEN EN TIEMPO REAL DE TODAS LAS CASETAS + RESUMEN DE DISPONIBILIDAD DE ESTACIONAMIENTO */}
      {showSummaryView ? (
        <div className="cdi-all-casetas-view" role="region" aria-label="Resumen de todas las casetas">
          {/* BARRA SUPERIOR COMPACTA */}
          <div className="compact-summary-top">
            <button
              type="button"
              className="compact-back-btn"
              onClick={() => {
                sounds.click();
                setShowSummaryView(false);
              }}
              title="Volver al CDI"
              aria-label="Volver al CDI"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Volver</span>
            </button>
            <h2 className="compact-top-title">Resumen General CDI</h2>
            <div className="compact-live-tag">
              <span className="compact-live-dot"></span>
              <span>EN VIVO</span>
            </div>
          </div>

          {/* CONTENEDOR SCROLLABLE: 1) ACORDEÓN COLAPSADO DE TOTAL DE INGRESOS + 2) ACORDEÓN COLAPSADO DE TOTAL DE CAJONES */}
          <div className="compact-casetas-list">
            {/* 1. SECCIÓN COLAPSABLE: TOTAL DE INGRESOS */}
            <div className={`summary-accordion-card ${ingresosExpanded ? 'is-expanded' : 'is-collapsed'}`}>
              <button
                type="button"
                className="compact-total-strip summary-accordion-trigger"
                onClick={() => {
                  sounds.click();
                  setIngresosExpanded((prev) => !prev);
                }}
                aria-expanded={ingresosExpanded}
              >
                <div className="strip-total-main">
                  <span className="strip-total-lbl">TOTAL DE INGRESOS:</span>
                  <span className="strip-total-num">{totalGeneral}</span>
                </div>
                <div className="strip-breakdown">
                  <span className="strip-chip" title="Internos">
                    👤 <strong>{globalTotals.internos || 0}</strong>
                  </span>
                  <span className="strip-chip" title="Externos">
                    🏢 <strong>{globalTotals.externos || 0}</strong>
                  </span>
                  <span className="strip-chip" title="Prestadores">
                    🔧 <strong>{globalTotals.prestadores || 0}</strong>
                  </span>
                  <span className="strip-chip" title="Visitas">
                    📋 <strong>{globalTotals.visitas || 0}</strong>
                  </span>
                  <span className={`accordion-chevron ${ingresosExpanded ? 'open' : ''}`} aria-hidden="true">▾</span>
                </div>
              </button>

              {ingresosExpanded && (
                <div className="summary-accordion-body">
                  {allKnownCasetas.map((cName) => {
                    const cData = findCasetaCounts(allCasetasData, cName) || { internos: 0, externos: 0, prestadores: 0, visitas: 0 };
                    const cTotal = Number(cData.total || (Number(cData.internos || 0) + Number(cData.externos || 0) + Number(cData.prestadores || 0) + Number(cData.visitas || 0)));
                    const isSelected = normCaseta(cName) === normCaseta(caseta);

                    return (
                      <div
                        key={cName}
                        className={`compact-caseta-row ${isSelected ? 'is-active' : ''}`}
                        onClick={() => {
                          sounds.click();
                          handleCasetaChange(cName);
                          setShowSummaryView(false);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            sounds.click();
                            handleCasetaChange(cName);
                            setShowSummaryView(false);
                          }
                        }}
                        title={`Seleccionar ${cName} para operar en CDI`}
                      >
                        <div className="row-left">
                          <span className="row-caseta-name">{cName}</span>
                          {isSelected && (
                            <span className="row-active-tag">Activa</span>
                          )}
                        </div>

                        <div className="row-metrics">
                          <span className="row-metric" title="Internos">
                            <span className="metric-ico">👤</span>{cData.internos || 0}
                          </span>
                          <span className="row-metric" title="Externos">
                            <span className="metric-ico">🏢</span>{cData.externos || 0}
                          </span>
                          <span className="row-metric" title="Prestadores">
                            <span className="metric-ico">🔧</span>{cData.prestadores || 0}
                          </span>
                          <span className="row-metric" title="Visitas">
                            <span className="metric-ico">📋</span>{cData.visitas || 0}
                          </span>
                        </div>

                        <div className="row-right">
                          <span className="row-total-val">{cTotal}</span>
                          <span className="row-arrow">›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. SECCIÓN COLAPSABLE: TOTAL DE CAJONES (DISPONIBILIDAD DE ESTACIONAMIENTO) */}
            <div className={`parking-summary-section summary-accordion-card ${cajonesExpanded ? 'is-expanded' : 'is-collapsed'}`}>
              <button
                type="button"
                className="parking-summary-header-strip summary-accordion-trigger"
                onClick={() => {
                  sounds.click();
                  setCajonesExpanded((prev) => !prev);
                }}
                aria-expanded={cajonesExpanded}
              >
                <div className="parking-summary-title-box">
                  <span className="parking-summary-ico">🅿️</span>
                  <div style={{ textAlign: 'left' }}>
                    <h3 className="parking-summary-title">Total de Cajones (Disponibilidad)</h3>
                    <span className="parking-summary-sub">
                      Corte 10:00 AM • {totalParkingCapturedCasetas}/6 casetas • Ingresos (Autos): {totalParkingOccupiedAutos}
                    </span>
                  </div>
                </div>
                <div className="parking-summary-right-group">
                  <div className="parking-summary-global-pill">
                    <span className="parking-global-lbl">DISPONIBLES</span>
                    <span className="parking-global-val">
                      {totalParkingAvailableGlobal} <small>/ {TOTAL_PARKING_CAPACITY_ALL}</small>
                    </span>
                  </div>
                  <span className={`accordion-chevron ${cajonesExpanded ? 'open' : ''}`} aria-hidden="true">▾</span>
                </div>
              </button>

              {cajonesExpanded && (
                <div className="parking-summary-cards-list summary-accordion-body">
                  {PARKING_ORDER.map((pKey) => {
                    const sch = PARKING_SCHEMAS[pKey];
                    const rec = parkingByCaseta[pKey];
                    const isCap = isCasetaRecordComplete(sch, rec);
                    const availSum = getCasetaAvailableSum(sch, rec);
                    const allFields = sch.sections.flatMap((s) => s.fields);

                    return (
                      <div
                        key={pKey}
                        className={`parking-summary-caseta-card ${isCap ? 'is-captured' : 'is-pending'}`}
                        onClick={() => {
                          sounds.click();
                          handleCasetaChange(sch.caseta);
                          setShowSummaryView(false);
                        }}
                        role="button"
                        tabIndex={0}
                        title={`Ir a ${sch.caseta}`}
                      >
                        <div className="parking-summary-card-top">
                          <div className="parking-summary-caseta-name">
                            <span>{sch.icon}</span>
                            <strong>{sch.caseta}</strong>
                            <span className={`parking-summary-status ${isCap ? 'st-ok' : 'st-wait'}`}>
                              {isCap ? `✓ ${rec.horaRegistro || '10:00 AM'}` : '⏰ Pendiente 10:00 AM'}
                            </span>
                          </div>
                          <div className="parking-summary-caseta-total">
                            <strong>{isCap ? availSum : '—'}</strong>
                            <span>/ {sch.totalCapacity} cajones</span>
                          </div>
                        </div>

                        <div className="parking-summary-chips-row">
                          {allFields.map((f) => {
                            const fVal = isCap ? (rec?.valores?.[f.key] ?? 0) : '—';
                            return (
                              <span key={f.key} className="parking-summary-lot-chip" title={f.subtitle}>
                                <span className="lot-chip-lbl">{f.shortLabel}:</span>
                                <strong className="lot-chip-val">{fVal}</strong>
                                <span className="lot-chip-max">/{f.total}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 1. HEADER CARD (SUPERIOR) */}
          <header className="cdi-header-card">
            <div className="cdi-top-bar">
              <div className="cdi-brand-group">
                <span className={`cdi-badge-dot ${syncing ? 'syncing' : ''}`} />
                <h1 className="cdi-app-title">CDI Móvil</h1>
                <span className="cdi-live-badge">{lastSyncMsg}</span>
              </div>

              <div className="cdi-top-actions">
                {/* SELECTOR DE MODO CLARO / OSCURO — solo cuando el encabezado global no lo gestiona */}
                {onIdentifyDevice && (
                  <button
                    type="button"
                    className={`miniapps-id-btn ${isIdentifying ? 'active' : ''}`}
                    onClick={onIdentifyDevice}
                    title="Identificar este dispositivo en RegAs 3 (Actividades > CDI)"
                  >
                    <span>ID</span>
                  </button>
                )}
                {onToggleTheme && (
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
                    <span className="theme-btn-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>{theme === 'light' ? '☀️' : '🌙'}</span>
                  </button>
                )}

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
                  {!CASETAS.some(c => normCaseta(c) === normCaseta(caseta)) && (
                    <option value={canonicalCasetaName(caseta)}>{canonicalCasetaName(caseta)}</option>
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

            {/* 3B. BOTÓN DE DISPONIBILIDAD DE ESTACIONAMIENTO (EXCLUSIVO PARA MICHELENA, IMPULSO, EDISON, SIMÓN BOLÍVAR, CARRANZA Y UNIVERSIDAD — CORTE 10:00 AM) */}
            {activeParkingSchema && (
              <button
                type="button"
                className={`cdi-parking-btn ${isParkingCapturedToday ? 'is-captured' : 'is-pending'}`}
                onClick={openParkingModal}
                title="Disponibilidad de estacionamiento (Editable hasta que se envíe el reporte 10:00 AM)"
              >
                <div className="parking-btn-left">
                  <span className="parking-btn-icon">🅿️</span>
                  <div className="parking-btn-texts">
                    <span className="parking-btn-label">Disponibilidad de estacionamiento</span>
                    <span className="parking-btn-sub">
                      {isParkingLockedToday
                        ? `🔒 Reporte enviado hoy • Disponibles: ${currentParkingAvailableSum} / ${activeParkingSchema.totalCapacity}`
                        : isParkingCapturedToday
                        ? `Disponibles: ${currentParkingAvailableSum} / ${activeParkingSchema.totalCapacity} (${currentParkingRecord?.horaRegistro || '10:00 AM'}) • Toca para editar antes del envío`
                        : `Capacidad: ${activeParkingSchema.totalCapacity} cajones • Se llena a las 10:00 AM`}
                    </span>
                  </div>
                </div>
                <span className={`parking-btn-badge ${isParkingCapturedToday ? 'badge-done' : 'badge-pending'}`}>
                  {isParkingLockedToday
                    ? `🔒 ${currentParkingAvailableSum}/${activeParkingSchema.totalCapacity}`
                    : isParkingCapturedToday
                    ? `✎ ${currentParkingAvailableSum}/${activeParkingSchema.totalCapacity}`
                    : '⏰ 10:00 AM'}
                </span>
              </button>
            )}

            {/* 4. DOCK QUE MUESTRA EL RESUMEN: CONTEO POR CASETA Y CONTEO GENERAL (CLICABLE) */}
            <section
              className="cdi-bottom-summary is-clickable"
              aria-label="Resumen de Conteos"
              onClick={() => {
                sounds.click();
                setIngresosExpanded(false);
                setCajonesExpanded(false);
                setShowSummaryView(true);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  sounds.click();
                  setIngresosExpanded(false);
                  setCajonesExpanded(false);
                  setShowSummaryView(true);
                }
              }}
              title="Resumen de Conteos y Disponibilidad de Estacionamiento"
            >
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

          {/* MODAL DE DISPONIBILIDAD DE ESTACIONAMIENTO (CORTE 10:00 AM) */}
          {showParkingModal && activeParkingSchema && (
            <div
              className="cdi-parking-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowParkingModal(false);
              }}
            >
              <div className="cdi-parking-modal-card" role="dialog" aria-modal="true" aria-label="Disponibilidad de estacionamiento">
                <div className="parking-modal-header">
                  <div className="parking-modal-title-group">
                    <span className="parking-modal-icon">🅿️</span>
                    <div>
                      <h3 className="parking-modal-title">Disponibilidad de estacionamiento</h3>
                      <p className="parking-modal-subtitle">
                        Caseta {activeParkingSchema.caseta} ({activeParkingSchema.totalCapacity} cajones totales) • Corte 10:00 AM
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="parking-modal-close"
                    onClick={() => setShowParkingModal(false)}
                    aria-label="Cerrar"
                  >
                    ✕
                  </button>
                </div>

                <div className="parking-modal-notice">
                  {isParkingLockedToday ? (
                    <div className="parking-notice-box notice-captured">
                      <span>🔒</span>
                      <span>
                        <strong>Reporte 10:00 AM ya enviado hoy.</strong> Los datos quedaron bloqueados hasta el siguiente día. Disponibles: <strong>{currentParkingAvailableSum} / {activeParkingSchema.totalCapacity}</strong> cajones.
                      </span>
                    </div>
                  ) : isParkingCapturedToday ? (
                    <div className="parking-notice-box notice-captured">
                      <span>✎</span>
                      <span>
                        <strong>Datos capturados hoy ({currentParkingRecord?.horaRegistro || '10:00 AM'}).</strong> El reporte aún no se ha enviado, por lo que puedes editar y actualizar los valores.
                      </span>
                    </div>
                  ) : (
                    <div className="parking-notice-box notice-pending">
                      <span>⏰</span>
                      <span>
                        <strong>Este dato se llena a las 10:00 AM.</strong> Podrás editarlo mientras aún no se haya enviado el reporte general; una vez enviado se bloquea hasta mañana.
                      </span>
                    </div>
                  )}
                </div>

                <form className="parking-modal-body" onSubmit={handleSaveParking}>
                  {activeParkingSchema.sections.map((sec) => (
                    <div key={sec.title} className="parking-section-card">
                      <div className="parking-section-header">
                        <span>{sec.icon}</span>
                        <span>{sec.title}</span>
                      </div>
                      <div className="parking-fields-grid">
                        {sec.fields.map((field) => {
                          const valStr = parkingFormValues[field.key] ?? '';
                          return (
                            <div key={field.key} className="parking-field-item">
                              <div className="parking-field-label-row">
                                <label className="parking-field-label" htmlFor={`park_${field.key}`}>
                                  {field.label} disponibles
                                </label>
                                <span className="parking-field-capacity-badge" title={field.subtitle}>
                                  Total: {field.total}
                                </span>
                              </div>
                              {isParkingLockedToday ? (
                                <div className="parking-field-readonly">
                                  <span>{currentParkingRecord?.valores?.[field.key] ?? 0}</span>
                                  <small className="readonly-max">/ {field.total}</small>
                                </div>
                              ) : (
                                <div className="parking-stepper-control">
                                  <button
                                    type="button"
                                    className="parking-step-btn"
                                    onClick={() => handleParkingFieldStep(field.key, -1, field.total)}
                                    aria-label={`Restar 1 a ${field.label}`}
                                  >
                                    −
                                  </button>
                                  <input
                                    id={`park_${field.key}`}
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max={field.total}
                                    placeholder="Sin capturar (mín. 0)"
                                    required
                                    className="parking-field-input"
                                    value={valStr}
                                    onChange={(e) => handleParkingFieldChange(field.key, e.target.value, field.total)}
                                    onFocus={(e) => e.target.select()}
                                  />
                                  <button
                                    type="button"
                                    className="parking-step-btn"
                                    onClick={() => handleParkingFieldStep(field.key, 1, field.total)}
                                    aria-label={`Sumar 1 a ${field.label}`}
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="parking-modal-footer">
                    {isParkingLockedToday ? (
                      <button
                        type="button"
                        className="parking-btn-secondary"
                        onClick={() => setShowParkingModal(false)}
                      >
                        Cerrar consulta (Bloqueado hasta mañana)
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="parking-btn-cancel"
                          onClick={() => setShowParkingModal(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="parking-btn-clear"
                          onClick={handleClearParking}
                          disabled={savingParking}
                          title="Borrar valores capturados"
                        >
                          Borrar
                        </button>
                        <button
                          type="submit"
                          className="parking-btn-submit"
                          disabled={savingParking || !isParkingFormComplete}
                          title={!isParkingFormComplete ? 'Capture todos los campos (mínimo 0) para guardar' : (isParkingCapturedToday ? 'Actualizar' : 'Guardar')}
                        >
                          {savingParking
                            ? 'Guardando...'
                            : isParkingCapturedToday
                            ? 'Actualizar'
                            : 'Guardar'}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
