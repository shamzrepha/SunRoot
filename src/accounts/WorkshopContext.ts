// ---------------------------------------------------------------------------
// A student reaches the simulation ONLY by opening a specific classroom's
// "Open Workshop" button (see classes.ts) — there's no way into Farm/Circuit
// Lab/Coding Lab that skips a classroom. This module remembers which
// classroom that was, for exactly as long as the student stays inside the
// workshop screens, so progress syncs can be tagged to that class instead of
// being one global blob that mixes together every class a student is in.
//
// It's deliberately just an in-memory variable, not persisted — if a student
// refreshes mid-session, SaveManager's restoreAll() brings back their
// simulation state, but which classroom "launched" it is re-derived by
// whichever classroom they open Workshop from next. That's fine: it only
// matters for where the *next* sync gets tagged, not for anything already
// written.
// ---------------------------------------------------------------------------

let activeClassroomId: string | null = null

export function setActiveClassroom(classroomId: string | null) {
  activeClassroomId = classroomId
}

export function getActiveClassroom(): string | null {
  return activeClassroomId
}
