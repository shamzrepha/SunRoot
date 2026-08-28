import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

type Props = {
  teacherId: string;
  teacherName: string;
  onCreated?: (c: any) => void;
};

export default function CreateClass({ teacherId, teacherName, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [criteria, setCriteria] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim() || !topic.trim()) {
      setError('Please provide class name and topic.');
      return;
    }
    setLoading(true);
    try {
      // simple duplicate check: same title by same teacher within existing classes
      const q = query(collection(db, 'classes'), where('title', '==', title.trim()), where('teacherId', '==', teacherId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError('You already created a class with this name.');
        setLoading(false);
        return;
      }

      const displayName = `${title} by ${teacherName}`;
      const docRef = await addDoc(collection(db, 'classes'), {
        title: title.trim(),
        displayName,
        topic: topic.trim(),
        criteria: { raw: criteria },
        teacherId,
        teacherName,
        owner: 'teacher',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const newClass = { id: docRef.id, title: title.trim(), displayName, topic, criteria };
      if (onCreated) onCreated(newClass);
      // only clear title to prevent accidental duplicates, preserve topic/criteria
      setTitle('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error creating class');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
      <div>
        <label>Class name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Eg: Mechanics 101" />
      </div>
      <div>
        <label>Topic</label>
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Eg: Gears, Fluid Dynamics" />
      </div>
      <div>
        <label>Criteria / Notes</label>
        <textarea value={criteria} onChange={e => setCriteria(e.target.value)} placeholder="Optional class criteria" />
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create class'}</button>
    </form>
  );
}
