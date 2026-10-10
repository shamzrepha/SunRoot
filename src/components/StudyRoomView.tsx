'use client';

import React, { useState } from 'react';
import {
  Users,
  MessageSquare,
  BookOpen,
  Share2,
  Copy,
  Check,
  Zap,
  Sparkles,
  Edit3,
  Flame,
  Radio,
  FileText,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

export default function StudyRoomView({ onOpenWorkbench }: { onOpenWorkbench?: () => void }) {
  const { studyRoom, updateSharedNotes, currentUser, classroom } = useApp();
  const [copiedCode, setCopiedCode] = useState(false);
  const [notesText, setNotesText] = useState(studyRoom.sharedNotes);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(studyRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSaveNotes = () => {
    updateSharedNotes(notesText);
    setIsEditingNotes(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{studyRoom.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" /> Live Peer Session
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Created by {studyRoom.hostName} • Independent collaborative digital lounge
              </p>
            </div>
          </div>
        </div>

        {/* Room Code & Invite button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Invite Code:</span>
            <span className="font-mono font-bold text-purple-400 tracking-wider text-sm">{studyRoom.code}</span>
            <button
              onClick={handleCopyCode}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Copy Room Link"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {onOpenWorkbench && (
            <button
              onClick={onOpenWorkbench}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
            >
              <Zap className="w-3.5 h-3.5" /> Jump to Workbench
            </button>
          )}
        </div>
      </div>

      {/* Active Room Members Grid */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          Active Peers in Lounge ({studyRoom.activeMembers.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {studyRoom.activeMembers.map(member => (
            <div
              key={member.id}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-3 relative overflow-hidden"
            >
              <div className="relative">
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-10 h-10 rounded-full object-cover border border-purple-500/40"
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-white">{member.name}</h4>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                    {member.role}
                  </span>
                </div>
                <p className="text-[11px] text-purple-300 mt-0.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  {member.currentAction}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Space: Collaborative Room Notes & Shared Material */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Collaborative Notes (7 cols) */}
        <div className="lg:col-span-7 bg-slate-950 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-bold text-white">Live Shared Room Whiteboard &amp; Notes</h4>
            </div>
            {isEditingNotes ? (
              <button
                onClick={handleSaveNotes}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Save Notes
              </button>
            ) : (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
              >
                Edit Notes
              </button>
            )}
          </div>

          <div className="mt-4">
            {isEditingNotes ? (
              <textarea
                rows={6}
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            ) : (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed min-h-[140px]">
                {studyRoom.sharedNotes}
              </div>
            )}
          </div>
        </div>

        {/* Room Materials & Co-Study Activities (5 cols) */}
        <div className="lg:col-span-5 bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" /> Shared Study Materials
              </h4>
              <span className="text-xs text-slate-400">{classroom.materials.length} Shared</span>
            </div>

            <div className="mt-4 space-y-2.5">
              {classroom.materials.map(mat => (
                <div key={mat.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-xs font-semibold text-white block truncate">{mat.title}</span>
                    <span className="text-[10px] text-slate-400">{mat.fileName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-xs text-purple-200">
              <strong className="block text-purple-300 mb-1">Peer Room Synchronous Learning</strong>
              All member actions and sandbox experiments in this lounge update each student&apos;s individual BKT profile while building collective room XP!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
