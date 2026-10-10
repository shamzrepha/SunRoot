'use client';

import React, { useState } from 'react';
import {
  Brain,
  Flame,
  Zap,
  BookOpen,
  Users,
  Trophy,
  LayoutDashboard,
  GraduationCap,
  Sparkles,
  ChevronDown,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { MOCK_USERS } from '@/lib/mockData';

interface NavbarProps {
  activeTab: 'dashboard' | 'workbench' | 'notebook' | 'room' | 'leaderboard' | 'teacher';
  setActiveTab: (tab: 'dashboard' | 'workbench' | 'notebook' | 'room' | 'leaderboard' | 'teacher') => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { currentUser, switchUser } = useApp();
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white flex items-center gap-1">
                Cogni<span className="text-cyan-400">Twin</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  AI
                </span>
              </span>
              <span className="text-[10px] text-slate-400 block -mt-1 font-medium tracking-wide">
                Cognitive Digital Twin LMS
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('workbench')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'workbench'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Simulation Lab
            </button>

            <button
              onClick={() => setActiveTab('notebook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'notebook'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              NotebookLM
            </button>

            <button
              onClick={() => setActiveTab('room')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'room'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Peer Lounge
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'leaderboard'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </button>

            <button
              onClick={() => setActiveTab('teacher')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'teacher'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-500/10'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
              Teacher Command
            </button>
          </nav>

          {/* Right Action: Streak, XP & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Gamification Pills */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs font-mono font-bold text-orange-400">
                <Flame className="w-3.5 h-3.5 fill-orange-400" />
                {currentUser.streakDays}d
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-mono font-bold text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                {currentUser.totalXP} XP
              </div>
            </div>

            {/* User Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-left"
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                />
                <div className="hidden lg:block text-xs pr-1">
                  <span className="font-bold text-white block leading-tight">{currentUser.name}</span>
                  <span className="text-[10px] text-slate-400 capitalize block leading-none">{currentUser.role}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Dropdown Menu */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50">
                  <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    Switch Digital Twin Role:
                  </div>

                  <div className="space-y-1 mt-1">
                    {Object.values(MOCK_USERS).map(u => {
                      const isSelected = u.id === currentUser.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            switchUser(u.id);
                            setShowUserDropdown(false);
                            if (u.role === 'teacher') {
                              setActiveTab('teacher');
                            }
                          }}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                              : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold block truncate">{u.name}</span>
                            <span className="text-[10px] text-slate-400 capitalize block">
                              {u.role} • {u.schoolName?.split(' ')[0] || 'Indep.'}
                            </span>
                          </div>
                          {isSelected && <UserCheck className="w-4 h-4 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 text-[11px]">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`font-semibold ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-400'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('workbench')}
            className={`font-semibold ${activeTab === 'workbench' ? 'text-cyan-400' : 'text-slate-400'}`}
          >
            Lab
          </button>
          <button
            onClick={() => setActiveTab('notebook')}
            className={`font-semibold ${activeTab === 'notebook' ? 'text-indigo-400' : 'text-slate-400'}`}
          >
            NotebookLM
          </button>
          <button
            onClick={() => setActiveTab('room')}
            className={`font-semibold ${activeTab === 'room' ? 'text-purple-400' : 'text-slate-400'}`}
          >
            Lounge
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`font-semibold ${activeTab === 'leaderboard' ? 'text-amber-400' : 'text-slate-400'}`}
          >
            Ranks
          </button>
          <button
            onClick={() => setActiveTab('teacher')}
            className={`font-semibold ${activeTab === 'teacher' ? 'text-emerald-400' : 'text-slate-400'}`}
          >
            Teacher
          </button>
        </div>
      </div>
    </header>
  );
}
