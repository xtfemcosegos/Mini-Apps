import React, { useState } from 'react';
import './BitacoraApp.css';
import { saveBitacora, sounds } from '../../services/api';

export default function BitacoraApp({ theme, onToggleTheme }) {
  const [template, setTemplate] = useState('bitacora_casetas');
  const [saving, setSaving] = useState(false);

  // Formulario Bitácora Casetas
  const [formData, setFormData] = useState({
    caseta: 'Edison',
    correo_caseta: 'casedi@oxxo.com',
    fecha: new Date().toISOString().slice(0, 10),
    turno: 'Dia',
    accion: 'INICIO TURNO',
    novedades: '',
    firma_autoridad: 'NO',
    oficial_firma: '',
    elementos_turno: '',
    condiciones: {
      llaves: 'SI',
      portones: 'SI',
      area_limpia: 'SI',
      equipos: 'SI',
      dispositivos: 'SI'
    },
    equipos_consigna: '',
    gafetes_completos: 'Si',
    entrega_turno: ''
  });

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleConditionChange = (itemKey, val) => {
    sounds.click();
    setFormData((prev) => ({
      ...prev,
      condiciones: {
        ...prev.condiciones,
        [itemKey]: val
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    sounds.click();
    setSaving(true);

    try {
      const payload = {
        schemaId: template,
        title: template === 'bitacora_casetas' ? 'Bitácora Casetas' : 'Bitacora Centro de Control OS',
        data: formData,
        fecha: formData.fecha,
        caseta: formData.caseta,
        turno: formData.turno,
        createdAt: new Date().toISOString()
      };

      await saveBitacora(payload);
      sounds.success();
      alert('¡Bitácora guardada con éxito en UBE!');
      // Limpiar novedades
      setFormData((prev) => ({ ...prev, novedades: '', equipos_consigna: '' }));
    } catch (err) {
      sounds.warning();
      alert('Error al guardar bitácora: ' + (err.message || 'Error de red'));
    } finally {
      setSaving(false);
    }
  };

  const conditionLabels = [
    { key: 'llaves', label: 'Juego de llaves y accesos completos' },
    { key: 'portones', label: 'Portones funcionando al 100%' },
    { key: 'area_limpia', label: 'Área de trabajo limpia y ordenada' },
    { key: 'equipos', label: 'Equipos de trabajo funcionando' },
    { key: 'dispositivos', label: 'Dispositivos cargados (Radios / Celular)' }
  ];

  return (
    <div className="bitacora-container">
      {/* HEADER CARD */}
      <div className="bitacora-header-card">
        <div className="bitacora-top-row">
          <div className="bitacora-title-box">
            <span style={{ fontSize: '1.2rem' }}>📋</span>
            <h1 className="bitacora-title">Bitácora de Guardia</h1>
          </div>
          <button
            type="button"
            className="cdi-theme-btn"
            onClick={() => { sounds.click(); if (onToggleTheme) onToggleTheme(); }}
            title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
          >
            <span>{theme === 'light' ? '☀️' : '🌙'}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
          </button>
        </div>

        <select
          className="bitacora-template-selector"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          aria-label="Seleccionar Plantilla"
        >
          <option value="bitacora_casetas">Bitácora Casetas Operativa</option>
          <option value="bitacora_cco">Bitácora Centro de Control OS</option>
        </select>
      </div>

      {/* FORM SCROLL */}
      <form className="bitacora-form-scroll" onSubmit={handleSubmit}>
        <div className="form-group-card">
          <label className="field-label">Caseta y Turno</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
            <select
              className="field-select"
              value={formData.caseta}
              onChange={(e) => handleChange('caseta', e.target.value)}
            >
              <option value="Edison">Edison</option>
              <option value="Recepción Edison">Recepción Edison</option>
              <option value="Impulso">Impulso</option>
              <option value="Michelena">Michelena</option>
              <option value="Simón Bolívar // Call Center">Simón Bolívar</option>
            </select>

            <select
              className="field-select"
              value={formData.turno}
              onChange={(e) => handleChange('turno', e.target.value)}
            >
              <option value="Dia">Día</option>
              <option value="Tarde">Tarde</option>
              <option value="Noche">Noche</option>
            </select>
          </div>
        </div>

        <div className="form-group-card">
          <label className="field-label">Acción</label>
          <select
            className="field-select"
            value={formData.accion}
            onChange={(e) => handleChange('accion', e.target.value)}
          >
            <option value="INICIO TURNO">INICIO DE TURNO</option>
            <option value="FINALIZA TURNO">FINALIZA TURNO</option>
          </select>
        </div>

        <div className="form-group-card">
          <label className="field-label">Novedades Durante el Turno</label>
          <textarea
            className="field-textarea"
            placeholder="Escribe aquí las actividades, incidencias y novedades..."
            value={formData.novedades}
            onChange={(e) => handleChange('novedades', e.target.value)}
            required
          />
        </div>

        {/* CHECKLIST DE CONDICIONES GENERALES */}
        <div className="form-group-card">
          <label className="field-label">Condiciones Operativas</label>
          {conditionLabels.map((c) => (
            <div key={c.key} className="checklist-item">
              <span className="checklist-label">{c.label}</span>
              <div className="checklist-options">
                {['SI', 'NO', 'N/A'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`opt-pill ${formData.condiciones[c.key] === opt ? 'active' : ''}`}
                    onClick={() => handleConditionChange(c.key, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="form-group-card">
          <label className="field-label">Equipos en Consigna</label>
          <input
            type="text"
            className="field-input"
            placeholder="Radios, llaves u objetos en consigna..."
            value={formData.equipos_consigna}
            onChange={(e) => handleChange('equipos_consigna', e.target.value)}
          />
        </div>

        <button type="submit" className="btn-submit-bitacora" disabled={saving}>
          <span>💾</span>
          <span>{saving ? 'Guardando en UBE...' : 'GUARDAR BITÁCORA'}</span>
        </button>
      </form>
    </div>
  );
}
