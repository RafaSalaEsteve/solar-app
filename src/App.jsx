import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, Zap, Settings, LayoutGrid, CheckCircle, AlertTriangle, Info, 
  Save, RotateCcw, ChevronDown, ChevronUp, MapPin, Compass, 
  Calendar, Download, Menu, X, Calculator, PieChart, Cable, Activity, 
  Battery, BatteryCharging, CloudRain, DollarSign, TrendingUp, Layers, 
  MoveHorizontal, Clock, ShieldCheck, BarChart3, Printer 
} from 'lucide-react';

// ==========================================
// UTILIDADES MATEMÁTICAS (GLOBALES)
// ==========================================
const toRad = deg => deg * (Math.PI / 180);
const toDeg = rad => rad * (180 / Math.PI);
const getDeclination = dayOfYear => 23.45 * Math.sin(toRad(360 * (284 + dayOfYear) / 365));

const calculateSolarPos = (latitude, declination, hourAngle) => {
  const latRad = toRad(latitude);
  const decRad = toRad(declination);
  const haRad = toRad(hourAngle);
  
  const sinElev = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  let elev = toDeg(Math.asin(sinElev));
  
  let cosAz = (Math.sin(decRad) - Math.sin(toRad(elev)) * Math.sin(latRad)) / (Math.cos(toRad(elev)) * Math.cos(latRad));
  cosAz = Math.max(-1, Math.min(1, cosAz)); // Clamping por seguridad
  
  let az = toDeg(Math.acos(cosAz));
  // Corrección cuadrante azimut
  let displayAz = Math.sin(haRad) >= 0 ? 180 + az : 180 - az;
  
  return { elev, azim: displayAz };
};

// ==========================================
// COMPONENTES DE UI COMPARTIDOS
// ==========================================

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

const InputGroup = ({ label, value, onChange, unit, step = "0.1", type = "number", helpText }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
      {label}
      {helpText && <span className="text-slate-300 hover:text-slate-500 cursor-help" title={helpText}><Info size={12} /></span>}
    </label>
    <div className="relative">
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all text-slate-800 font-medium bg-slate-50 focus:bg-white"
      />
      {unit && <span className="absolute right-3 top-2 text-slate-400 text-sm">{unit}</span>}
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, color = "text-slate-800" }) => (
  <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
    <Icon className={color} size={20} />
    <h2 className="text-lg font-bold text-slate-800">{title}</h2>
  </div>
);

// ==========================================
// HERRAMIENTAS (MÓDULOS)
// ==========================================

// --- 1. DIMENSIONAMIENTO ---
function SizingTool() {
  const DEFAULT_PANEL = { model: "Panel Estándar 450W", pmax: 450, voc: 49.5, isc: 11.6, vmp: 41.5, imp: 10.85, coefVoc: -0.28 };
  const DEFAULT_INVERTER = { model: "Inversor Híbrido 5kW", pmaxOutput: 5000, maxDcVoltage: 550, minMppt: 120, maxMppt: 450, maxCurrent: 14, numMppts: 2 };
  const DEFAULT_SETTINGS = { minTemp: -5, maxTemp: 70, targetPower: 4000, maxPanelsAvailable: 16 };

  const [activeTab, setActiveTab] = useState('input');
  const [panel, setPanel] = useState(DEFAULT_PANEL);
  const [inverter, setInverter] = useState(DEFAULT_INVERTER);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [results, setResults] = useState(null);

  const calculateConfigurations = () => {
    const configs = [];
    const vocMax = panel.voc * (1 + (settings.minTemp - 25) * (panel.coefVoc / 100));
    const vmpMin = panel.vmp * (1 + (settings.maxTemp - 25) * (-0.4 / 100));
    const maxPanelsPerStringVoltage = Math.floor(inverter.maxDcVoltage / vocMax);
    const minPanelsPerStringVoltage = Math.ceil(inverter.minMppt / vmpMin);
    const maxPanelsTotal = Math.min(settings.maxPanelsAvailable, Math.floor((inverter.pmaxOutput * 1.3) / panel.pmax));

    for (let totalPanels = 1; totalPanels <= maxPanelsTotal; totalPanels++) {
      if (totalPanels <= maxPanelsPerStringVoltage && totalPanels >= minPanelsPerStringVoltage) {
        const currentCheck = panel.isc < inverter.maxCurrent;
        configs.push({
          id: `1s-${totalPanels}`, type: 'single', panelsTotal: totalPanels, strings: [totalPanels],
          power: totalPanels * panel.pmax, vocString: (totalPanels * vocMax).toFixed(1),
          valid: currentCheck, warnings: !currentCheck ? ['Corriente excede límite'] : [],
          score: Math.abs((totalPanels * panel.pmax) - settings.targetPower)
        });
      }
      if (inverter.numMppts >= 2 && totalPanels >= (minPanelsPerStringVoltage * 2)) {
        for (let s1 = minPanelsPerStringVoltage; s1 <= maxPanelsPerStringVoltage; s1++) {
          let s2 = totalPanels - s1;
          if (s2 >= minPanelsPerStringVoltage && s2 <= maxPanelsPerStringVoltage) {
             configs.push({
              id: `2s-${s1}-${s2}`, type: 'dual', panelsTotal: totalPanels, strings: [s1, s2],
              power: totalPanels * panel.pmax, vocString: `MPPT1: ${(s1 * vocMax).toFixed(0)}V, MPPT2: ${(s2 * vocMax).toFixed(0)}V`,
              valid: true, warnings: [], score: Math.abs((totalPanels * panel.pmax) - settings.targetPower)
            });
          }
        }
      }
    }
    configs.sort((a, b) => a.score - b.score);
    const uniqueConfigs = configs.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
    setResults({ calcData: { vocMax, vmpMin, maxPanelsPerStringVoltage, minPanelsPerStringVoltage }, configs: uniqueConfigs.slice(0, 10) });
    setActiveTab('results');
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button onClick={() => setActiveTab('input')} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'input' ? 'border-yellow-400 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>1. Configuración</button>
        <button onClick={() => { if(results) setActiveTab('results'); }} disabled={!results} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'results' ? 'border-yellow-400 text-slate-900' : 'border-transparent text-slate-400 cursor-not-allowed'}`}>2. Resultados</button>
      </div>

      {activeTab === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 border-t-4 border-t-yellow-400">
              <SectionTitle icon={LayoutGrid} title="Panel Solar" color="text-yellow-600" />
              <InputGroup label="Modelo" type="text" value={panel.model} onChange={(v) => setPanel({...panel, model: v})} />
              <div className="grid grid-cols-2 gap-3">
                <InputGroup label="Potencia (W)" value={panel.pmax} onChange={(v) => setPanel({...panel, pmax: v})} />
                <InputGroup label="Voc (V)" value={panel.voc} onChange={(v) => setPanel({...panel, voc: v})} />
                <InputGroup label="Isc (A)" value={panel.isc} onChange={(v) => setPanel({...panel, isc: v})} />
                <InputGroup label="Vmp (V)" value={panel.vmp} onChange={(v) => setPanel({...panel, vmp: v})} />
                <InputGroup label="Coef. Voc (%/C)" value={panel.coefVoc} step="0.01" onChange={(v) => setPanel({...panel, coefVoc: v})} />
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle icon={Settings} title="Condiciones" />
              <div className="grid grid-cols-2 gap-3">
                <InputGroup label="Temp Min (ºC)" value={settings.minTemp} onChange={(v) => setSettings({...settings, minTemp: v})} />
                <InputGroup label="Temp Max (ºC)" value={settings.maxTemp} onChange={(v) => setSettings({...settings, maxTemp: v})} />
              </div>
              <InputGroup label="Espacio (Paneles)" value={settings.maxPanelsAvailable} onChange={(v) => setSettings({...settings, maxPanelsAvailable: v})} />
              <InputGroup label="Potencia Objetivo" value={settings.targetPower} step="100" onChange={(v) => setSettings({...settings, targetPower: v})} />
            </Card>
          </div>
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 border-t-4 border-t-blue-500">
              <SectionTitle icon={Zap} title="Inversor" color="text-blue-600" />
              <InputGroup label="Modelo" type="text" value={inverter.model} onChange={(v) => setInverter({...inverter, model: v})} />
              <InputGroup label="Salida Max AC (W)" value={inverter.pmaxOutput} step="100" onChange={(v) => setInverter({...inverter, pmaxOutput: v})} />
              <div className="my-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Entrada DC (MPPT)</p>
                <div className="grid grid-cols-2 gap-3">
                  <InputGroup label="Max Voltaje DC" value={inverter.maxDcVoltage} onChange={(v) => setInverter({...inverter, maxDcVoltage: v})} />
                  <InputGroup label="Max Corriente" value={inverter.maxCurrent} onChange={(v) => setInverter({...inverter, maxCurrent: v})} />
                  <InputGroup label="Min MPPT" value={inverter.minMppt} onChange={(v) => setInverter({...inverter, minMppt: v})} />
                  <InputGroup label="Max MPPT" value={inverter.maxMppt} onChange={(v) => setInverter({...inverter, maxMppt: v})} />
                  <InputGroup label="Num MPPTs" value={inverter.numMppts} step="1" onChange={(v) => setInverter({...inverter, numMppts: v})} />
                </div>
              </div>
            </Card>
          </div>
          <div className="lg:col-span-4 flex flex-col justify-center">
            <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
              <h3 className="text-xl font-bold mb-4">Resumen</h3>
              <ul className="text-sm space-y-3 mb-6 text-slate-300">
                <li className="flex justify-between border-b border-slate-700 pb-2"><span>Panel</span> <b className="text-white">{panel.pmax} W</b></li>
                <li className="flex justify-between border-b border-slate-700 pb-2"><span>Inversor</span> <b className="text-white">{inverter.pmaxOutput} W</b></li>
                <li className="flex justify-between"><span>Objetivo</span> <b className="text-white">{settings.targetPower} W</b></li>
              </ul>
              <button onClick={calculateConfigurations} className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold py-4 px-6 rounded-xl shadow-lg transition flex items-center justify-center gap-2">
                <Calculator /> Calcular Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'results' && results && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-3 text-center bg-slate-50 border-none">
              <span className="text-xs text-slate-400 font-bold uppercase">Voc Max (-{settings.minTemp}ºC)</span>
              <p className={`text-xl font-bold ${results.calcData.vocMax > inverter.maxDcVoltage ? 'text-red-500' : 'text-green-600'}`}>{results.calcData.vocMax.toFixed(1)} V</p>
            </Card>
            <Card className="p-3 text-center bg-slate-50 border-none">
              <span className="text-xs text-slate-400 font-bold uppercase">Max Paneles Serie</span>
              <p className="text-xl font-bold text-blue-600">{results.calcData.maxPanelsPerStringVoltage}</p>
            </Card>
             <Card className="p-3 text-center bg-slate-50 border-none">
              <span className="text-xs text-slate-400 font-bold uppercase">Min Paneles Serie</span>
              <p className="text-xl font-bold text-blue-600">{results.calcData.minPanelsPerStringVoltage}</p>
            </Card>
             <Card className="p-3 text-center bg-slate-50 border-none">
              <span className="text-xs text-slate-400 font-bold uppercase">Corriente Panel</span>
              <p className={`text-xl font-bold ${panel.isc > inverter.maxCurrent ? 'text-red-500' : 'text-green-600'}`}>{panel.isc} A</p>
            </Card>
          </div>

          <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><CheckCircle className="text-green-500" /> Resultados Optimizados</h3>
          
          {results.configs.length === 0 ? (
            <div className="bg-red-50 text-red-600 p-6 rounded-xl text-center border border-red-100 flex flex-col items-center">
              <AlertTriangle size={32} className="mb-2" />
              <p className="font-bold">No hay configuraciones válidas</p>
              <p className="text-sm">Revisa los voltajes máximos y mínimos del inversor.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {results.configs.map((config, idx) => (
                <div key={config.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:border-yellow-400 transition relative overflow-hidden group">
                  {idx === 0 && <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg">TOP 1</div>}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                       <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${config.type==='single' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {config.type === 'single' ? '1 MPPT' : '2 MPPTs'}
                        </span>
                        <h4 className="font-bold text-slate-800">{config.panelsTotal} Paneles ({config.power} W)</h4>
                       </div>
                       <div className="flex gap-2 text-xs text-slate-500">
                         {config.strings.map((s,i) => <span key={i} className="bg-slate-100 px-1.5 py-0.5 rounded border">String {i+1}: <b>{s}</b></span>)}
                       </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>Voc: {config.vocString} V</p>
                      <p>Ratio DC/AC: <span className={(config.power/inverter.pmaxOutput)>1.3 ? 'text-orange-500' : 'text-green-600'}>{((config.power/inverter.pmaxOutput)*100).toFixed(0)}%</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setActiveTab('input')} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 mt-4 flex justify-center gap-1"><ChevronUp size={16}/> Editar Datos</button>
        </div>
      )}
    </div>
  );
}

// --- 2. LOCATION TOOL ---
function LocationTool() {
  const [lat, setLat] = useState(40.41);
  const [lon, setLon] = useState(-3.70);
  const [results, setResults] = useState(null);
  const [liveData, setLiveData] = useState({ elev: 0, azim: 0, time: '' });
  const canvasRef = useRef(null);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        setLat(parseFloat(position.coords.latitude.toFixed(4)));
        setLon(parseFloat(position.coords.longitude.toFixed(4)));
      }, () => alert("Geolocalización no permitida"));
    }
  };

  const calculateTilt = () => {
    const absLat = Math.abs(lat);
    
    // MODO PROFESIONAL EXCLUSIVAMENTE
    const year = absLat < 10 ? absLat : absLat * 0.87;
    const winter = absLat + 15;
    const summer = absLat - 15;

    const maxElevS = 90 - (absLat - 23.45);
    const maxElevW = 90 - (absLat + 23.45);
    const maxElevE = 90 - absLat;

    setResults({
      winter: Math.min(90, Math.max(0, winter)).toFixed(1),
      summer: Math.min(90, Math.max(0, summer)).toFixed(1),
      year: year.toFixed(1),
      table: {
        s: { elev: maxElevS.toFixed(1), angle: (90 - maxElevS).toFixed(1) },
        w: { elev: maxElevW.toFixed(1), angle: (90 - maxElevW).toFixed(1) },
        e: { elev: maxElevE.toFixed(1), angle: (90 - maxElevE).toFixed(1) }
      }
    });
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w/2, cy = h/2, r = w * 0.45;

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,w,h);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for(let i=0; i<=90; i+=10) {
      ctx.beginPath();
      let rad = r * (1 - i/90);
      ctx.arc(cx, cy, rad, 0, Math.PI*2);
      ctx.stroke();
    }
    for(let a=0; a<360; a+=15) {
      ctx.beginPath();
      let rad = toRad(a - 90);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r*Math.cos(rad), cy + r*Math.sin(rad));
      ctx.stroke();
    }

    ctx.fillStyle = "#1e293b"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", cx, cy - r - 25); ctx.fillText("S", cx, cy + r + 25);
    ctx.fillText("E", cx + r + 25, cy); ctx.fillText("O", cx - r - 25, cy);

    const dates = [{d: 172, c: "#f59e0b"}, {d: 80, c: "#10b981"}, {d: 355, c: "#3b82f6"}];
    dates.forEach(date => {
      const dec = getDeclination(date.d);
      ctx.beginPath();
      ctx.strokeStyle = date.c;
      ctx.lineWidth = 3;
      let points = [];
      for(let hr=-180; hr<=180; hr+=2) {
        let p = calculateSolarPos(lat, dec, hr);
        if(p.elev > 0) {
          let rad = r * (1 - p.elev/90);
          let angle = toRad(p.azim - 90);
          points.push({x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle)});
        }
      }
      if(points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
    });

  }, [lat]); 

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const diff = now - start;
      const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hour = now.getHours() + now.getMinutes()/60;
      const solarHourAngle = (hour - 12) * 15; 
      const dec = getDeclination(dayOfYear);
      const pos = calculateSolarPos(lat, dec, solarHourAngle);
      setLiveData({
        elev: pos.elev.toFixed(1),
        azim: pos.azim.toFixed(1),
        time: now.toLocaleTimeString()
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lat]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-500">
      <div className="lg:col-span-4 space-y-4">
        <Card className="p-5">
           <SectionTitle icon={MapPin} title="Ubicación" />
           <InputGroup label="Latitud" value={lat} onChange={setLat} />
           <InputGroup label="Longitud" value={lon} onChange={setLon} />
           <div className="flex gap-2 mt-4">
             <button onClick={getUserLocation} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded text-xs transition flex items-center justify-center gap-2"><MapPin size={14}/> GPS</button>
             <button onClick={calculateTilt} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded text-xs transition flex items-center justify-center gap-2"><Calculator size={14}/> Calcular</button>
           </div>
           <div className="mt-4 p-3 bg-blue-50 text-blue-900 rounded-lg text-xs">
             <p className="font-bold flex items-center gap-1 mb-1"><Info size={12}/> Modo Profesional Activo</p>
             <p className="opacity-80">Se utilizan exclusivamente algoritmos de ingeniería (Método Lewis y optimización de radiación anual).</p>
           </div>
        </Card>

        <div className="bg-slate-800 text-white rounded-xl shadow-lg p-5 border border-slate-700">
           <div className="flex justify-between items-center mb-4">
             <span className="text-xs font-bold text-blue-400 uppercase flex items-center gap-2"><Compass size={14}/> Tiempo Real</span>
             <span className="font-mono text-xs text-slate-400">{liveData.time}</span>
           </div>
           <div className="grid grid-cols-2 gap-4 text-center">
             <div><div className="text-xs text-slate-500">Elevación</div><div className="text-xl font-mono text-yellow-400 font-bold">{liveData.elev}°</div></div>
             <div><div className="text-xs text-slate-500">Azimut</div><div className="text-xl font-mono text-yellow-400 font-bold">{liveData.azim}°</div></div>
           </div>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        <Card className="p-1 min-h-[400px] flex flex-col items-center justify-center bg-white">
           <div className="w-full flex justify-between p-4 border-b border-slate-50">
             <h3 className="font-bold text-slate-700 flex items-center gap-2"><PieChart size={18} className="text-blue-500"/> Carta Estereográfica</h3>
             <button className="text-xs bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded border border-slate-200 flex items-center gap-1" onClick={() => {
                const link = document.createElement('a');
                link.download = 'chart.png';
                link.href = canvasRef.current.toDataURL();
                link.click();
             }}><Download size={12}/> PNG</button>
           </div>
           <div className="p-4 w-full flex justify-center">
              <canvas ref={canvasRef} width={600} height={600} className="max-w-full h-auto max-h-[400px]" />
           </div>
        </Card>

        {results && (
          <div className="animate-in slide-in-from-bottom-4">
            <h3 className="font-bold text-lg mb-4 text-slate-800">Inclinación Óptima</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
               <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                 <div className="text-xs font-bold text-blue-600 uppercase mb-1">Invierno</div>
                 <div className="text-3xl font-bold text-slate-800 mb-2">{results.winter}°</div>
                 <p className="text-xs text-slate-500 leading-snug">Maximiza captación con sol bajo (Dic). Prioritario para aislada.</p>
               </div>
               <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm">
                 <div className="text-xs font-bold text-green-600 uppercase mb-1">Anual</div>
                 <div className="text-3xl font-bold text-slate-800 mb-2">{results.year}°</div>
                 <p className="text-xs text-slate-500 leading-snug">Equilibrio geométrico para máxima producción total anual.</p>
               </div>
               <div className="bg-white p-4 rounded-xl border-l-4 border-orange-500 shadow-sm">
                 <div className="text-xs font-bold text-orange-600 uppercase mb-1">Verano</div>
                 <div className="text-3xl font-bold text-slate-800 mb-2">{results.summer}°</div>
                 <p className="text-xs text-slate-500 leading-snug">Posición casi plana para sol cenital (Junio). Uso estival.</p>
               </div>
            </div>
            
            <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50"><h4 className="font-bold text-slate-700 text-sm">Análisis de Elevación Solar (Cenit)</h4></div>
               <table className="w-full text-sm text-left text-slate-600">
                 <thead className="bg-slate-100 text-xs uppercase text-slate-700">
                   <tr>
                     <th className="px-4 py-3">Evento</th>
                     <th className="px-4 py-3">Elevación Max</th>
                     <th className="px-4 py-3">Ángulo 90°</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   <tr className="bg-white"><td className="px-4 py-3 font-medium">Verano</td><td className="px-4 py-3 text-blue-600">{results.table.s.elev}°</td><td className="px-4 py-3 font-bold">{results.table.s.angle}°</td></tr>
                   <tr className="bg-white"><td className="px-4 py-3 font-medium">Equinoccio</td><td className="px-4 py-3 text-blue-600">{results.table.e.elev}°</td><td className="px-4 py-3 font-bold">{results.table.e.angle}°</td></tr>
                   <tr className="bg-white"><td className="px-4 py-3 font-medium">Invierno</td><td className="px-4 py-3 text-blue-600">{results.table.w.elev}°</td><td className="px-4 py-3 font-bold">{results.table.w.angle}°</td></tr>
                 </tbody>
               </table>
               <div className="p-3 bg-slate-50 text-[10px] text-slate-400 italic text-center">* Nota: El ángulo perpendicular es el óptimo geométrico puro sin correcciones por atmósfera.</div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 3. WIRING TOOL (Diseño Mejorado) ---
function WiringTool() {
  const [power, setPower] = useState(3000); // Watts
  const [voltage, setVoltage] = useState(230); // Volts
  const [length, setLength] = useState(20); // Meters
  const [material, setMaterial] = useState('cu'); // 'cu' | 'al'
  const [maxDropPercent, setMaxDropPercent] = useState(1.5); // 1.5% o 3%
  const [result, setResult] = useState(null);

  const calculateCable = () => {
    const conductivity = material === 'cu' ? 56 : 35;
    const intensity = power / voltage;
    const maxDropVolts = voltage * (maxDropPercent / 100);
    const requiredSection = (2 * length * intensity) / (conductivity * maxDropVolts);

    const standardSections = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];
    let selectedSection = standardSections.find(s => s >= requiredSection);
    if(!selectedSection) selectedSection = standardSections[standardSections.length-1];

    const actualDropVolts = (2 * length * intensity) / (conductivity * selectedSection);
    const actualDropPercent = (actualDropVolts / voltage) * 100;

    setResult({
      intensity,
      requiredSection,
      selectedSection,
      actualDropVolts,
      actualDropPercent
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <div className="space-y-4">
        <Card className="p-5">
          <SectionTitle icon={Settings} title="Parámetros del Circuito" />
          <InputGroup label="Potencia (W)" value={power} onChange={setPower} step="100" />
          <InputGroup label="Voltaje (V)" value={voltage} onChange={setVoltage} step="1" helpText="230V AC o String DC" />
          <InputGroup label="Longitud Cable (m)" value={length} onChange={setLength} step="1" helpText="Distancia ida" />
          
          <div className="mb-3">
             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Material Conductor</label>
             <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setMaterial('cu')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${material === 'cu' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}>Cobre</button>
                <button onClick={() => setMaterial('al')} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${material === 'al' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Aluminio</button>
             </div>
          </div>

          <div className="mb-3">
             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Máx Caída Tensión (%)</label>
             <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                <button onClick={() => setMaxDropPercent(1.5)} className={`flex-1 py-2 text-xs font-bold rounded transition ${maxDropPercent === 1.5 ? 'bg-white text-green-600 shadow-sm ring-1 ring-green-100' : 'text-slate-500'}`}>1.5%</button>
                <button onClick={() => setMaxDropPercent(3)} className={`flex-1 py-2 text-xs font-bold rounded transition ${maxDropPercent === 3 ? 'bg-white text-orange-500 shadow-sm ring-1 ring-orange-100' : 'text-slate-500'}`}>3.0%</button>
                 <button onClick={() => setMaxDropPercent(5)} className={`flex-1 py-2 text-xs font-bold rounded transition ${maxDropPercent === 5 ? 'bg-white text-red-500 shadow-sm ring-1 ring-red-100' : 'text-slate-500'}`}>5.0%</button>
             </div>

             <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 className="font-bold text-xs text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <Info size={14} className="text-blue-500"/> Normativa Vigente
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-2 opacity-10 text-orange-600"><Sun size={32}/></div>
                    <p className="font-bold text-orange-800 text-xs mb-2 flex items-center gap-1">
                      CC: Paneles <span className="text-orange-400">→</span> Inversor
                    </p>
                    <ul className="text-[10px] text-orange-700 space-y-1.5 leading-tight relative z-10">
                      <li>• <strong>REBT:</strong> No define valor explícito.</li>
                      <li>• <strong>IDAE:</strong> Recomienda 1.5% – 3%.</li>
                      <li className="mt-2 pt-2 border-t border-orange-200 font-bold flex items-center gap-1 text-orange-900">
                        <CheckCircle size={10} /> Diseño óptimo: ≤ 1.5%
                      </li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-2 opacity-10 text-blue-600"><Zap size={32}/></div>
                    <p className="font-bold text-blue-800 text-xs mb-2 flex items-center gap-1">
                      CA: Inversor <span className="text-blue-400">→</span> Red
                    </p>
                    <ul className="text-[10px] text-blue-700 space-y-1.5 leading-tight relative z-10">
                      <li>• <strong>ITC-BT-40:</strong> Generadores.</li>
                      <li>• Obligatorio legalizar.</li>
                      <li className="mt-2 pt-2 border-t border-blue-200 font-bold flex items-center gap-1 text-blue-900">
                        <AlertTriangle size={10} /> Máximo Oficial: 1.5%
                      </li>
                    </ul>
                  </div>
                </div>
             </div>
          </div>

          <button onClick={calculateCable} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <Calculator size={18} /> Calcular Sección
          </button>
        </Card>
      </div>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             <Card className="p-6 border-l-4 border-yellow-400">
               <div className="flex items-center gap-3 mb-2">
                 <Cable className="text-slate-700" size={32} />
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase">Sección Recomendada</h3>
                   <div className="text-4xl font-bold text-slate-800">{result.selectedSection} mm²</div>
                 </div>
               </div>
               <p className="text-xs text-slate-400">Sección comercial inmediata ({result.requiredSection.toFixed(2)} mm²)</p>
             </Card>

             <div className="grid grid-cols-2 gap-4">
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Intensidad</span>
                 <p className="text-xl font-bold text-blue-600">{result.intensity.toFixed(2)} A</p>
               </Card>
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Caída Real</span>
                 <p className={`text-xl font-bold ${result.actualDropPercent > maxDropPercent ? 'text-red-500' : 'text-green-600'}`}>
                   {result.actualDropPercent.toFixed(2)}%
                 </p>
                 <span className="text-xs text-slate-400">({result.actualDropVolts.toFixed(2)} V)</span>
               </Card>
             </div>
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <Activity size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Introduce potencia y distancia para calcular la sección del cable.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// --- 4. BATTERY TOOL (Restaurado 3 botones) ---
function BatteryTool() {
  const [consumption, setConsumption] = useState(3000); // Wh/day
  const [autonomy, setAutonomy] = useState(1); // days
  const [voltage, setVoltage] = useState(48); // V
  const [dod, setDod] = useState(90); // % Depth of Discharge
  const [result, setResult] = useState(null);

  const calculateBatteries = () => {
    // Total Energía Necesaria Bruta
    const totalEnergy = consumption * autonomy;
    // Capacidad Real (considerando DoD) en Wh
    const capacityWh = totalEnergy / (dod / 100);
    // Capacidad en Ah
    const capacityAh = capacityWh / voltage;

    setResult({ totalEnergy, capacityWh, capacityAh });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <div className="space-y-4">
        <Card className="p-5">
          <SectionTitle icon={BatteryCharging} title="Dimensionamiento Banco Baterías" />
          <InputGroup label="Consumo Diario (Wh)" value={consumption} onChange={setConsumption} step="100" />
          <InputGroup label="Días de Autonomía" value={autonomy} onChange={setAutonomy} step="0.5" helpText="Días sin sol que el sistema debe aguantar" />
          <InputGroup label="Voltaje Sistema (V)" value={voltage} onChange={setVoltage} step="12" helpText="Voltaje del banco (12, 24, 48V)" />
          
          <div className="mb-3">
             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tecnología / Profundidad Descarga (DoD)</label>
             <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <button onClick={() => setDod(50)} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition ${dod === 50 ? 'bg-white border-blue-500 text-blue-700 shadow-sm' : 'border-transparent hover:bg-slate-100 text-slate-600'}`}>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${dod === 50 ? 'border-blue-500' : 'border-slate-300'}`}>
                    {dod === 50 && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold">Plomo-Ácido / GEL / AGM</div>
                    <div className="text-[10px] opacity-75">DoD recomendado: 50% (Vida útil moderada)</div>
                  </div>
                </button>

                <button onClick={() => setDod(70)} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition ${dod === 70 ? 'bg-white border-blue-500 text-blue-700 shadow-sm' : 'border-transparent hover:bg-slate-100 text-slate-600'}`}>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${dod === 70 ? 'border-blue-500' : 'border-slate-300'}`}>
                    {dod === 70 && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold">Plomo-Carbono / Estacionarias OPzS</div>
                    <div className="text-[10px] opacity-75">DoD recomendado: 70% (Ciclo profundo)</div>
                  </div>
                </button>

                <button onClick={() => setDod(90)} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition ${dod === 90 ? 'bg-white border-green-500 text-green-700 shadow-sm' : 'border-transparent hover:bg-slate-100 text-slate-600'}`}>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${dod === 90 ? 'border-green-500' : 'border-slate-300'}`}>
                    {dod === 90 && <div className="w-2 h-2 rounded-full bg-green-500" />}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold">Litio (LiFePO4)</div>
                    <div className="text-[10px] opacity-75">DoD recomendado: 90% (Alta eficiencia)</div>
                  </div>
                </button>
             </div>
          </div>

          <button onClick={calculateBatteries} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <Calculator size={18} /> Calcular Banco
          </button>
        </Card>
      </div>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             <Card className="p-6 border-l-4 border-purple-500 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 text-purple-900"><Battery size={100} /></div>
               <div className="flex items-center gap-3 mb-2 relative z-10">
                 <Battery className="text-purple-600" size={32} />
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase">Capacidad Total ({voltage}V)</h3>
                   <div className="text-4xl font-bold text-slate-800">{Math.ceil(result.capacityAh)} Ah</div>
                 </div>
               </div>
               <p className="text-xs text-slate-400 relative z-10">Capacidad útil nominal necesaria para el banco completo.</p>
             </Card>

             <div className="grid grid-cols-2 gap-4">
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><CloudRain size={12}/> Reserva Energética</span>
                 <p className="text-xl font-bold text-blue-600">{(result.totalEnergy / 1000).toFixed(1)} kWh</p>
                 <span className="text-xs text-slate-400">Consumo x {autonomy} días</span>
               </Card>
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Battery size={12}/> Capacidad Bruta</span>
                 <p className="text-xl font-bold text-slate-700">{(result.capacityWh / 1000).toFixed(1)} kWh</p>
                 <span className="text-xs text-slate-400">Incluyendo margen DoD {dod}%</span>
               </Card>
             </div>
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <BatteryCharging size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Define consumo y autonomía para dimensionar el almacenamiento.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// --- 5. FINANCIAL TOOL ---
function FinancialTool() {
  const [systemCost, setSystemCost] = useState(5000); // €
  const [energyPrice, setEnergyPrice] = useState(0.20); // €/kWh (compra)
  const [annualGen, setAnnualGen] = useState(6000); // kWh/año
  const [selfCons, setSelfCons] = useState(70); // %
  const [surplusPrice, setSurplusPrice] = useState(0.08); // €/kWh (venta excedentes)
  const [result, setResult] = useState(null);

  const calculateROI = () => {
    // Ahorro directo: Energía que dejo de comprar
    const savingsDirect = annualGen * (selfCons / 100) * energyPrice;
    
    // Ganancia por excedentes: Energía que inyecto a la red
    const earningsSurplus = annualGen * ((100 - selfCons) / 100) * surplusPrice;
    
    const totalAnnualBenefit = savingsDirect + earningsSurplus;
    const paybackYears = systemCost / totalAnnualBenefit;
    
    const savings25Years = (totalAnnualBenefit * 25) - systemCost;

    setResult({ totalAnnualBenefit, paybackYears, savings25Years });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <Card className="p-5">
        <SectionTitle icon={DollarSign} title="Datos Económicos" />
        <InputGroup label="Coste Instalación (€)" value={systemCost} onChange={setSystemCost} step="100" />
        <InputGroup label="Producción Anual (kWh)" value={annualGen} onChange={setAnnualGen} step="100" helpText="Dato estimado de generación anual" />
        <InputGroup label="Precio Energía Red (€/kWh)" value={energyPrice} onChange={setEnergyPrice} step="0.01" />
        <InputGroup label="Precio Excedentes (€/kWh)" value={surplusPrice} onChange={setSurplusPrice} step="0.01" />
        <div className="mt-4">
           <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Autoconsumo: {selfCons}%</label>
           <input type="range" min="0" max="100" value={selfCons} onChange={(e) => setSelfCons(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
           <div className="flex justify-between text-[10px] text-slate-400 mt-1">
             <span>0% (Todo Venta)</span>
             <span>100% (Todo Consumo)</span>
           </div>
        </div>
        <button onClick={calculateROI} className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <TrendingUp size={18} /> Calcular Rentabilidad
        </button>
      </Card>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             <Card className="p-6 border-l-4 border-green-500">
               <div className="flex items-center gap-3 mb-2">
                 <TrendingUp className="text-green-600" size={32} />
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase">Payback (Retorno)</h3>
                   <div className="text-4xl font-bold text-slate-800">{result.paybackYears.toFixed(1)} Años</div>
                 </div>
               </div>
               <p className="text-xs text-slate-400">Tiempo estimado para recuperar la inversión inicial.</p>
             </Card>

             <div className="grid grid-cols-2 gap-4">
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Ahorro Anual</span>
                 <p className="text-xl font-bold text-slate-700">{result.totalAnnualBenefit.toFixed(0)} €</p>
               </Card>
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Beneficio 25 Años</span>
                 <p className="text-xl font-bold text-green-600">+{result.savings25Years.toFixed(0)} €</p>
                 <span className="text-xs text-slate-400">(Neto tras inversión)</span>
               </Card>
             </div>
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <DollarSign size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Introduce costes y producción para calcular el retorno.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// --- 6. SHADOW TOOL ---
function ShadowTool() {
  const [lat, setLat] = useState(40.41);
  const [panelLen, setPanelLen] = useState(2.0); // Metros de alto del panel
  const [tilt, setTilt] = useState(30); // Grados inclinación
  const [panelAzimuth, setPanelAzimuth] = useState(0); // 0=Sur, -90=Este, 90=Oeste
  const [designTime, setDesignTime] = useState(10); // Hora solar crítica (ej: 10:00 AM)
  const [result, setResult] = useState(null);

  const calculateSpacing = () => {
    // 1. Datos Geométricos Panel
    const h_proj = panelLen * Math.sin(toRad(tilt)); // Altura vertical

    // 2. Calcular Posición Solar el 21 DIC (Día 355) a la hora de diseño
    const hourAngle = (designTime - 12) * 15;
    const declination = getDeclination(355); // Solsticio Invierno

    const sunPos = calculateSolarPos(lat, declination, hourAngle);
    
    // Si el sol no ha salido, error
    if (sunPos.elev <= 0) {
      alert("El sol no está sobre el horizonte a esa hora en invierno.");
      return;
    }

    // 3. Longitud de la Sombra Proyectada
    const shadowLen = h_proj / Math.tan(toRad(sunPos.elev));

    // 4. Proyección ortogonal sobre el eje Norte-Sur del array
    const panelAzimSystem = 180 + panelAzimuth; 
    const azimDiff = toRad(sunPos.azim - panelAzimSystem);
    
    const d = Math.abs(shadowLen * Math.cos(azimDiff));

    setResult({ h_proj, sunPos, d, shadowLen });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <Card className="p-5">
        <SectionTitle icon={Layers} title="Geometría y Ventana Solar" />
        <InputGroup label="Latitud (º)" value={lat} onChange={setLat} />
        <div className="grid grid-cols-2 gap-3">
            <InputGroup label="Largo Panel (m)" value={panelLen} onChange={setPanelLen} />
            <InputGroup label="Inclinación (º)" value={tilt} onChange={setTilt} step="1" />
        </div>
        
        <div className="my-4 pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3">Orientación y Hora Crítica</label>
            <InputGroup label="Azimut Panel (º)" value={panelAzimuth} onChange={setPanelAzimuth} step="5" helpText="0º = Sur, -90º = Este, 90º = Oeste" />
            <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                    Hora Diseño (Invierno) <Clock size={12}/>
                </label>
                <div className="flex items-center gap-2">
                    <input type="range" min="8" max="16" step="1" value={designTime} onChange={(e) => setDesignTime(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500" />
                    <span className="text-sm font-mono font-bold bg-slate-100 px-2 py-1 rounded">{designTime}:00</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Recomendado: 10:00 AM (Asegura 4h de sol: 10h-14h)</p>
            </div>
        </div>
        
        <button onClick={calculateSpacing} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <MoveHorizontal size={18} /> Calcular Distancia
        </button>
      </Card>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             <Card className="p-6 border-l-4 border-orange-400">
               <div className="flex items-center gap-3 mb-2">
                 <MoveHorizontal className="text-orange-500" size={32} />
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase">Distancia Mínima (d)</h3>
                   <div className="text-4xl font-bold text-slate-800">{result.d.toFixed(2)} m</div>
                 </div>
               </div>
               <p className="text-xs text-slate-400">Separación libre entre filas para asegurar sol a las {designTime}:00 del 21 Dic.</p>
             </Card>

             <div className="grid grid-cols-2 gap-4">
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Datos Solares</span>
                 <p className="text-sm text-slate-700">Elevación: <b>{result.sunPos.elev.toFixed(1)}º</b></p>
                 <p className="text-sm text-slate-700">Azimut: <b>{result.sunPos.azim.toFixed(0)}º</b></p>
               </Card>
               <Card className="p-4 bg-slate-50 border-none">
                 <span className="text-xs font-bold text-slate-400 uppercase">Sombra Real</span>
                 <p className="text-xl font-bold text-slate-700">{result.shadowLen.toFixed(2)} m</p>
                 <span className="text-xs text-slate-400">(Longitud diagonal)</span>
               </Card>
             </div>
             
             <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800">
                 <p><strong>Nota Técnica:</strong> El cálculo asegura que a las {designTime}:00 del día más corto del año, la sombra cae justo al pie de la siguiente fila. Esto garantiza producción el 100% del resto del año en esa ventana horaria.</p>
             </div>
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <Layers size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Calcula la separación profesional considerando hora y orientación.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// --- 7. PROTECTION TOOL ---
function ProtectionTool() {
  const [iscPanel, setIscPanel] = useState(13.5); // Amperios
  const [stringsParallel, setStringsParallel] = useState(1); // Cantidad
  const [inverterPower, setInverterPower] = useState(5000); // W
  const [gridVoltage, setGridVoltage] = useState(230); // V
  const [phase, setPhase] = useState(1); // 1 = Mono, 3 = Tri
  const [result, setResult] = useState(null);

  const calculateProtections = () => {
    // 1. Fusible DC
    const minFuseDC = iscPanel * 1.25;
    const commercialFuses = [10, 12, 15, 20, 25, 30, 40];
    let selectedFuseDC = commercialFuses.find(f => f >= minFuseDC) || 0;

    // 2. Interruptor DC
    const switchDC = iscPanel * stringsParallel * 1.25;

    // 3. Magnetotérmico AC
    let iOutputAC = 0;
    if (phase === 1) {
      iOutputAC = inverterPower / gridVoltage;
    } else {
      iOutputAC = inverterPower / (400 * Math.sqrt(3)); 
    }

    const minBreakerAC = iOutputAC * 1.25; 
    const commercialBreakers = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    let selectedBreakerAC = commercialBreakers.find(b => b >= minBreakerAC);

    if (!selectedBreakerAC) selectedBreakerAC = ">125"; 

    setResult({
      minFuseDC,
      selectedFuseDC,
      switchDC,
      iOutputAC,
      minBreakerAC,
      selectedBreakerAC
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <Card className="p-5">
        <SectionTitle icon={ShieldCheck} title="Parámetros Eléctricos" />
        
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Lado DC (Paneles)</label>
          <InputGroup label="Isc Panel (A)" value={iscPanel} onChange={setIscPanel} />
          <InputGroup label="Strings en Paralelo" value={stringsParallel} onChange={setStringsParallel} step="1" />
        </div>

        <div className="mb-4 pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Lado AC (Inversor)</label>
          <InputGroup label="Potencia Inversor (W)" value={inverterPower} onChange={setInverterPower} step="100" />
          <InputGroup label="Voltaje Red (V)" value={gridVoltage} onChange={setGridVoltage} helpText="230V habitual" />
          
          <div className="mb-3">
             <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fases</label>
             <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setPhase(1)} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${phase === 1 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Monofásico (230V)</button>
                <button onClick={() => setPhase(3)} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${phase === 3 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Trifásico (400V)</button>
             </div>
          </div>
        </div>

        <button onClick={calculateProtections} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <ShieldCheck size={18} /> Calcular Protecciones
        </button>
      </Card>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             
             {/* DC RESULTS */}
             <Card className="p-0 border-l-4 border-yellow-400">
               <div className="p-4 bg-yellow-50 border-b border-yellow-100 flex justify-between items-center">
                 <h3 className="font-bold text-yellow-800 flex items-center gap-2"><Sun size={16}/> Protecciones DC</h3>
                 <span className="text-xs bg-white px-2 py-1 rounded text-yellow-600 font-bold border border-yellow-200">Por String</span>
               </div>
               <div className="p-4 grid grid-cols-2 gap-4">
                 <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Fusible (gPV)</span>
                    <p className="text-2xl font-bold text-slate-800">{result.selectedFuseDC} A</p>
                    <p className="text-xs text-slate-500">Mínimo calc: {result.minFuseDC.toFixed(1)} A</p>
                 </div>
                 <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Seccionador</span>
                    <p className="text-2xl font-bold text-slate-800">{result.switchDC.toFixed(1)} A</p>
                    <p className="text-xs text-slate-500">Capacidad corte</p>
                 </div>
               </div>
             </Card>

             {/* AC RESULTS */}
             <Card className="p-0 border-l-4 border-blue-500">
               <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                 <h3 className="font-bold text-blue-800 flex items-center gap-2"><Zap size={16}/> Protecciones AC</h3>
                 <span className="text-xs bg-white px-2 py-1 rounded text-blue-600 font-bold border border-blue-200">Salida Inversor</span>
               </div>
               <div className="p-4 grid grid-cols-2 gap-4">
                 <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Magnetotérmico</span>
                    <p className="text-2xl font-bold text-slate-800">{result.selectedBreakerAC} A</p>
                    <p className="text-xs text-slate-500">
                        {result.iOutputAC.toFixed(1)}A (Nominal) <br/>
                        {result.minBreakerAC.toFixed(1)}A (Con margen)
                    </p>
                 </div>
                 <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Diferencial</span>
                    <p className="text-lg font-bold text-slate-800">Clase A</p>
                    <p className="text-xs text-slate-500">30mA (Residencial)</p>
                 </div>
               </div>
             </Card>

           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <ShieldCheck size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Calcula fusibles y magnetotérmicos para tu instalación.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// --- 8. PRODUCTION TOOL ---
function ProductionTool() {
  const [power, setPower] = useState(5.0); // kWp
  const [zoneHsp, setZoneHsp] = useState(4.6); // HSP Average
  const [efficiency, setEfficiency] = useState(82); // PR % (0.82 típico)
  const [result, setResult] = useState(null);

  // Estimaciones HSP España (Fuente: PVGIS aprox media anual)
  const zones = [
    { label: "Zona 1 (Norte)", hsp: 3.6, desc: "Galicia, Cantabria, País Vasco" },
    { label: "Zona 2 (Centro-Norte)", hsp: 4.0, desc: "CyL, Cataluña, Aragón" },
    { label: "Zona 3 (Centro)", hsp: 4.6, desc: "Madrid, La Rioja, C. Valenciana" },
    { label: "Zona 4 (Sur)", hsp: 5.0, desc: "Extremadura, CLM, Murcia" },
    { label: "Zona 5 (Sur Extremo)", hsp: 5.4, desc: "Andalucía, Canarias" },
  ];

  const calculateProd = () => {
    // E = P * HSP * PR
    // Daily Avg kWh
    const dailyAvg = power * zoneHsp * (efficiency / 100);
    const monthlyAvg = dailyAvg * 30.41; // Promedio mensual
    const yearly = dailyAvg * 365;

    setResult({ dailyAvg, monthlyAvg, yearly });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      <Card className="p-5">
        <SectionTitle icon={BarChart3} title="Estimación Producción" />
        <InputGroup label="Potencia Pico (kWp)" value={power} onChange={setPower} step="0.1" helpText="Potencia total en paneles" />
        
        <div className="mb-4">
           <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Zona Climática (HSP)</label>
           <div className="space-y-2">
             {zones.map((z) => (
                <button 
                  key={z.label} 
                  onClick={() => setZoneHsp(z.hsp)}
                  className={`w-full flex justify-between items-center p-2 rounded-lg border text-left transition ${zoneHsp === z.hsp ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                >
                  <div>
                    <div className="text-xs font-bold">{z.label}</div>
                    <div className="text-[10px] opacity-75">{z.desc}</div>
                  </div>
                  <div className="text-sm font-mono font-bold">{z.hsp} h</div>
                </button>
             ))}
           </div>
        </div>

        <button onClick={calculateProd} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <BarChart3 size={18} /> Calcular Energía
        </button>
      </Card>

      <div className="space-y-4">
         {result ? (
           <div className="animate-in slide-in-from-right-4 space-y-4">
             <Card className="p-6 border-l-4 border-green-500 bg-gradient-to-br from-white to-green-50">
               <div className="flex items-center gap-3 mb-2">
                 <BarChart3 className="text-green-600" size={32} />
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase">Producción Anual</h3>
                   <div className="text-4xl font-bold text-slate-800">{Math.round(result.yearly).toLocaleString()} kWh</div>
                 </div>
               </div>
               <p className="text-xs text-slate-500">Energía total estimada entregada a la red/vivienda al año.</p>
             </Card>

             <div className="grid grid-cols-2 gap-4">
               <Card className="p-4 bg-white border border-slate-100">
                 <span className="text-xs font-bold text-slate-400 uppercase">Media Mensual</span>
                 <p className="text-xl font-bold text-slate-700">{Math.round(result.monthlyAvg)} kWh</p>
               </Card>
               <Card className="p-4 bg-white border border-slate-100">
                 <span className="text-xs font-bold text-slate-400 uppercase">Media Diaria</span>
                 <p className="text-xl font-bold text-blue-600">{result.dailyAvg.toFixed(1)} kWh</p>
               </Card>
             </div>

             <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800">
                 <p><strong>Tip:</strong> Usa el valor de "Producción Anual" en la herramienta de <strong>Rentabilidad</strong> para calcular tu ahorro real.</p>
             </div>
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
             <BarChart3 size={48} className="mb-4 opacity-20" />
             <p className="text-center text-sm">Calcula cuánta energía generará tu instalación según tu zona.</p>
           </div>
         )}
      </div>
    </div>
  );
}

// ==========================================
// APLICACIÓN PRINCIPAL (SHELL)
// ==========================================

function App() {
  const [view, setView] = useState('sizing'); 
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'sizing', icon: LayoutGrid, label: 'Dimensionamiento', desc: 'Strings e Inversores' },
    { id: 'location', icon: MapPin, label: 'Estudio Solar', desc: 'Ubicación e Inclinación' },
    { id: 'production', icon: BarChart3, label: 'Producción', desc: 'Estimación Energía (HSP)' },
    { id: 'wiring', icon: Cable, label: 'Cableado', desc: 'Sección y Caída Tensión' },
    { id: 'protection', icon: ShieldCheck, label: 'Protecciones', desc: 'Fusibles y Automáticos' },
    { id: 'battery', icon: Battery, label: 'Baterías', desc: 'Autonomía y Capacidad' },
    { id: 'financial', icon: DollarSign, label: 'Rentabilidad', desc: 'ROI y Payback' },
    { id: 'shadow', icon: Layers, label: 'Sombras', desc: 'Distancia entre Filas' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex print:bg-white">
      
      {/* Sidebar Desktop - Oculto al imprimir */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-white fixed h-full z-20 overflow-y-auto print:hidden">
        <div className="p-6 border-b border-slate-800">
           <div className="flex items-center gap-3">
             <div className="p-2 bg-yellow-400 rounded-lg text-slate-900"><Sun size={24} strokeWidth={2.5}/></div>
             <div>
               <h1 className="text-xl font-bold tracking-tight">SolarCalc</h1>
               <p className="text-slate-400 text-xs">Suite Profesional</p>
             </div>
           </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${view === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <item.icon size={20} /> <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        
        {/* Botón Imprimir */}
        <div className="p-4 border-t border-slate-800">
            <button 
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg transition text-sm"
            >
                <Printer size={16} /> Imprimir Informe
            </button>
        </div>

        <div className="p-4 text-xs text-slate-500 text-center">v3.3 Full Suite</div>
      </aside>

      {/* Mobile Header - Oculto al imprimir */}
      <div className="md:hidden fixed w-full bg-slate-900 text-white z-50 flex items-center justify-between p-4 shadow-lg print:hidden">
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-yellow-400 rounded text-slate-900"><Sun size={18}/></div>
           <span className="font-bold">SolarCalc Suite</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-300">
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900/95 z-40 pt-20 px-6 space-y-3 overflow-y-auto pb-10 print:hidden">
           {menuItems.map(item => (
             <button key={item.id} onClick={() => { setView(item.id); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl text-lg ${view === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 border border-slate-700'}`}>
              <item.icon /> {item.label}
            </button>
           ))}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto print:ml-0 print:p-0 print:pt-0">
        <header className="mb-8 flex justify-between items-center print:hidden">
           <div>
             <h2 className="text-2xl font-bold text-slate-800">
               {menuItems.find(i => i.id === view)?.label}
             </h2>
             <p className="text-slate-500 text-sm">
               {menuItems.find(i => i.id === view)?.desc}
             </p>
           </div>
        </header>
        
        {/* Header solo visible al imprimir */}
        <div className="hidden print:block mb-8 border-b pb-4">
            <h1 className="text-2xl font-bold text-slate-900">Informe Técnico - SolarCalc</h1>
            <p className="text-sm text-slate-500">Módulo: {menuItems.find(i => i.id === view)?.label} | Fecha: {new Date().toLocaleDateString()}</p>
        </div>

        {view === 'sizing' && <SizingTool />}
        {view === 'location' && <LocationTool />}
        {view === 'production' && <ProductionTool />}
        {view === 'wiring' && <WiringTool />}
        {view === 'protection' && <ProtectionTool />}
        {view === 'battery' && <BatteryTool />}
        {view === 'financial' && <FinancialTool />}
        {view === 'shadow' && <ShadowTool />}
      </main>

    </div>
  );
}

export default App;