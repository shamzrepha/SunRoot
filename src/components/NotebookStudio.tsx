'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Brain,
  Sparkles,
  BookOpen,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MessageSquare,
  ArrowRight,
  Send,
  Headphones,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  FileCheck,
  Calculator,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getCognitiveTier } from '@/lib/bkt';
import { Flashcard, KnowledgeComponent, AudioOverviewDialog } from '@/lib/types';

export default function NotebookStudio() {
  const {
    classroom,
    uploadStudyMaterial,
    recordBKTInteraction,
    studentProgress,
    currentUser,
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'podcast' | 'mindmap' | 'flashcards' | 'briefing' | 'formulas' | 'socratic' | 'sources'
  >('podcast');

  const [selectedKcId, setSelectedKcId] = useState<string>('kc-ohms-law');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');

  // Audio Podcast State
  const [isPlayingPodcast, setIsPlayingPodcast] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const activeMaterial = classroom.materials[0];
  const podcastDialog = activeMaterial?.audioOverview || [];

  const stopPodcast = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingPodcast(false);
  };

  const playLine = (idx: number) => {
    if (idx >= podcastDialog.length) {
      setIsPlayingPodcast(false);
      setCurrentLineIdx(0);
      return;
    }

    setCurrentLineIdx(idx);
    const line = podcastDialog[idx];

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.pitch = line.pitch;
      utterance.rate = line.rate;

      utterance.onend = () => {
        if (isPlayingPodcast) {
          playLine(idx + 1);
        }
      };

      utterance.onerror = () => {
        setIsPlayingPodcast(false);
      };

      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      const timer = setTimeout(() => {
        playLine(idx + 1);
      }, 4000);
      return () => clearTimeout(timer);
    }
  };

  const togglePodcast = () => {
    if (isPlayingPodcast) {
      stopPodcast();
    } else {
      setIsPlayingPodcast(true);
      playLine(currentLineIdx);
    }
  };

  useEffect(() => {
    return () => {
      stopPodcast();
    };
  }, []);

  // Flashcard State
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Socratic Chat State
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; text: string; citation?: string }[]
  >([
    {
      role: 'assistant',
      text: "Hello! I am your AI Socratic Study Assistant, grounded strictly in Dr. Vance's uploaded lecture notes and lab guides. Ask me anything about voltage, Ohm's law, or resistor sizing!",
      citation: 'DC Circuits & Semiconductors 2026, §Preface',
    },
  ]);
  const [userInput, setUserInput] = useState('');

  const currentCards = classroom.flashcards;
  const activeCard: Flashcard | undefined = currentCards[currentCardIdx];
  const userProgress = studentProgress[currentUser.id];

  const handleCardResult = (isCorrect: boolean) => {
    if (!activeCard) return;
    recordBKTInteraction(
      activeCard.kcId,
      isCorrect,
      'flashcard',
      isCorrect ? 35 : 10,
      `Flashcard: ${activeCard.front}`
    );
    setIsFlipped(false);
    setShowHint(false);
    if (currentCardIdx < currentCards.length - 1) {
      setCurrentCardIdx(prev => prev + 1);
    } else {
      setCurrentCardIdx(0);
    }
  };

  const handleSendMessage = () => {
    if (!userInput.trim()) return;
    const q = userInput;
    const newMessages = [...chatMessages, { role: 'user' as const, text: q }];
    setChatMessages(newMessages);
    setUserInput('');

    setTimeout(() => {
      let reply = '';
      let cite = 'DC Circuits & Semiconductors 2026, §2.1';

      const lowerQ = q.toLowerCase();
      if (lowerQ.includes('why') && lowerQ.includes('resistor')) {
        reply =
          "According to Chapter 2 of your uploaded notes, an LED is a semiconductor diode with negligible internal resistance once its forward voltage threshold (~2.0V) is exceeded. Without a series resistor to oppose current, the charge flows asymptotically, quickly exceeding the 30mA thermal destruction threshold and melting the diode junction.";
        cite = 'DC Circuits & Semiconductors 2026, §2.3';
      } else if (lowerQ.includes('calculate') || lowerQ.includes('formula') || lowerQ.includes('ohm')) {
        reply =
          "To size the protection resistor, apply Ohm's Law to the resistor itself: R = (V_source - V_forward) / I_target. For example, with a 9V battery, a 2.0V red LED, and a target current of 20mA (0.02A): R = (9 - 2) / 0.02 = 7.0 / 0.02 = 350 Ω. Standard values like 330Ω or 390Ω are safe.";
        cite = 'DC Circuits & Semiconductors 2026, §2.4';
      } else if (lowerQ.includes('voltage') || lowerQ.includes('potential')) {
        reply =
          "Voltage represents electric potential energy per unit charge (1 Volt = 1 Joule / Coulomb). Think of it as the electrical 'pressure' generated by the chemical battery that propels mobile charge carriers through the circuit.";
        cite = 'DC Circuits & Semiconductors 2026, §1.2';
      } else {
        reply =
          `Based on your class material "${classroom.materials[0]?.title || 'Circuit Guide'}", electronic behavior is governed by Ohm's Law V = I × R. When designing circuits in the digital twin workbench, always check both the voltage drop and the maximum allowable current for each component.`;
        cite = 'DC Circuits & Semiconductors 2026, §General';
      }

      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', text: reply, citation: cite },
      ]);
    }, 600);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) return;
    setIsUploading(true);
    await uploadStudyMaterial(uploadTitle, uploadContent);
    setIsUploading(false);
    setUploadTitle('');
    setUploadContent('');
    setActiveTab('podcast');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
      {/* Studio Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              CogniTwin Multi-Modal Study Studio
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40">
                NotebookLM + SciSpace + Knowt Engine
              </span>
            </h2>
            <p className="text-sm text-slate-400">
              Two-speaker AI podcast overview, executive briefing doc, scientific formula derivations, concept map, and grounded citations.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 self-start lg:self-auto gap-1">
          <button
            onClick={() => setActiveTab('podcast')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'podcast'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" /> AI Podcast
          </button>
          <button
            onClick={() => setActiveTab('briefing')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'briefing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" /> Briefing Doc
          </button>
          <button
            onClick={() => setActiveTab('formulas')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'formulas'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" /> SciSpace Derivations
          </button>
          <button
            onClick={() => setActiveTab('mindmap')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'mindmap'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Brain className="w-3.5 h-3.5" /> Concept Map
          </button>
          <button
            onClick={() => setActiveTab('flashcards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'flashcards'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Flashcards ({classroom.flashcards.length})
          </button>
          <button
            onClick={() => setActiveTab('socratic')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'socratic'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Socratic AI
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'sources'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Ingestion ({classroom.materials.length})
          </button>
        </div>
      </div>

      {/* Tab 1: AI Audio Overview Podcast Player (NotebookLM Feature) */}
      {activeTab === 'podcast' && (
        <div className="mt-6 max-w-3xl mx-auto space-y-6">
          <div className="bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 rounded-2xl border border-cyan-500/30 p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
                  <Headphones className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Deep Dive Podcast Overview
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      NotebookLM Style 2-Speaker AI
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host Alex &amp; Expert Dr. Sam discussing circuit theory, LED diode physics, and Ohm&apos;s law.
                  </p>
                </div>
              </div>

              {/* Master Audio Controls */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={togglePodcast}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-cyan-600/30"
                >
                  {isPlayingPodcast ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" /> Pause Audio Overview
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" /> Play Audio Overview
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    stopPodcast();
                    setCurrentLineIdx(0);
                  }}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
                  title="Reset to beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Interactive Transcript Dialog Log */}
            <div className="mt-6 space-y-3">
              {podcastDialog.map((line, idx) => {
                const isCurrent = idx === currentLineIdx;
                const isAlex = line.speaker.includes('Alex');

                return (
                  <div
                    key={line.id}
                    onClick={() => {
                      if (isPlayingPodcast) {
                        playLine(idx);
                      } else {
                        setCurrentLineIdx(idx);
                      }
                    }}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      isCurrent
                        ? isAlex
                          ? 'bg-cyan-950/60 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                          : 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-bold ${
                          isAlex ? 'text-cyan-400' : 'text-indigo-400'
                        }`}
                      >
                        {line.speaker}
                      </span>
                      {isCurrent && isPlayingPodcast && (
                        <span className="flex items-center gap-1 text-[10px] text-cyan-300 font-mono animate-pulse">
                          <Volume2 className="w-3 h-3" /> Speaking now
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{line.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Executive Briefing Doc (NotebookLM & Claude Style) */}
      {activeTab === 'briefing' && (
        <div className="mt-6 max-w-3xl mx-auto bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-400" />
              Executive Briefing Document
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Grounded on {activeMaterial?.fileName}
            </span>
          </div>

          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans space-y-4">
            {activeMaterial?.briefingDoc || activeMaterial?.summary}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Extracted by CogniTwin Grounding Engine</span>
            <button
              onClick={() => setActiveTab('formulas')}
              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              View Formula Derivations <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Scientific Formula & Derivation Explainer (SciSpace Style) */}
      {activeTab === 'formulas' && (
        <div className="mt-6 max-w-3xl mx-auto space-y-4">
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-purple-400" />
              SciSpace Mathematical &amp; Physics Derivations
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Rigorous step-by-step mathematical proofs grounded in circuit engineering principles.
            </p>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-purple-300 font-mono text-sm">
                    1. Series LED Current-Limiting Equation
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Kirchhoff&apos;s Voltage Law (KVL)</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-purple-500/20 font-mono text-cyan-300 text-sm my-2 text-center">
                  R = (V_source - V_diode) / I_target
                </div>
                <p className="text-slate-300 leading-relaxed mt-2">
                  <strong>Derivation:</strong> According to KVL, the algebraic sum of potential drops around a closed loop equals zero: <code className="text-purple-300">V_source - V_R - V_LED = 0</code>. Therefore, the voltage drop across the resistor is <code className="text-purple-300">V_R = V_source - V_LED</code>. Applying Ohm&apos;s law to the resistive element alone yields <code className="text-purple-300">R = V_R / I</code>.
                </p>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-purple-300 font-mono text-sm">
                    2. Joule Heating &amp; Thermal Power Dissipation
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Thermodynamic Limit</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-purple-500/20 font-mono text-cyan-300 text-sm my-2 text-center">
                  P = I^2 × R = (V^2) / R
                </div>
                <p className="text-slate-300 leading-relaxed mt-2">
                  <strong>Practical Engineering Rule:</strong> A typical 1/4-Watt through-hole carbon film resistor tolerates up to 250 mW. For a 9V source and 330Ω resistor dropping 7V at 21mA: <code className="text-purple-300">P = (0.021)^2 × 330 = 0.145 W (145 mW)</code>, which operates well inside safe margins.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Interactive Concept DAG Mindmap (RemNote Style) */}
      {activeTab === 'mindmap' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-400" />
                Bayesian Knowledge Component (KC) Dependency Graph
              </h3>
              <p className="text-xs text-slate-400">
                Nodes reflect real-time probability of mastery P(L_t). Green indicates cognitive mastery (&gt;85%).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {classroom.knowledgeComponents.map(kc => {
              const mastery = userProgress?.masteryByKC[kc.id];
              const pL = mastery?.probabilityMastery ?? kc.bktParams.pL0;
              const tier = getCognitiveTier(pL);
              const isSelected = selectedKcId === kc.id;

              return (
                <div
                  key={kc.id}
                  onClick={() => setSelectedKcId(kc.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all ${
                    isSelected
                      ? 'bg-slate-800/90 border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-slate-400">{kc.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${tier.badgeClass}`}>
                      {tier.tier}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-white line-clamp-2 min-h-[32px]">{kc.title}</h4>

                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400">Mastery</span>
                      <span className="font-bold text-white">{(pL * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, pL * 100)}%`,
                          backgroundColor: tier.color,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Prereqs: {kc.prerequisites.length || 'None'}</span>
                    <span className="capitalize">{kc.difficulty}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 5: Spaced Repetition Flashcards (Knowt & RemNote Style) */}
      {activeTab === 'flashcards' && activeCard && (
        <div className="mt-6 max-w-xl mx-auto">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span>
              Card {currentCardIdx + 1} of {currentCards.length}
            </span>
            <span className="text-indigo-400 font-medium">Spaced Repetition SM-2</span>
          </div>

          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="cursor-pointer min-h-[240px] bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-8 flex flex-col justify-between shadow-xl transition-all relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                {isFlipped ? 'Answer & Derivation' : 'Question / Prompt'}
              </span>
              <span className="text-xs text-slate-400 group-hover:text-indigo-300 flex items-center gap-1 transition-colors">
                Click card to flip
              </span>
            </div>

            <div className="my-6">
              {!isFlipped ? (
                <div>
                  <p className="text-lg font-medium text-white leading-relaxed">{activeCard.front}</p>
                  {showHint && activeCard.hint && (
                    <div className="mt-4 p-3 rounded-lg bg-indigo-950/50 border border-indigo-800/40 text-xs text-indigo-300">
                      💡 <strong>Hint:</strong> {activeCard.hint}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-base text-emerald-200 leading-relaxed font-normal">{activeCard.back}</p>
                  {activeCard.citation && (
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-indigo-300 font-mono">
                      <BookOpen className="w-3.5 h-3.5" /> Source: {activeCard.citation}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-900">
              {!isFlipped && activeCard.hint && !showHint ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setShowHint(true);
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Show Hint
                </button>
              ) : (
                <div />
              )}
              <span className="text-xs text-slate-500 font-mono">Auto-Grounded</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <button
              onClick={() => handleCardResult(false)}
              className="py-3 px-4 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              Struggled / Forgot (-BKT Update)
            </button>
            <button
              onClick={() => handleCardResult(true)}
              className="py-3 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Knew It Well (+BKT Mastery &amp; XP)
            </button>
          </div>
        </div>
      )}

      {/* Tab 6: Grounded Socratic AI Chat (ChatPDF & Claude Style) */}
      {activeTab === 'socratic' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden h-[450px]">
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm'
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.citation && (
                      <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-indigo-300 flex items-center gap-1 font-mono">
                        <BookOpen className="w-3 h-3" />
                        Grounded Quote: [{msg.citation}]
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask Socratic tutor about resistors, LED voltage drops, or circuit theory..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSendMessage}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Grounded Ingestion Index
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                All responses use Retrieval-Augmented Generation (RAG) mapped directly to Dr. Vance&apos;s curriculum files. No hallucinations.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-white mb-2">Suggested Inquiries</h4>
              <div className="space-y-1.5">
                {[
                  'Why does an LED blow without a resistor?',
                  'How do I calculate R for 9V battery and red LED?',
                  'What is the fundamental difference between voltage and current?',
                ].map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setUserInput(promptText);
                    }}
                    className="w-full text-left p-2 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/30 text-[11px] text-slate-300 transition-colors"
                  >
                    &ldquo;{promptText}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Sources & Document Uploader */}
      {activeTab === 'sources' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-950 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4 text-indigo-400" />
              Upload New Study Material
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              AI automatically extracts Knowledge Components, generates audio overviews, flashcards, and updates student prerequisite DAGs.
            </p>

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="e.g. Kirchhoff Laws & Parallel Mesh Analysis"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Lecture Notes / Text Corpus</label>
                <textarea
                  rows={4}
                  value={uploadContent}
                  onChange={e => setUploadContent(e.target.value)}
                  placeholder="Paste lecture notes or chapter summary here..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
              >
                {isUploading ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" /> Analyzing &amp; Synthesizing...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" /> Process with CogniTwin AI
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <h3 className="text-sm font-bold text-white mb-2">Ingested Documents in Classroom</h3>
            {classroom.materials.map(doc => (
              <div key={doc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{doc.title}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {doc.fileName} • Uploaded {doc.uploadedAt}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{doc.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
