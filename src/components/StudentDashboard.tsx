'use client';

import React from 'react';
import {
  Flame,
  Zap,
  BookOpen,
  Trophy,
  Brain,
  ArrowRight,
  Sparkles,
  Award,
  Users,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getCognitiveTier } from '@/lib/bkt';

interface StudentDashboardProps {
  onNavigate: (tab: 'workbench' | 'notebook' | 'room' | 'leaderboard') => void;
}

export default function StudentDashboard({ onNavigate }: StudentDashboardProps) {
  const { currentUser, studentProgress, classroom } = useApp();
  const progress = studentProgress[currentUser.id];

  const overallMastery = progress?.overallMasteryPct ?? 50;

  // Identify next recommended KC based on BKT mastery
  const recommendedKC = classroom.knowledgeComponents.find(kc => {
    const mastery = progress?.masteryByKC[kc.id];
    const pL = mastery?.probabilityMastery ?? kc.bktParams.pL0;
    return pL < 0.85; // First unmastered concept
  }) || classroom.knowledgeComponents[2];

  const recommendedMastery = progress?.masteryByKC[recommendedKC.id];
  const recPL = recommendedMastery?.probabilityMastery ?? recommendedKC.bktParams.pL0;
  const recTier = getCognitiveTier(recPL);

  return (
    <div className="space-y-6">
      {/* Student Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500/50 shadow-xl"
              />
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-indigo-600 text-[10px] font-bold rounded-md text-white border border-slate-900">
                Lv.{currentUser.level}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white">{currentUser.name}</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold capitalize">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {currentUser.schoolName} • Enrolled in {classroom.name}
              </p>
            </div>
          </div>

          {/* Gamification Stats Strip */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="bg-slate-950/90 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                <Flame className="w-5 h-5 fill-orange-400" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Daily Streak</span>
                <span className="text-base font-bold text-white font-mono">{currentUser.streakDays} Days</span>
              </div>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Brain XP</span>
                <span className="text-base font-bold text-amber-400 font-mono">{currentUser.totalXP}</span>
              </div>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Brain className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Class Mastery</span>
                <span className="text-base font-bold text-emerald-400 font-mono">{overallMastery}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Next Best Step Recommendation */}
      <div className="bg-gradient-to-r from-indigo-950/60 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1">
              <Brain className="w-3.5 h-3.5" /> BKT Cognitive Adaptation
            </span>
            <span className="text-xs text-slate-400 font-mono">Next Optimal Opportunity</span>
          </div>
          <h3 className="text-lg font-bold text-white">
            Focus Concept: {recommendedKC.title}
          </h3>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Your current belief probability is <strong className="text-white">{(recPL * 100).toFixed(0)}%</strong> ({recTier.tier}). Solving the 9V LED Resistor Sizing challenge in the Electronics Workbench is predicted to advance your cognitive probability past the 85% mastery threshold!
          </p>
        </div>

        <button
          onClick={() => onNavigate('workbench')}
          className="self-start md:self-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
        >
          <Zap className="w-4 h-4" /> Start Workbench Lab <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 4 Feature Gateways Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gateway 1: Workbench */}
        <div
          onClick={() => onNavigate('workbench')}
          className="cursor-pointer bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl w-fit mb-3 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
              Simulation Workbench
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Drag &amp; drop batteries, resistors, and LEDs. Live Ohm&apos;s law calculations and realistic burnout physics.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-cyan-400">
            <span>Open Lab</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Gateway 2: NotebookLM */}
        <div
          onClick={() => onNavigate('notebook')}
          className="cursor-pointer bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl w-fit mb-3 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
              NotebookLM Studio
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Explore prerequisite DAGs, spaced-repetition flashcards, and ask the grounded Socratic AI assistant.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-indigo-400">
            <span>Explore Studio</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Gateway 3: Peer Lounge */}
        <div
          onClick={() => onNavigate('room')}
          className="cursor-pointer bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl w-fit mb-3 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
              Peer Study Lounge
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Join or create ad-hoc friend study rooms. Synchronous collaborative whiteboard and co-studying sessions.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-purple-400">
            <span>Enter Lounge</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Gateway 4: Leaderboards */}
        <div
          onClick={() => onNavigate('leaderboard')}
          className="cursor-pointer bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 transition-all group flex flex-col justify-between"
        >
          <div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl w-fit mb-3 group-hover:scale-110 transition-transform">
              <Trophy className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
              Class Leaderboard
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Check weekly class standings, global ranks, active study streaks, and unlock new scholar badges.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>View Rankings</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* Badges Showcase Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          Earned Cognitive Badges ({currentUser.badges.length})
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {currentUser.badges.map(badge => (
            <div key={badge.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
              <span className="text-2xl">{badge.icon}</span>
              <div>
                <span className="text-xs font-bold text-white block">{badge.name}</span>
                <span className="text-[10px] text-slate-400 leading-tight block">{badge.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
