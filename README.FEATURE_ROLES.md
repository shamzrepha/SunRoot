# Feature: roles, verification, and responsive digital twin

This branch adds Firestore security rules, a Firebase Cloud Function to set roles/verified flags, migration & seed scripts, and frontend helper components for creating classes, sending recommendations, and a responsive Digital Twin component.

Important notes before deploying to production:

- Review and adapt firestore.rules to match your exact privacy model before publishing.
- Deploy Cloud Functions with `cd functions && npm install && npm run build && firebase deploy --only functions`.
- Scripts in `scripts/` require Google Application Credentials or running in an environment where admin SDK is authorized.
- The frontend components (src/components/*) are intentionally small and must be integrated into your app's routing and state management.

Testing checklist

1. Deploy rules and functions to staging.
2. Ensure admin user exists (custom claim role='admin') to call `setUserRole`.
3. Create a class as a teacher and verify it appears immediately in your UI.
4. Try deleting a class as a teacher (should be denied by rules).
5. Send a recommendation and verify it shows in admin dashboard.
6. Visit Digital Twin on different screen sizes to validate responsive layout.

