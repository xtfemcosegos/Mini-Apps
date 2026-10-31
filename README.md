# CIC OS 3 - Mini Apps Suite 📱

Suite unificada de micro-aplicaciones táctiles operativas y móviles para guardias de seguridad, casetas de acceso y andenes del Centro de Información y Control (CIC OS 3).

## 🚀 Aplicaciones Integradas

1. **Checador Facial IA (`/?app=checador` | `checador-movil.html`)**:
   - Detección facial inteligente en tiempo real con óvalo HUD.
   - Cotejo biométrico con umbral $\ge 80\%$ de similitud contra el padrón de fotos en UBE.
   - Validación automática de turno activo en la fecha actual.
   - Teclado numérico táctil de respaldo para ingreso manual por número de socio.

2. **CDI - Conteo Dinámico de Ingresos (`/?app=cdi` | `cdi-movil.html`)**:
   - Tablero táctil ultra-rápido para andén y aforo de personas.
   - 4 categorías: Internos, Externos, Prestadores y Visitas.
   - Modos sumar (+) y restar (-), retroalimentación sonora sintetizada y cola FIFO offline tolerante a fallas de red.

3. **Recorridos y Rondines GPS (`/?app=recorridos` | `recorrido-movil.html`)**:
   - Odómetro y rastreo satelital GPS en tiempo real.
   - Verificación secuencial de puntos de control (checkpoints).
   - Cronómetro de recorrido y sincronización automática de incidencias a UBE.

4. **Bitácora Móvil de Novedades (`/?app=bitacora` | `bitacora-movil.html`)**:
   - Formatos operativos estandarizados para Casetas y CCO.
   - Checklist de condiciones del puesto y captura ágil de novedades y consignas.

---

## 🛠️ Tecnologías y Arquitectura

- **Frontend:** React 18 + Vite (SPA) con Dock flotante en glassmorphism.
- **Backend Core:** UBE (Universal Backend Engine) en puerto `:7001` con NeDB y Canvas IA.
- **Servidor LAN / Reverse Proxy:** Node.js en puerto `:7006` con soporte ESM (`server.js`) y CJS (`server.cjs`).
- **Nube & Hosting:** Firebase Hosting (`cic-os-miniapps.web.app`) + Firebase Analytics.

---

## 🌐 Despliegue y Ejecución

### Modo Local (LAN / Casetas)
```bash
# Iniciar servidor proxy local
node server.js
# Acceso en navegador: http://localhost:7006/
```

### Desarrollo con Vite
```bash
npm install
npm run dev
# Puerto de desarrollo: http://localhost:7006/
```

### Compilación y Despliegue a Firebase Hosting
```bash
npm run build
firebase deploy --only hosting --project cic-os-miniapps
# URL pública: https://cic-os-miniapps.web.app
```
