import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

type Props = { teacherId: string; teacherName: string };
export default function RecommendationsForm({ teacherId, teacherName }: Props) {
  const [message, setMessage] = useState('');
  const [desiredTopic, setDesiredTopic] = useState('');
  const [status, setStatus] = useState('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      await addDoc(collection(db, 'recommendations'), {
        teacherId,
        teacherName,
        message,
        desiredTopic,
        status: 'open',
        createdAt: serverTimestamp()
      });
      setMessage('');
      setDesiredTopic('');
      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit}>
      <h3>Request a new class or topic</h3>
      <div>
        <label>Desired topic</label>
        <input value={desiredTopic} onChange={e => setDesiredTopic(e.target.value)} placeholder="e.g., Gear Education" />
      </div>
      <div>
        <label>Message to admin / engineers</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe why this class is needed" />
      </div>
      <button type="submit">Send request</button>
      {status === 'success' && <div style={{ color: 'green' }}>Request sent</div>}
      {status === 'error' && <div style={{ color: 'red' }}>Error sending</div>}
    </form>
  );
}
