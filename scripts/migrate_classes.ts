// Run this script with node (after compiling TS) or ts-node.
// It finds classes missing teacherName/displayName and backfills them using users collection.

import admin from 'firebase-admin';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const db = admin.firestore();

async function migrateClasses() {
  console.log('Starting migration...');
  const snapshot = await db.collection('classes').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const updates: any = {};
    if (!data.teacherName && data.teacherId) {
      const userDoc = await db.collection('users').doc(data.teacherId).get();
      const teacherName = userDoc.exists ? userDoc.data()?.displayName || userDoc.data()?.name || 'Unknown' : 'Unknown';
      updates.teacherName = teacherName;
      updates.displayName = `${data.title || 'Class'} by ${teacherName}`;
    }
    if (!data.owner) {
      updates.owner = 'teacher';
    }
    if (Object.keys(updates).length) {
      await doc.ref.set(updates, { merge: true });
      console.log('Updated', doc.id, updates);
    }
  }
  console.log('Migration complete');
}

migrateClasses().catch(err => { console.error(err); process.exit(1); });
