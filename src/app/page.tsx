'use client';

import React, { useState } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import Navbar from '@/components/Navbar';
import StudentDashboard from '@/components/StudentDashboard';
import ElectronicsWorkbench from '@/components/ElectronicsWorkbench';
import NotebookStudio from '@/components/NotebookStudio';
import StudyRoomView from '@/components/StudyRoomView';
import LeaderboardView from '@/components/LeaderboardView';
import TeacherDashboard from '@/components/TeacherDashboard';
import { Brain, Sparkles, BookOpen, Zap, Users, Shield } from 'lucide-react';

function MainApp() {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'workbench' | 'notebook' | 'room' | 'leaderboard' | 'teacher'
  >('dashboard');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <StudentDashboard onNavigate={setActiveTab} />}
        {activeTab === 'workbench' && <ElectronicsWorkbench />}
        {activeTab === 'notebook' && <NotebookStudio />}
        {activeTab === 'room' && (
          <StudyRoomView onOpenWorkbench={() => setActiveTab('workbench')} />
        )}
        {activeTab === 'leaderboard' && <LeaderboardView />}
        {activeTab === 'teacher' && <TeacherDashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-8 mt-12 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200">CogniTwin AI</span>
            <span>— Cognitive Bayesian Knowledge Tracing &amp; Digital Twin Classroom</span>
          </div>

          <div className="flex items-center gap-6 text-[11px] text-slate-400">
            <span>Hidden Markov Model BKT Engine</span>
            <span>•</span>
            <span>NotebookLM Grounded Synthesis</span>
            <span>•</span>
            <span>Real-time Interactive Circuits</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
