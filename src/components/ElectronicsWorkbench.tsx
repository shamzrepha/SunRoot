'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Flame,
  Award,
  Sparkles,
  Info,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MOCK_LAB_CHALLENGES } from '@/lib/mockData';
import { getCognitiveTier } from '@/lib/bkt';

// Color codes for resistors: 0: Black, 1: Brown, 2: Red, 3: Orange, 4: Yellow, 5: Green, 6: Blue, 7: Violet, 8: Gray, 9: White
const DIGIT_COLORS: Record<number, string> = {
  0: '#171717', // black
  1: '#854d0e', // brown
  2: '#dc2626', // red
  3: '#ea580c', // orange
  4: '#eab308', // yellow
  5: '#16a34a', // green
  6: '#2563eb', // blue
  7: '#7c3aed', // violet
  8: '#6b7280', // gray
  9: '#ffffff', // white
};

export default function ElectronicsWorkbench() {
  const { recordBKTInteraction, studentProgress, currentUser } = useApp();

  // Workbench state
  const [voltageSource, setVoltageSource] = useState<number>(9); // 3V, 5V, 9V, 12V
  const [resistance, setResistance] = useState<number>(330); // in Ohms
  const [switchClosed, setSwitchClosed] = useState<boolean>(true);
  const [ledColor, setLedColor] = useState<'red' | 'green' | 'blue'>('red');
  const [activeChallengeIdx, setActiveChallengeIdx] = useState<number>(0);
  const [challengeStatus, setChallengeStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [failureMessage, setFailureMessage] = useState<string>('');

  const activeChallenge = MOCK_LAB_CHALLENGES[activeChallengeIdx];

  // LED physical specs
  const forwardVoltage = useMemo(() => {
    switch (ledColor) {
      case 'red': return 2.0;
      case 'green': return 2.2;
      case 'blue': return 3.1;
      default: return 2.0;
    }
  }, [ledColor]);

  const maxSafeCurrentMa = 30; // standard 5mm LED limit

  // Real-time Circuit Simulation calculation
  const simulation = useMemo(() => {
    if (!switchClosed) {
      return {
        isConduction: false,
        currentMa: 0,
        voltageAcrossResistor: 0,
        voltageAcrossLed: 0,
        state: 'off',
        powerMw: 0,
      };
    }

    if (voltageSource < forwardVoltage) {
      return {
        isConduction: false,
        currentMa: 0,
        voltageAcrossResistor: 0,
        voltageAcrossLed: voltageSource,
        state: 'insufficient_voltage',
        powerMw: 0,
      };
    }

    const vResistor = voltageSource - forwardVoltage;
    // Ohm's law: I = V / R
    const currentAmps = vResistor / Math.max(1, resistance);
    const currentMa = Number((currentAmps * 1000).toFixed(2));
    const powerMw = Number(((currentAmps * currentAmps * resistance) * 1000).toFixed(1));

    let state: 'optimal' | 'bright' | 'dim' | 'burnt_out' = 'optimal';
    if (currentMa > maxSafeCurrentMa) {
      state = 'burnt_out';
    } else if (currentMa > 25) {
      state = 'bright';
    } else if (currentMa < 12) {
      state = 'dim';
    } else {
      state = 'optimal';
    }

    return {
      isConduction: true,
      currentMa,
      voltageAcrossResistor: Number(vResistor.toFixed(2)),
      voltageAcrossLed: forwardVoltage,
      state,
      powerMw,
    };
  }, [switchClosed, voltageSource, forwardVoltage, resistance]);

  // Resistor color band calculation (e.g. 330 = Orange (3), Orange (3), Brown (x10^1))
  const colorBands = useMemo(() => {
    const r = Math.round(resistance);
    if (r < 10) return ['#dc2626', '#171717', '#171717'];
    const rStr = r.toString();
    const d1 = parseInt(rStr[0], 10);
    const d2 = parseInt(rStr[1] || '0', 10);
    const multiplier = rStr.length - 2;
    return [
      DIGIT_COLORS[d1] || '#854d0e',
      DIGIT_COLORS[d2] || '#171717',
      DIGIT_COLORS[Math.min(9, Math.max(0, multiplier))] || '#854d0e',
    ];
  }, [resistance]);

  // Current BKT mastery for LED protection
  const userMastery = studentProgress[currentUser.id]?.masteryByKC['kc-led-resistors'];
  const pL = userMastery?.probabilityMastery ?? 0.2;
  const cognitiveTier = getCognitiveTier(pL);

  const testChallengeCircuit = () => {
    if (!activeChallenge) return;

    if (!switchClosed) {
      setChallengeStatus('failed');
      setFailureMessage('The circuit switch is open. Close the switch to energize the circuit.');
      recordBKTInteraction(activeChallenge.kcId, false, 'simulation_lab', 10, 'Open circuit switch');
      return;
    }

    if (voltageSource !== activeChallenge.sourceVoltage) {
      setChallengeStatus('failed');
      setFailureMessage(`Challenge requires a ${activeChallenge.sourceVoltage}V battery. Current source is ${voltageSource}V.`);
      recordBKTInteraction(activeChallenge.kcId, false, 'simulation_lab', 10, 'Wrong source voltage selected');
      return;
    }

    if (simulation.state === 'burnt_out') {
      setChallengeStatus('failed');
      setFailureMessage(`Diode Junction Meltdown! Current reached ${simulation.currentMa} mA (exceeded ${maxSafeCurrentMa} mA limit). Increase resistance to protect the LED.`);
      recordBKTInteraction(activeChallenge.kcId, false, 'simulation_lab', 20, 'LED burned out');
      return;
    }

    if (simulation.currentMa < activeChallenge.targetCurrentMinMa) {
      setChallengeStatus('failed');
      setFailureMessage(`Current is too low (${simulation.currentMa} mA). Goal is between ${activeChallenge.targetCurrentMinMa} mA and ${activeChallenge.targetCurrentMaxMa} mA. Decrease resistance.`);
      recordBKTInteraction(activeChallenge.kcId, false, 'simulation_lab', 20, 'Current too low');
      return;
    }

    if (simulation.currentMa > activeChallenge.targetCurrentMaxMa) {
      setChallengeStatus('failed');
      setFailureMessage(`Current is slightly too high (${simulation.currentMa} mA). Goal is between ${activeChallenge.targetCurrentMinMa} mA and ${activeChallenge.targetCurrentMaxMa} mA.`);
      recordBKTInteraction(activeChallenge.kcId, false, 'simulation_lab', 20, 'Current above target');
      return;
    }

    // Success!
    setChallengeStatus('success');
    setFailureMessage('');
    recordBKTInteraction(
      activeChallenge.kcId,
      true,
      'simulation_lab',
      activeChallenge.xpReward,
      `Successfully balanced ${simulation.currentMa}mA with ${resistance}Ω resistor.`
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Digital Twin: Electronics Simulation Workbench
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  v2.4 Live Solver
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Ohm&apos;s Law & Diode Protection Simulator directly tied to your Bayesian Knowledge state.
              </p>
            </div>
          </div>
        </div>

        {/* Real-time BKT Mastery Badge */}
        <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800">
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">BKT Mastery (LED & Resistors)</span>
            <div className="flex items-center justify-end gap-2">
              <span className="text-base font-bold text-white">{(pL * 100).toFixed(0)}%</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${cognitiveTier.badgeClass}`}>
                {cognitiveTier.tier}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workbench Layout: Canvas on Left, Controls & Multimeter on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Interactive Circuit Canvas (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-6 overflow-hidden min-h-[380px] flex items-center justify-center">
            {/* Breadboard Grid Background */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(#38bdf8 1.5px, transparent 1.5px)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* SVG Interactive Circuit Layout */}
            <svg viewBox="0 0 500 320" className="w-full h-auto max-w-lg select-none">
              <defs>
                {/* Glow Filter for LED */}
                <filter id="led-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="pop-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="15" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Wire Path Loop: Battery (left) -> Switch (top) -> Resistor (right) -> LED (bottom) -> Battery */}
              <path
                d="M 90 120 L 90 50 L 250 50 L 410 50 L 410 120 L 410 270 L 250 270 L 90 270 L 90 200"
                fill="none"
                stroke={simulation.isConduction && simulation.state !== 'burnt_out' ? '#0284c7' : '#334155'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Current flow electron animation dots if active */}
              {simulation.isConduction && simulation.state !== 'burnt_out' && (
                <path
                  d="M 90 120 L 90 50 L 250 50 L 410 50 L 410 120 L 410 270 L 250 270 L 90 270 L 90 200"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="5"
                  strokeDasharray="8, 16"
                  strokeLinecap="round"
                  className="animate-[dash_1s_linear_infinite]"
                  style={{
                    animationDuration: `${Math.max(0.3, 2.5 - (simulation.currentMa / 15))}s`,
                  }}
                />
              )}

              {/* Component 1: DC Battery (Left) */}
              <g transform="translate(60, 120)">
                <rect x="0" y="0" width="60" height="80" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="2" />
                <rect x="18" y="-8" width="24" height="8" rx="2" fill="#94a3b8" />
                <text x="30" y="32" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="bold">
                  {voltageSource}V
                </text>
                <text x="30" y="52" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="600">
                  DC Rail
                </text>
                <circle cx="30" cy="70" r="4" fill="#ef4444" />
                <text x="30" y="73" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">+</text>
              </g>

              {/* Component 2: Interactive Switch (Top Center) */}
              <g
                transform="translate(220, 30)"
                className="cursor-pointer"
                onClick={() => setSwitchClosed(!switchClosed)}
              >
                <rect x="0" y="0" width="60" height="40" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
                <circle cx="12" cy="20" r="5" fill="#64748b" />
                <circle cx="48" cy="20" r="5" fill="#64748b" />
                {switchClosed ? (
                  <line x1="12" y1="20" x2="48" y2="20" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
                ) : (
                  <line x1="12" y1="20" x2="44" y2="5" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
                )}
                <text x="30" y="35" textAnchor="middle" fill={switchClosed ? '#10b981' : '#f59e0b'} fontSize="9" fontWeight="bold">
                  {switchClosed ? 'CLOSED' : 'OPEN'}
                </text>
              </g>

              {/* Component 3: Resistor (Right) */}
              <g transform="translate(380, 120)">
                {/* Resistor ceramic body */}
                <rect x="0" y="10" width="60" height="60" rx="10" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                {/* Color Bands */}
                <rect x="12" y="10" width="6" height="60" fill={colorBands[0]} />
                <rect x="22" y="10" width="6" height="60" fill={colorBands[1]} />
                <rect x="32" y="10" width="6" height="60" fill={colorBands[2]} />
                <rect x="46" y="10" width="4" height="60" fill="#facc15" /> {/* Gold tolerance band */}
                <text x="30" y="90" textAnchor="middle" fill="#f8fafc" fontSize="12" fontWeight="bold">
                  {resistance} Ω
                </text>
              </g>

              {/* Component 4: LED Diode (Bottom Center) */}
              <g transform="translate(230, 240)">
                {simulation.state === 'burnt_out' ? (
                  /* Blown / Exploded LED state */
                  <g filter="url(#pop-glow)">
                    <circle cx="20" cy="20" r="24" fill="#ef4444" opacity="0.3" />
                    <text x="20" y="15" textAnchor="middle" fontSize="24">💥</text>
                    <text x="20" y="35" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">
                      POPPED!
                    </text>
                  </g>
                ) : (
                  /* Functional LED state */
                  <g>
                    {/* Glowing Aura if turned on */}
                    {simulation.isConduction && simulation.state !== 'off' && (
                      <circle
                        cx="20"
                        cy="15"
                        r={simulation.state === 'bright' ? 32 : simulation.state === 'optimal' ? 24 : 14}
                        fill={
                          ledColor === 'red' ? '#ef4444' : ledColor === 'green' ? '#10b981' : '#3b82f6'
                        }
                        opacity={simulation.state === 'bright' ? 0.8 : simulation.state === 'optimal' ? 0.6 : 0.25}
                        filter="url(#led-glow)"
                      />
                    )}
                    {/* 5mm LED Bulb Dome */}
                    <path
                      d="M 10 25 C 10 5, 30 5, 30 25 Z"
                      fill={
                        simulation.isConduction
                          ? ledColor === 'red' ? '#f87171' : ledColor === 'green' ? '#34d399' : '#60a5fa'
                          : '#475569'
                      }
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <rect x="8" y="24" width="24" height="4" rx="1" fill="#64748b" />
                    <text x="20" y="45" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight="bold">
                      {ledColor.toUpperCase()} LED ({forwardVoltage}V)
                    </text>
                  </g>
                )}
              </g>
            </svg>

            {/* Overcurrent Burnout Overlay Banner */}
            {simulation.state === 'burnt_out' && (
              <div className="absolute bottom-4 left-4 right-4 bg-rose-950/90 border border-rose-600/70 rounded-xl p-3 flex items-center gap-3 backdrop-blur-md animate-bounce">
                <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-rose-200 block text-sm">Thermal Runaway / Diode Burnout!</span>
                  Current surged to <span className="font-mono font-bold text-white">{simulation.currentMa} mA</span> (Limit is 30 mA). The LED burned out! Increase resistance.
                </div>
              </div>
            )}
          </div>

          {/* Quick Multimeter Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium block">Loop Current (I)</span>
              <span
                className={`text-lg font-mono font-bold ${
                  simulation.state === 'burnt_out'
                    ? 'text-rose-400'
                    : simulation.state === 'optimal'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {simulation.currentMa} mA
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium block">Resistor Drop (VR)</span>
              <span className="text-lg font-mono font-bold text-cyan-400">
                {simulation.voltageAcrossResistor} V
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium block">Diode Drop (Vf)</span>
              <span className="text-lg font-mono font-bold text-purple-400">
                {simulation.voltageAcrossLed} V
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium block">Dissipation (P)</span>
              <span className="text-lg font-mono font-bold text-slate-300">
                {simulation.powerMw} mW
              </span>
            </div>
          </div>
        </div>

        {/* Controls & Challenge Station (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Component Parameter Tuner */}
          <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between pb-3 border-b border-slate-800">
              <span>Workbench Component Controls</span>
              <button
                onClick={() => {
                  setVoltageSource(9);
                  setResistance(330);
                  setSwitchClosed(true);
                  setChallengeStatus('idle');
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </h3>

            {/* Battery Voltage Selector */}
            <div className="mt-4">
              <label className="text-xs text-slate-400 flex items-center justify-between font-medium mb-1.5">
                <span>DC Voltage Source (V)</span>
                <span className="font-mono text-cyan-400 font-bold">{voltageSource} Volts</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 5, 9, 12].map(v => (
                  <button
                    key={v}
                    onClick={() => setVoltageSource(v)}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      voltageSource === v
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {v}V
                  </button>
                ))}
              </div>
            </div>

            {/* Resistor Slider & Presets */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400 font-medium">Series Resistor Value (R)</span>
                <span className="font-mono text-amber-400 font-bold">{resistance} Ω</span>
              </div>
              <input
                type="range"
                min="50"
                max="1200"
                step="10"
                value={resistance}
                onChange={e => setResistance(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {[100, 220, 330, 470, 1000].map(val => (
                  <button
                    key={val}
                    onClick={() => setResistance(val)}
                    className={`py-1 text-[11px] font-mono rounded border transition-all ${
                      resistance === val
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {val >= 1000 ? '1kΩ' : `${val}Ω`}
                  </button>
                ))}
              </div>
            </div>

            {/* LED Color Selection & Switch Toggle */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Diode Type</label>
                <div className="flex gap-2">
                  {(['red', 'green', 'blue'] as const).map(color => (
                    <button
                      key={color}
                      onClick={() => setLedColor(color)}
                      className={`flex-1 py-1 text-xs rounded border capitalize transition-all ${
                        ledColor === color
                          ? 'border-white text-white font-bold'
                          : 'border-slate-800 text-slate-400'
                      }`}
                      style={{
                        backgroundColor:
                          ledColor === color
                            ? color === 'red' ? '#991b1b' : color === 'green' ? '#065f46' : '#1e40af'
                            : '#0f172a',
                      }}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">Master Switch</label>
                <button
                  onClick={() => setSwitchClosed(!switchClosed)}
                  className={`w-full py-1 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                    switchClosed
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {switchClosed ? 'CIRCUIT ENERGIZED' : 'SWITCH OPEN'}
                </button>
              </div>
            </div>
          </div>

          {/* Gamified Lab Challenge Card */}
          <div className="bg-gradient-to-br from-slate-950 to-indigo-950/40 rounded-xl border border-indigo-500/30 p-5">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold text-white">Active Lab Mission</h4>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                <Sparkles className="w-3.5 h-3.5" /> +{activeChallenge.xpReward} XP
              </div>
            </div>

            <div className="mt-3">
              <h5 className="text-sm font-semibold text-indigo-200">{activeChallenge.title}</h5>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {activeChallenge.targetGoal}
              </p>
            </div>

            {/* Target Formula Hint */}
            <div className="mt-3 p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-800/50 text-xs text-indigo-300 font-mono">
              <span className="font-sans font-semibold text-slate-400 block mb-0.5">Ohm&apos;s Law Formula:</span>
              {activeChallenge.hintFormula}
            </div>

            {/* Test Button & Feedback */}
            <div className="mt-4">
              <button
                onClick={testChallengeCircuit}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" /> Verify Circuit & Submit to BKT
              </button>

              {challengeStatus === 'success' && (
                <div className="mt-3 p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-300 block">Mission Accomplished!</span>
                    Circuit is perfectly balanced at {simulation.currentMa} mA. Evidence recorded into your Bayesian Cognitive Profile (+{activeChallenge.xpReward} XP)!
                  </div>
                </div>
              )}

              {challengeStatus === 'failed' && (
                <div className="mt-3 p-3 bg-rose-950/80 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-bold text-rose-300 block">Trial Did Not Meet Criteria</span>
                    {failureMessage}
                  </div>
                </div>
              )}
            </div>

            {/* Challenge Switcher */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800/80">
              {MOCK_LAB_CHALLENGES.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setActiveChallengeIdx(idx);
                    setChallengeStatus('idle');
                    setFailureMessage('');
                  }}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${
                    activeChallengeIdx === idx
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  Mission {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
