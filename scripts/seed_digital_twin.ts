// Seed an admin-owned Digital Twin class if not present.
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

async function seed() {
  const q = await db.collection('classes').where('owner', '==', 'admin').where('title', '==', 'Digital Twin').limit(1).get();
  if (!q.empty) {
    console.log('Digital Twin class already exists');
    return;
  }
  const adminUserSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  let teacherName = 'Admin';
  let teacherId = '';
  if (!adminUserSnapshot.empty) {
    const u = adminUserSnapshot.docs[0];
    teacherName = u.data().displayName || 'Admin';
    teacherId = u.id;
  }
  const doc = await db.collection('classes').add({
    title: 'Digital Twin',
    displayName: `Digital Twin by ${teacherName}`,
    teacherId,
    teacherName,
    topic: 'Digital Twin',
    criteria: {},
    owner: 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Seeded Digital Twin class', doc.id);
}

seed().catch(err => { console.error(err); process.exit(1); });
