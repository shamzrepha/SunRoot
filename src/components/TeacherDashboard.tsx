'use client';

import React, { useState } from 'react';
import {
  Users,
  Brain,
  AlertTriangle,
  TrendingUp,
  FileUp,
  Share2,
  Copy,
  Check,
  Sparkles,
  BarChart3,
  Flame,
  Award,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getCognitiveTier } from '@/lib/bkt';

export default function TeacherDashboard() {
  const { classroom, studentProgress, uploadStudyMaterial } = useApp();
  const [copiedCode, setCopiedCode] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('student_leo');
  const [interventionSent, setInterventionSent] = useState<string | null>(null);

  const students = Object.values(studentProgress);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(classroom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendIntervention = (studentName: string) => {
    setInterventionSent(studentName);
    setTimeout(() => setInterventionSent(null), 3000);
  };

  const averageClassMastery = Math.round(
    students.reduce((acc, s) => acc + s.overallMasteryPct, 0) / Math.max(1, students.length)
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
      {/* Teacher Classroom Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{classroom.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  Teacher Command
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Instructor: {classroom.teacherName} • Subject: {classroom.subject}
              </p>
            </div>
          </div>
        </div>

        {/* Join Code & Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Class Join Code:</span>
            <span className="font-mono font-bold text-emerald-400 tracking-wider text-sm">{classroom.code}</span>
            <button
              onClick={handleCopyCode}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Copy code"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-xs text-slate-400">Status:</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              {classroom.isPublic ? 'Public Class' : 'Private Class'}
            </span>
          </div>
        </div>
      </div>

      {/* Classroom Telemetry KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Total Enrolled</span>
          <span className="text-2xl font-bold text-white mt-1 block">{students.length} Students</span>
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Class Cognitive Mastery</span>
          <span className="text-2xl font-bold text-emerald-400 mt-1 block">{averageClassMastery}%</span>
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Active KCs in Unit</span>
          <span className="text-2xl font-bold text-cyan-400 mt-1 block">{classroom.knowledgeComponents.length} Concepts</span>
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 block font-medium">Study Materials Ingested</span>
          <span className="text-2xl font-bold text-indigo-400 mt-1 block">{classroom.materials.length} Documents</span>
        </div>
      </div>

      {/* Bayesian Knowledge Tracing Class Heatmap Matrix */}
      <div className="mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-400" />
              Classroom Cognitive Mastery Matrix (Bayesian Heatmap)
            </h3>
            <p className="text-xs text-slate-400">
              Real-time posterior probability of mastery $P(L_t)$ per student across every Knowledge Component.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-2 text-center">Avg Mastery</th>
                {classroom.knowledgeComponents.map(kc => (
                  <th key={kc.id} className="py-3 px-3 text-center min-w-[120px]">
                    <div className="font-bold text-slate-200">{kc.code}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{kc.title}</div>
                  </th>
                ))}
                <th className="py-3 px-3 text-center">Risk Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {students.map(student => {
                const isSelected = selectedStudentId === student.studentId;
                return (
                  <tr
                    key={student.studentId}
                    onClick={() => setSelectedStudentId(student.studentId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-950/30' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="py-3 px-4 flex items-center gap-2.5">
                      <img
                        src={student.studentAvatar}
                        alt={student.studentName}
                        className="w-7 h-7 rounded-full object-cover border border-slate-700"
                      />
                      <div>
                        <span className="font-bold text-white block">{student.studentName}</span>
                        <span className="text-[10px] text-slate-400">Streak: {student.streakDays}d 🔥</span>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center">
                      <span className="font-mono font-bold text-slate-200">{student.overallMasteryPct}%</span>
                    </td>

                    {classroom.knowledgeComponents.map(kc => {
                      const kcMastery = student.masteryByKC[kc.id];
                      const pL = kcMastery?.probabilityMastery ?? kc.bktParams.pL0;
                      const tier = getCognitiveTier(pL);

                      return (
                        <td key={kc.id} className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${tier.badgeClass}`}
                          >
                            {(pL * 100).toFixed(0)}%
                          </span>
                        </td>
                      );
                    })}

                    <td className="py-3 px-3 text-center">
                      {student.struggleRisk.level === 'high' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                          <AlertTriangle className="w-3 h-3 text-rose-400" /> Struggle Alert
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-[10px] font-medium">On Track</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Interventions & Bottleneck Insights */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identified Class Bottlenecks */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              AI Cognitive Bottleneck Detection
            </h4>
            <span className="text-xs text-amber-400 font-mono">1 Misconception Flagged</span>
          </div>

          <div className="mt-4 space-y-3">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-amber-200">
                    High Slip Rate on Concept: &ldquo;LED Protection &amp; Resistor Sizing&rdquo;
                  </h5>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    33% of students failed their initial circuit challenge due to forgetting to subtract the diode forward voltage drop $V_f$ ($2.0V$) before applying Ohm&apos;s Law $R = V / I$.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => handleSendIntervention('All Struggling Students')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-all"
                    >
                      Broadcast Guided Simulation Hint
                    </button>
                    {interventionSent && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Hint sent to student workbenches!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Student Deep Dive Profile */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
          {(() => {
            const currentStudent = studentProgress[selectedStudentId] || students[0];
            if (!currentStudent) return null;

            return (
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={currentStudent.studentAvatar}
                      alt={currentStudent.studentName}
                      className="w-8 h-8 rounded-full object-cover border border-slate-700"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-white">{currentStudent.studentName}</h4>
                      <span className="text-xs text-slate-400">Total XP: {currentStudent.totalXP}</span>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-semibold">
                    Mastery: {currentStudent.overallMasteryPct}%
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  <span className="text-xs text-slate-400 font-semibold block">Individual KC Mastery Breakdown:</span>
                  {classroom.knowledgeComponents.map(kc => {
                    const kcMastery = currentStudent.masteryByKC[kc.id];
                    const pL = kcMastery?.probabilityMastery ?? kc.bktParams.pL0;
                    const tier = getCognitiveTier(pL);

                    return (
                      <div key={kc.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-300 font-medium truncate max-w-[200px]">{kc.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-white font-bold">{(pL * 100).toFixed(0)}%</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${tier.badgeClass}`}>
                            {tier.tier}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
