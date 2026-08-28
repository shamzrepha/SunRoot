import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize the Admin SDK. Make sure to set GOOGLE_APPLICATION_CREDENTIALS or deploy to Firebase.
admin.initializeApp();

/**
 * Callable function to set a user's role and verified flag.
 * Only callable by existing admins (custom claim 'role' == 'admin').
 * data: { uid: string, role?: string, verified?: boolean }
 */
export const setUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
  }
  const callerClaims = context.auth.token || {};
  if (callerClaims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admin may call this function.');
  }

  const { uid, role, verified } = data || {};
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing target uid.');
  }

  const claims: any = {};
  if (role !== undefined) claims.role = role;
  if (verified !== undefined) claims.verified = !!verified;

  try {
    await admin.auth().setCustomUserClaims(uid, claims);
    // Also mirror into users collection for convenience
    const docRef = admin.firestore().doc(`users/${uid}`);
    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (verified !== undefined) updateData.verified = !!verified;
    if (Object.keys(updateData).length) await docRef.set(updateData, { merge: true });
    return { success: true };
  } catch (err: any) {
    console.error('setUserRole error', err);
    throw new functions.https.HttpsError('internal', err.message || 'Error setting custom claims');
  }
});
