'use client';

import React, { useState } from 'react';
import { Trophy, Flame, Award, Globe, Users, Sparkles, Star } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export default function LeaderboardView() {
  const { classLeaderboard, globalLeaderboard, currentUser } = useApp();
  const [boardType, setBoardType] = useState<'class' | 'global'>('class');

  const activeBoard = boardType === 'class' ? classLeaderboard : globalLeaderboard;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Hall of Mastery &amp; Leaderboards
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                Season 4
              </span>
            </h2>
            <p className="text-sm text-slate-400">
              Ranked by Cognitive XP, daily study streaks, and empirical concept mastery.
            </p>
          </div>
        </div>

        {/* Board Toggle */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setBoardType('class')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              boardType === 'class'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Class Leaderboard
          </button>
          <button
            onClick={() => setBoardType('global')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              boardType === 'global'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Global Ranking
          </button>
        </div>
      </div>

      {/* User Current Standing Banner */}
      <div className="mt-6 bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 p-4 rounded-xl border border-amber-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-amber-400 overflow-hidden">
            <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="text-xs text-amber-300 font-semibold flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-300" /> Your Standing: {currentUser.name}
            </span>
            <span className="text-sm font-bold text-white">Level {currentUser.level} Scholar</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <span className="text-slate-400 block">Total Cognitive XP</span>
            <span className="font-mono font-bold text-amber-400 text-base">{currentUser.totalXP} XP</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block">Active Streak</span>
            <span className="font-mono font-bold text-orange-400 text-base flex items-center gap-0.5 justify-end">
              <Flame className="w-4 h-4 fill-orange-400" /> {currentUser.streakDays}d
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 font-semibold">
              <th className="py-3 px-4 w-12 text-center">Rank</th>
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-4">Class / School</th>
              <th className="py-3 px-4 text-center">Concepts Mastered</th>
              <th className="py-3 px-4 text-center">Streak</th>
              <th className="py-3 px-4 text-right">Cognitive XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {activeBoard.map(entry => {
              const isCurrentUser = entry.userId === currentUser.id;
              return (
                <tr
                  key={entry.userId}
                  className={`transition-colors ${
                    isCurrentUser ? 'bg-amber-500/10 font-medium' : 'hover:bg-slate-900/40'
                  }`}
                >
                  <td className="py-3.5 px-4 text-center font-bold">
                    {entry.rank === 1 ? (
                      <span className="text-amber-400 text-base">🥇</span>
                    ) : entry.rank === 2 ? (
                      <span className="text-slate-300 text-base">🥈</span>
                    ) : entry.rank === 3 ? (
                      <span className="text-amber-600 text-base">🥉</span>
                    ) : (
                      <span className="text-slate-400 font-mono">#{entry.rank}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 flex items-center gap-3">
                    <img
                      src={entry.userAvatar}
                      alt={entry.userName}
                      className="w-7 h-7 rounded-full object-cover border border-slate-700"
                    />
                    <span className={`font-semibold ${isCurrentUser ? 'text-amber-300' : 'text-white'}`}>
                      {entry.userName} {isCurrentUser && '(You)'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">{entry.schoolOrClass}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold font-mono">
                      {entry.masteredCount} KCs
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center gap-1 font-mono text-orange-400 font-semibold">
                      <Flame className="w-3.5 h-3.5 fill-orange-400" /> {entry.streakDays}d
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400 text-sm">
                    {entry.xp} XP
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
