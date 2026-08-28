# SunRoot \u2014 accounts, dashboard, classes, teams & the refresh fix

This covers what changed in this drop, how to configure Firebase, and how to ship it.

## 1. What changed

**Bug fix (no new setup needed for this part):**
- `src/persistence/SaveManager.ts` \u2014 new. Snapshots `farm`, the circuit graph, the coding-lab Blockly workspace, the learner model, the scoreboard, and XP/badges/objectives to `localStorage` every 3s and on tab close/hide, and restores all of it before the first render on boot.
- `src/main.ts` \u2014 calls `restoreAll()` + `startAutosave()` in the auth gate.
- `src/screens/codingLab.ts` \u2014 the previously-unexported `savedWorkspace` variable now has `getSavedWorkspace`/`setSavedWorkspace` so SaveManager can reach it.
- `src/simulation/HardwareValidator.ts` \u2014 fixed a pre-existing type error (two references to `CONFIG` fields that don't exist) that was already breaking `npm run build` before any of this. It's dead code (that `CATALOGUE` constant isn't imported anywhere else), so this was a no-behavior-change fix.

**New accounts/classroom/team layer (needs Firebase \u2014 see \u00a72):**
- `src/accounts/` \u2014 Firebase init, auth service (signup/login/logout, unique student-tag generation), session store, classroom service (create/join/invite-by-tag/remove/leave, the seeded "SunRoot Original" public demo class), team service (create/join/shared realtime state).
- `src/screens/login.ts`, `dashboard.ts`, `classes.ts`, `findClass.ts` \u2014 new screens, wired into `appState.ts`'s `Screen` union and `main.ts`'s router/nav.
- `src/main.ts` now gates the whole app behind auth: not logged in \u2192 `login` screen; logged in \u2192 `dashboard` (the new landing page, replacing the old default-to-farm behavior) with "Continue building" one click away to the farm.

## 2. Firebase setup

1. [Firebase Console](https://console.firebase.google.com) \u2192 create a project (or use an existing one).
2. **Build \u2192 Authentication \u2192 Get started \u2192 Email/Password \u2192 Enable.**
3. **Build \u2192 Firestore Database \u2192 Create database** (production mode is fine \u2014 the rules below lock it down).
4. **Firestore \u2192 Rules** \u2192 paste in `firestore.rules` from this repo \u2192 Publish.
5. **Project settings \u2192 General \u2192 Your apps \u2192 Web app** (add one if none exists) \u2192 copy the config values into a `.env` file at the project root:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

6. Add the same six variables in **Netlify \u2192 Site settings \u2192 Environment variables** \u2014 Netlify builds don't see your local `.env`.

## 3. Ship it

From the root of your local SunRoot clone:

```bash
# 1. Confirm the new dependency is there (already in package.json in this drop)
npm install

# 2. Add your Firebase env vars locally (see \u00a72 above)
cp .env.example .env   # if you keep one; otherwise create .env by hand as shown above

# 3. Type-check + build locally before pushing
npm run build

# 4. Push \u2014 Netlify redeploys automatically since it's linked to GitHub
git add .
git commit -m "Add accounts, dashboard, classes, teams, and fix the refresh/data-loss bug"
git push origin main
```

One manual step that isn't part of the git push: publish `firestore.rules` in the Firebase console (\u00a72 step 4) *before* the deploy goes live, or every request will get a permissions error.

## 4. What's deliberately left for the next pass

- Real-time shared circuit *editing* inside a team (the team doc + realtime subscription exist in `TeamService.ts`; nothing in the circuit/coding screens writes to it yet).
- Teacher-side roll-up analytics across a whole classroom (per-student concept mastery already exists via the "Concept report" screen; classroom-wide aggregation across students doesn't yet, since that needs each student's `learner`/`score` state to sync to Firestore too, not just localStorage).
- Course/challenge assignment UI.
- Cross-device sync of the farm/circuit save itself (currently localStorage-only, tied to the browser \u2014 the same account on a second device won't see the same farm in progress). Extending `SaveManager` to also write to Firestore keyed by uid is a natural next step and reuses the exact same snapshot shape.
