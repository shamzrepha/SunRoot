export type MockFirebaseUser = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
  emailVerified?: boolean
  isAnonymous?: boolean
}

export type MockFirebaseSeed =
  | {
      collections?: Record<string, Record<string, Record<string, unknown>>>
      currentUser?: MockFirebaseUser | null
    }
  | Record<string, Record<string, Record<string, unknown>>>

type QueryConstraint =
  | { kind: 'where'; field: string | { __documentId: true }; op: string; value: unknown }
  | { kind: 'orderBy'; field: string | { __documentId: true }; direction: 'asc' | 'desc' }
  | { kind: 'limit'; count: number }
  | { kind: 'limitToLast'; count: number }
  | { kind: 'startAfter'; values: unknown[] }
  | { kind: 'endBefore'; values: unknown[] }

type DocRef = {
  __type: 'doc'
  path: string
  collectionPath: string
  id: string
}

type CollectionRef = {
  __type: 'collection'
  path: string
}

type QueryRef = {
  __type: 'query'
  collectionPath: string
  constraints: QueryConstraint[]
}

type SnapshotListener = {
  target: DocRef | CollectionRef | QueryRef
  onNext: (snap: unknown) => void
}

type Sentinel =
  | { __sentinel: 'serverTimestamp' }
  | { __sentinel: 'increment'; amount: number }
  | { __sentinel: 'arrayUnion'; items: unknown[] }
  | { __sentinel: 'arrayRemove'; items: unknown[] }

export type ViLike = {
  doMock?: (id: string, factory: () => unknown) => void
  resetModules?: () => void
  stubEnv?: (key: string, value: string) => void
  unstubAllEnvs?: () => void
  isFakeTimers?: () => boolean
  advanceTimersByTimeAsync?: (ms: number) => Promise<unknown>
}

export type MockFetchCall = {
  url: string
  method: string
  headers: Record<string, string>
  bodyText: string
  body: unknown
}

export type MockFetchRouteHandler =
  | Response
  | Record<string, unknown>
  | ((url: string, init?: RequestInit) => Response | Record<string, unknown> | Promise<Response | Record<string, unknown>>)

export type MockFetchRoutes =
  | Record<string, MockFetchRouteHandler>
  | ((url: string, init?: RequestInit) => Response | Record<string, unknown> | Promise<Response | Record<string, unknown>>)

export interface MockFetchController {
  fetch: typeof fetch
  calls: MockFetchCall[]
  install: () => void
  restore: () => void
  clearCalls: () => void
}

export interface BootSunRootOptions {
  user?: MockFirebaseUser | null
  profile?: Record<string, unknown> | null
  initialScreen?: string
  firebaseSeed?: MockFirebaseSeed
  fetchRoutes?: MockFetchRoutes
  waitForLoadingAnimation?: boolean
  timeoutMs?: number
  vi?: ViLike
}

export interface CleanupAppHarnessOptions {
  vi?: ViLike
}

export interface NavigateOptions {
  viaNavButton?: boolean
  timeoutMs?: number
}

export interface WaitSettledOptions {
  timeoutMs?: number
}

export interface SunRootAppHandle {
  root: HTMLElement
  goTo: (screen: string) => void
  appState: { screen: string; codeReady: boolean; runProgram: unknown }
  session: { user: MockFirebaseUser | null; profile: Record<string, unknown> | null }
  firebase: ReturnType<typeof createMockFirebase>
  fetchMock: MockFetchController
  navigateToScreen: (screen: string, options?: NavigateOptions) => Promise<void>
  waitForViewSettled: (options?: WaitSettledOptions) => Promise<void>
  cleanup: () => Promise<void>
}

const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

class MockTimestamp {
  seconds: number
  nanoseconds: number

  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  static now(): MockTimestamp {
    return MockTimestamp.fromMillis(Date.now())
  }

  static fromDate(date: Date): MockTimestamp {
    return MockTimestamp.fromMillis(date.getTime())
  }

  static fromMillis(ms: number): MockTimestamp {
    const seconds = Math.floor(ms / 1000)
    const nanoseconds = Math.max(0, (ms - seconds * 1000) * 1_000_000)
    return new MockTimestamp(seconds, nanoseconds)
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000)
  }

  toDate(): Date {
    return new Date(this.toMillis())
  }
}

function isVitestRuntime(): boolean {
  const g = globalThis as Record<string, unknown>
  return Boolean(
    (typeof process !== 'undefined' && process.env?.VITEST) || g.__vitest_worker__,
  )
}

async function getVitestApi(explicitVi?: ViLike): Promise<ViLike | null> {
  if (explicitVi) return explicitVi
  const g = globalThis as { vi?: ViLike }
  if (g.vi) return g.vi
  if (isVitestRuntime()) {
    try {
      const mod = (await import('vitest')) as unknown as { vi?: ViLike }
      return mod?.vi ?? null
    } catch {
      return null
    }
  }
  return null
}

function cloneValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value
  }
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (value instanceof MockTimestamp) return new MockTimestamp(value.seconds, value.nanoseconds) as T
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = cloneValue(v)
  }
  return out as T
}

function isSentinel(val: unknown): val is Sentinel {
  return typeof val === 'object' && val !== null && '__sentinel' in val
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return (
    val !== null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    !(val instanceof Date) &&
    !(val instanceof MockTimestamp)
  )
}

function isTimestampLike(
  val: unknown,
): val is MockTimestamp | Date | { toMillis: () => number } {
  return (
    val instanceof MockTimestamp ||
    val instanceof Date ||
    (typeof val === 'object' &&
      val !== null &&
      typeof (val as { toMillis?: unknown }).toMillis === 'function')
  )
}

function toEpochMillis(val: MockTimestamp | Date | { toMillis: () => number }): number {
  if (val instanceof Date) return val.getTime()
  return val.toMillis()
}

function canonicalEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }
  if (isTimestampLike(a) && isTimestampLike(b)) {
    return toEpochMillis(a) === toEpochMillis(b)
  }
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!canonicalEqual(a[i], b[i])) return false
    }
    return true
  }
  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined).sort()
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined).sort()
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]!
    if (k !== keysB[i]) return false
    if (!canonicalEqual(objA[k], objB[k])) return false
  }
  return true
}

function isComparableRangePair(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') {
    return !Number.isNaN(a) && !Number.isNaN(b)
  }
  if (typeof a === 'string' && typeof b === 'string') return true
  if (typeof a === 'boolean' && typeof b === 'boolean') return true
  if (isTimestampLike(a) && isTimestampLike(b)) return true
  return false
}

function getNestedField(obj: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function applyFieldUpdate(
  target: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
  deepMergeObjects = false,
): void {
  const parts = fieldPath.split('.')
  let cur: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    const next = cur[part]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cur[part] = {}
    }
    cur = cur[part] as Record<string, unknown>
  }
  const leaf = parts[parts.length - 1]!
  const prev = cur[leaf]

  if (isSentinel(value)) {
    if (value.__sentinel === 'serverTimestamp') {
      cur[leaf] = MockTimestamp.now()
    } else if (value.__sentinel === 'increment') {
      cur[leaf] = (typeof prev === 'number' ? prev : 0) + value.amount
    } else if (value.__sentinel === 'arrayUnion') {
      const existing = Array.isArray(prev) ? [...prev] : []
      for (const item of value.items) {
        if (!existing.some((x) => canonicalEqual(x, item))) {
          existing.push(cloneValue(item))
        }
      }
      cur[leaf] = existing
    } else if (value.__sentinel === 'arrayRemove') {
      const existing = Array.isArray(prev) ? prev : []
      cur[leaf] = existing.filter(
        (x) => !value.items.some((rem) => canonicalEqual(x, rem)),
      )
    }
    return
  }

  if (isPlainObject(value)) {
    const resolved: Record<string, unknown> =
      deepMergeObjects && isPlainObject(prev) ? cloneValue(prev) : {}
    for (const [k, v] of Object.entries(value)) {
      applyFieldUpdate(resolved, k, v, deepMergeObjects)
    }
    cur[leaf] = resolved
    return
  }

  cur[leaf] = cloneValue(value)
}

function compareValues(a: unknown, b: unknown): number {
  const norm = (v: unknown): number | string => {
    if (isTimestampLike(v)) return toEpochMillis(v)
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (v === null || v === undefined) return ''
    return String(v)
  }
  const na = norm(a)
  const nb = norm(b)
  if (typeof na === 'number' && typeof nb === 'number') return na - nb
  return String(na).localeCompare(String(nb))
}

function matchesWhere(
  docId: string,
  docData: Record<string, unknown>,
  constraint: Extract<QueryConstraint, { kind: 'where' }>,
): boolean {
  const fieldVal =
    typeof constraint.field === 'object' && constraint.field.__documentId
      ? docId
      : getNestedField(docData, constraint.field as string)
  const target = constraint.value

  switch (constraint.op) {
    case '==':
      return canonicalEqual(fieldVal, target)
    case '!=':
      return !canonicalEqual(fieldVal, target)
    case '<':
      return isComparableRangePair(fieldVal, target) && compareValues(fieldVal, target) < 0
    case '<=':
      return isComparableRangePair(fieldVal, target) && compareValues(fieldVal, target) <= 0
    case '>':
      return isComparableRangePair(fieldVal, target) && compareValues(fieldVal, target) > 0
    case '>=':
      return isComparableRangePair(fieldVal, target) && compareValues(fieldVal, target) >= 0
    case 'in':
      return Array.isArray(target) && target.some((item) => canonicalEqual(item, fieldVal))
    case 'not-in':
      return Array.isArray(target) && !target.some((item) => canonicalEqual(item, fieldVal))
    case 'array-contains':
      return (
        Array.isArray(fieldVal) &&
        fieldVal.some((item) => canonicalEqual(item, target))
      )
    case 'array-contains-any':
      return (
        Array.isArray(fieldVal) &&
        Array.isArray(target) &&
        target.some((t) => fieldVal.some((item) => canonicalEqual(item, t)))
      )
    default:
      return true
  }
}

export function createMockFirebase(seedData?: MockFirebaseSeed) {
  const store = new Map<string, Map<string, Record<string, unknown>>>()
  const authListeners = new Set<(user: MockFirebaseUser | null) => void>()
  const snapshotListeners = new Set<SnapshotListener>()
  let reads = 0
  let writes = 0
  let autoIdSeq = 0

  const extractSeed = (seed?: MockFirebaseSeed) => {
    if (!seed) return { collections: {}, currentUser: null as MockFirebaseUser | null }
    if ('collections' in seed || 'currentUser' in seed) {
      const s = seed as {
        collections?: Record<string, Record<string, Record<string, unknown>>>
        currentUser?: MockFirebaseUser | null
      }
      return {
        collections: s.collections ?? {},
        currentUser: s.currentUser ?? null,
      }
    }
    return {
      collections: seed as Record<string, Record<string, Record<string, unknown>>>,
      currentUser: null as MockFirebaseUser | null,
    }
  }

  let initial = extractSeed(seedData)
  let currentUser: MockFirebaseUser | null = initial.currentUser ? { ...initial.currentUser } : null

  const getColMap = (colPath: string): Map<string, Record<string, unknown>> => {
    let col = store.get(colPath)
    if (!col) {
      col = new Map()
      store.set(colPath, col)
    }
    return col
  }

  const seedStore = (collections: Record<string, Record<string, Record<string, unknown>>>) => {
    store.clear()
    for (const [colPath, docs] of Object.entries(collections)) {
      const col = getColMap(colPath)
      for (const [docId, docData] of Object.entries(docs)) {
        col.set(docId, cloneValue(docData))
      }
    }
  }

  seedStore(initial.collections)

  const makeDocSnapshot = (ref: DocRef, raw: Record<string, unknown> | undefined) => {
    const existsFlag = raw !== undefined
    const cloned = raw !== undefined ? cloneValue(raw) : undefined
    return {
      id: ref.id,
      ref,
      exists: () => existsFlag,
      data: () => (cloned ? cloneValue(cloned) : undefined),
      get: (field: string) => (cloned ? cloneValue(getNestedField(cloned, field)) : undefined),
    }
  }

  const runQuery = (target: CollectionRef | QueryRef) => {
    const colPath = target.__type === 'collection' ? target.path : target.collectionPath
    const constraints = target.__type === 'query' ? target.constraints : []
    const col = getColMap(colPath)

    let entries = Array.from(col.entries()).map(([id, data]) => ({
      id,
      data: cloneValue(data),
    }))

    for (const c of constraints) {
      if (c.kind === 'where') {
        entries = entries.filter((e) => matchesWhere(e.id, e.data, c))
      }
    }

    const orders = constraints.filter(
      (c): c is Extract<QueryConstraint, { kind: 'orderBy' }> => c.kind === 'orderBy',
    )
    if (orders.length > 0) {
      entries.sort((a, b) => {
        for (const ord of orders) {
          const av =
            typeof ord.field === 'object' && ord.field.__documentId
              ? a.id
              : getNestedField(a.data, ord.field as string)
          const bv =
            typeof ord.field === 'object' && ord.field.__documentId
              ? b.id
              : getNestedField(b.data, ord.field as string)
          const cmp = compareValues(av, bv)
          if (cmp !== 0) return ord.direction === 'desc' ? -cmp : cmp
        }
        return 0
      })
    }

    const isDocSnapCursor = (
      val: unknown,
    ): val is { id: string; data: () => Record<string, unknown> | undefined } =>
      Boolean(
        val &&
          typeof val === 'object' &&
          'id' in val &&
          'data' in val &&
          typeof (val as { data: unknown }).data === 'function',
      )

    const extractCursorVal = (
      values: unknown[],
      idx: number,
      snapCursor: { id: string; data: () => Record<string, unknown> | undefined } | null,
    ): unknown => {
      const ord = orders[idx]
      if (snapCursor) {
        if (!ord) return snapCursor.id
        if (typeof ord.field === 'object' && ord.field.__documentId) return snapCursor.id
        return getNestedField(snapCursor.data() ?? {}, ord.field as string)
      }
      return values[idx]
    }

    const compareEntryWithCursor = (
      entry: { id: string; data: Record<string, unknown> },
      values: unknown[],
    ): number => {
      const snapCursor =
        values.length === 1 && isDocSnapCursor(values[0]) ? values[0] : null
      const tupleLen = snapCursor
        ? orders.length
        : Math.min(orders.length, values.length)
      for (let i = 0; i < tupleLen; i++) {
        const ord = orders[i]!
        const ev =
          typeof ord.field === 'object' && ord.field.__documentId
            ? entry.id
            : getNestedField(entry.data, ord.field as string)
        const cursor = extractCursorVal(values, i, snapCursor)
        const cmp = compareValues(ev, cursor)
        if (cmp !== 0) {
          return ord.direction === 'desc' ? -cmp : cmp
        }
      }
      return 0
    }

    for (const c of constraints) {
      if (c.kind === 'startAfter' && orders.length > 0 && c.values.length > 0) {
        entries = entries.filter((e) => compareEntryWithCursor(e, c.values) > 0)
      } else if (c.kind === 'endBefore' && orders.length > 0 && c.values.length > 0) {
        entries = entries.filter((e) => compareEntryWithCursor(e, c.values) < 0)
      }
    }

    for (const c of constraints) {
      if (c.kind === 'limit') {
        entries = entries.slice(0, Math.max(0, c.count))
      } else if (c.kind === 'limitToLast') {
        entries = c.count <= 0 ? [] : entries.slice(-c.count)
      }
    }

    const docs = entries.map((e) =>
      makeDocSnapshot(
        {
          __type: 'doc',
          path: `${colPath}/${e.id}`,
          collectionPath: colPath,
          id: e.id,
        },
        e.data,
      ),
    )

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (cb: (docSnap: (typeof docs)[number]) => void) => {
        for (const d of docs) cb(d)
      },
    }
  }

  const notifySnapshotsForCollection = (colPath: string) => {
    for (const listener of [...snapshotListeners]) {
      const t = listener.target
      if (t.__type === 'doc' && t.collectionPath === colPath) {
        const raw = getColMap(colPath).get(t.id)
        listener.onNext(makeDocSnapshot(t, raw))
      } else if (t.__type === 'collection' && t.path === colPath) {
        listener.onNext(runQuery(t))
      } else if (t.__type === 'query' && t.collectionPath === colPath) {
        listener.onNext(runQuery(t))
      }
    }
  }

  const appInstance = { name: '[DEFAULT]', options: { projectId: 'sunroot-e2e-mock' } }

  const authObj: {
    app: typeof appInstance
    currentUser: MockFirebaseUser | null
    languageCode: string | null
  } = {
    app: appInstance,
    get currentUser() {
      return currentUser
    },
    set currentUser(val: MockFirebaseUser | null) {
      currentUser = val
    },
    languageCode: 'en',
  }

  const dbObj = {
    app: appInstance,
    type: 'firestore',
  }

  const triggerAuthChange = (user: MockFirebaseUser | null) => {
    currentUser = user ? { ...user } : null
    for (const cb of [...authListeners]) {
      cb(currentUser ? { ...currentUser } : null)
    }
  }

  const appModule = {
    initializeApp: (options?: Record<string, unknown>, name?: string) => ({
      name: name ?? '[DEFAULT]',
      options: options ?? appInstance.options,
    }),
    getApps: () => [appInstance],
    getApp: () => appInstance,
    deleteApp: async () => {},
  }

  class MockGoogleAuthProvider {
    addScope() {
      return this
    }
    setCustomParameters() {
      return this
    }
  }

  const authModule = {
    getAuth: () => authObj,
    setPersistence: async () => {},
    browserLocalPersistence: { type: 'LOCAL' },
    inMemoryPersistence: { type: 'NONE' },
    GoogleAuthProvider: MockGoogleAuthProvider,
    onAuthStateChanged: (_auth: unknown, callback: (user: MockFirebaseUser | null) => void) => {
      authListeners.add(callback)
      queueMicrotask(() => {
        if (authListeners.has(callback)) {
          callback(currentUser ? { ...currentUser } : null)
        }
      })
      return () => {
        authListeners.delete(callback)
      }
    },
    signInWithEmailAndPassword: async (_auth: unknown, email: string, _password: string) => {
      const usersCol = getColMap('users')
      let matched: MockFirebaseUser | null = null
      for (const [uid, data] of usersCol.entries()) {
        if (data.email === email) {
          matched = {
            uid,
            email,
            displayName: typeof data.displayName === 'string' ? data.displayName : email,
          }
          break
        }
      }
      const user = matched ?? {
        uid: `uid-${email.replace(/[^a-z0-9]/gi, '_')}`,
        email,
        displayName: email.split('@')[0] ?? 'User',
      }
      triggerAuthChange(user)
      return { user }
    },
    createUserWithEmailAndPassword: async (_auth: unknown, email: string, _password: string) => {
      const uid = `uid-${++autoIdSeq}`
      const user: MockFirebaseUser = {
        uid,
        email,
        displayName: email.split('@')[0] ?? 'User',
      }
      triggerAuthChange(user)
      return { user }
    },
    signInWithPopup: async () => {
      const user: MockFirebaseUser = currentUser ?? {
        uid: `google-${++autoIdSeq}`,
        email: 'google-learner@sunroot.test',
        displayName: 'Google Learner',
      }
      triggerAuthChange(user)
      return { user }
    },
    sendPasswordResetEmail: async () => {},
    updatePassword: async () => {},
    signOut: async () => {
      triggerAuthChange(null)
    },
    updateProfile: async (user: MockFirebaseUser, updates: Partial<MockFirebaseUser>) => {
      if (updates.displayName !== undefined) user.displayName = updates.displayName
      if (updates.photoURL !== undefined) user.photoURL = updates.photoURL
      if (currentUser && currentUser.uid === user.uid) {
        currentUser = { ...currentUser, ...updates }
      }
    },
  }

  const makeCollectionRef = (
    parentOrPath: unknown,
    ...segments: string[]
  ): CollectionRef => {
    const base =
      typeof parentOrPath === 'object' &&
      parentOrPath !== null &&
      'path' in parentOrPath &&
      typeof (parentOrPath as { path: unknown }).path === 'string'
        ? (parentOrPath as { path: string }).path
        : ''
    const parts = [base, ...segments].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '')
    return { __type: 'collection', path: parts }
  }

  const makeDocRef = (parent: unknown, ...segments: string[]): DocRef => {
    if (
      typeof parent === 'object' &&
      parent !== null &&
      (parent as { __type?: string }).__type === 'collection'
    ) {
      const colRef = parent as CollectionRef
      const id = segments[0] ?? `auto-${++autoIdSeq}`
      const rest = segments.slice(1)
      const fullPath = [colRef.path, id, ...rest].filter(Boolean).join('/')
      const split = fullPath.split('/')
      const docId = split[split.length - 1]!
      const colPath = split.slice(0, -1).join('/')
      return { __type: 'doc', path: fullPath, collectionPath: colPath, id: docId }
    }

    const base =
      typeof parent === 'object' &&
      parent !== null &&
      'path' in parent &&
      typeof (parent as { path: unknown }).path === 'string'
        ? (parent as { path: string }).path
        : ''
    const fullPath = [base, ...segments].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '')
    const split = fullPath.split('/')
    const docId = split.length % 2 === 0 ? split[split.length - 1]! : `auto-${++autoIdSeq}`
    const colPath = split.length % 2 === 0 ? split.slice(0, -1).join('/') : split.join('/')
    return {
      __type: 'doc',
      path: `${colPath}/${docId}`,
      collectionPath: colPath,
      id: docId,
    }
  }

  const writeDocMerge = (
    ref: DocRef,
    data: Record<string, unknown>,
    merge: boolean,
    deepMergeObjects = merge,
  ) => {
    const col = getColMap(ref.collectionPath)
    const base: Record<string, unknown> = merge ? cloneValue(col.get(ref.id) ?? {}) : {}
    for (const [k, v] of Object.entries(data)) {
      applyFieldUpdate(base, k, v, deepMergeObjects)
    }
    col.set(ref.id, base)
    writes++
  }

  const firestoreModule = {
    getFirestore: () => dbObj,
    Timestamp: MockTimestamp,
    collection: (dbOrRef: unknown, ...segments: string[]) => makeCollectionRef(dbOrRef, ...segments),
    doc: (dbOrRef: unknown, ...segments: string[]) => makeDocRef(dbOrRef, ...segments),
    getDoc: async (ref: DocRef) => {
      reads++
      const raw = getColMap(ref.collectionPath).get(ref.id)
      return makeDocSnapshot(ref, raw)
    },
    getDocs: async (target: CollectionRef | QueryRef) => {
      const snap = runQuery(target)
      reads += Math.max(1, snap.size)
      return snap
    },
    setDoc: async (
      ref: DocRef,
      data: Record<string, unknown>,
      options?: { merge?: boolean },
    ) => {
      const merge = Boolean(options?.merge)
      writeDocMerge(ref, data, merge, merge)
      notifySnapshotsForCollection(ref.collectionPath)
    },
    addDoc: async (colRef: CollectionRef, data: Record<string, unknown>) => {
      const docRef = makeDocRef(colRef, `auto-${++autoIdSeq}`)
      writeDocMerge(docRef, data, false, false)
      notifySnapshotsForCollection(colRef.path)
      return docRef
    },
    updateDoc: async (ref: DocRef, data: Record<string, unknown>) => {
      const col = getColMap(ref.collectionPath)
      const existing = col.get(ref.id)
      if (!existing) {
        throw new Error(`No document to update at ${ref.path}`)
      }
      writeDocMerge(ref, data, true, false)
      notifySnapshotsForCollection(ref.collectionPath)
    },
    deleteDoc: async (ref: DocRef) => {
      getColMap(ref.collectionPath).delete(ref.id)
      writes++
      notifySnapshotsForCollection(ref.collectionPath)
    },
    query: (target: CollectionRef | QueryRef, ...constraints: QueryConstraint[]) => {
      const basePath = target.__type === 'collection' ? target.path : target.collectionPath
      const prevConstraints = target.__type === 'query' ? target.constraints : []
      return {
        __type: 'query' as const,
        collectionPath: basePath,
        constraints: [...prevConstraints, ...constraints],
      }
    },
    where: (
      field: string | { __documentId: true },
      op: string,
      value: unknown,
    ): QueryConstraint => ({
      kind: 'where',
      field,
      op,
      value,
    }),
    orderBy: (
      field: string | { __documentId: true },
      direction: 'asc' | 'desc' = 'asc',
    ): QueryConstraint => ({
      kind: 'orderBy',
      field,
      direction,
    }),
    limit: (count: number): QueryConstraint => ({ kind: 'limit', count }),
    limitToLast: (count: number): QueryConstraint => ({ kind: 'limitToLast', count }),
    startAfter: (...values: unknown[]): QueryConstraint => ({ kind: 'startAfter', values }),
    endBefore: (...values: unknown[]): QueryConstraint => ({ kind: 'endBefore', values }),
    documentId: () => ({ __documentId: true }),
    arrayUnion: (...items: unknown[]): Sentinel => ({ __sentinel: 'arrayUnion', items }),
    arrayRemove: (...items: unknown[]): Sentinel => ({ __sentinel: 'arrayRemove', items }),
    increment: (amount: number): Sentinel => ({ __sentinel: 'increment', amount }),
    serverTimestamp: (): Sentinel => ({ __sentinel: 'serverTimestamp' }),
    writeBatch: () => {
      const ops: Array<() => string> = []
      const batch = {
        set: (ref: DocRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          ops.push(() => {
            const merge = Boolean(options?.merge)
            writeDocMerge(ref, data, merge, merge)
            return ref.collectionPath
          })
          return batch
        },
        update: (ref: DocRef, data: Record<string, unknown>) => {
          ops.push(() => {
            const col = getColMap(ref.collectionPath)
            if (!col.get(ref.id)) {
              throw new Error(`No document to update at ${ref.path}`)
            }
            writeDocMerge(ref, data, true, false)
            return ref.collectionPath
          })
          return batch
        },
        delete: (ref: DocRef) => {
          ops.push(() => {
            getColMap(ref.collectionPath).delete(ref.id)
            writes++
            return ref.collectionPath
          })
          return batch
        },
        commit: async () => {
          const backup = new Map<string, Map<string, Record<string, unknown>>>()
          for (const [colKey, colMap] of store.entries()) {
            const copy = new Map<string, Record<string, unknown>>()
            for (const [docId, docData] of colMap.entries()) {
              copy.set(docId, cloneValue(docData))
            }
            backup.set(colKey, copy)
          }
          const prevWrites = writes
          try {
            const touched = new Set<string>()
            for (const op of ops) {
              touched.add(op())
            }
            for (const colPath of touched) {
              notifySnapshotsForCollection(colPath)
            }
          } catch (err) {
            store.clear()
            for (const [colKey, colMap] of backup.entries()) {
              store.set(colKey, colMap)
            }
            writes = prevWrites
            throw err
          }
        },
      }
      return batch
    },
    onSnapshot: (
      target: DocRef | CollectionRef | QueryRef,
      onNext: (snap: unknown) => void,
    ) => {
      const entry: SnapshotListener = { target, onNext }
      snapshotListeners.add(entry)
      queueMicrotask(() => {
        if (!snapshotListeners.has(entry)) return
        if (target.__type === 'doc') {
          reads++
          onNext(makeDocSnapshot(target, getColMap(target.collectionPath).get(target.id)))
        } else {
          const snap = runQuery(target)
          reads += Math.max(1, snap.size)
          onNext(snap)
        }
      })
      return () => {
        snapshotListeners.delete(entry)
      }
    },
  }

  const registerWithVitest = (vi: ViLike | null) => {
    if (!vi?.doMock) return false
    vi.doMock('firebase/app', () => appModule)
    vi.doMock('firebase/auth', () => authModule)
    vi.doMock('firebase/firestore', () => firestoreModule)
    return true
  }

  const reset = (nextSeed?: MockFirebaseSeed) => {
    initial = extractSeed(nextSeed ?? seedData)
    currentUser = initial.currentUser ? { ...initial.currentUser } : null
    authListeners.clear()
    snapshotListeners.clear()
    reads = 0
    writes = 0
    seedStore(initial.collections)
  }

  return {
    app: appInstance,
    auth: authObj,
    db: dbObj,
    store,
    appModule,
    authModule,
    firestoreModule,
    triggerAuthChange,
    registerWithVitest,
    reset,
    getReads: () => reads,
    getWrites: () => writes,
  }
}

function toJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalizeFetchHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  new Headers(headers).forEach((v, k) => {
    out[k.toLowerCase()] = v
  })
  return out
}

export function createMockFetch(routes?: MockFetchRoutes): MockFetchController {
  const calls: MockFetchCall[] = []
  let originalFetch: typeof fetch | null = null
  let installed = false

  const defaultAskResponse = (parsedBody: unknown) => {
    const req = (parsedBody && typeof parsedBody === 'object' ? parsedBody : {}) as {
      tier?: string
      model?: string
    }
    const tier = req.tier ?? 'flash'
    const model = req.model ?? 'gemini-2.5-flash'
    return toJsonResponse({
      choices: [{ message: { content: 'SunRoot AI mock response' } }],
      usage: { prompt_tokens: 18, completion_tokens: 12, total_tokens: 30 },
      sunrootMeta: {
        tier,
        model,
        provider: 'gemini',
        promptTokens: 18,
        completionTokens: 12,
        totalTokens: 30,
        estimatedUsd: 0.000035,
        usageEstimated: false,
      },
    })
  }

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = normalizeFetchHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    let bodyText = ''
    if (typeof init?.body === 'string') {
      bodyText = init.body
    } else if (init?.body != null) {
      if (init.body instanceof Uint8Array || init.body instanceof ArrayBuffer) {
        bodyText = new TextDecoder().decode(init.body)
      } else if (typeof (init.body as Blob).text === 'function') {
        bodyText = await (init.body as Blob).text()
      } else {
        bodyText = String(init.body)
      }
    } else if (input instanceof Request) {
      try {
        bodyText = await input.clone().text()
      } catch {
        bodyText = ''
      }
    }
    let parsedBody: unknown = null
    if (bodyText) {
      try {
        parsedBody = JSON.parse(bodyText)
      } catch {
        parsedBody = null
      }
    }

    calls.push({ url, method, headers, bodyText, body: parsedBody })

    if (typeof routes === 'function') {
      const result = await routes(url, init)
      return result instanceof Response ? result : toJsonResponse(result)
    }

    if (routes && typeof routes === 'object') {
      const exact = routes[url]
      const matchedKey =
        exact !== undefined
          ? url
          : Object.keys(routes).find((pattern) => url === pattern || url.includes(pattern))
      const handler = matchedKey !== undefined ? routes[matchedKey] : undefined
      if (handler !== undefined) {
        if (typeof handler === 'function') {
          const result = await handler(url, init)
          return result instanceof Response ? result : toJsonResponse(result)
        }
        return handler instanceof Response ? handler.clone() : toJsonResponse(handler)
      }
    }

    if (url.includes('/api/ask') || url.includes('/.netlify/functions/ask')) {
      return defaultAskResponse(parsedBody)
    }

    return toJsonResponse({ error: `Unhandled mock fetch URL: ${url}` }, 404)
  }) as typeof fetch

  const install = () => {
    if (installed) return
    originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch
    installed = true
  }

  const restore = () => {
    if (!installed) return
    globalThis.fetch = originalFetch as typeof fetch
    originalFetch = null
    installed = false
  }

  return {
    fetch: mockFetch,
    calls,
    install,
    restore,
    clearCalls: () => {
      calls.length = 0
    },
  }
}

type TrackerState = {
  intervals: Set<ReturnType<typeof setInterval>>
  timeouts: Set<ReturnType<typeof setTimeout>>
  rafs: Set<number>
  windowListeners: Array<{ target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }>
  restore: () => void
  clearPendingTimersAndListeners: () => void
  clearActiveIntervalsAndTimeouts: () => void
}

function installGlobalTrackers(): TrackerState {
  const intervals = new Set<ReturnType<typeof setInterval>>()
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const rafs = new Set<number>()
  const windowListeners: TrackerState['windowListeners'] = []

  const origSetInterval = globalThis.setInterval
  const origClearInterval = globalThis.clearInterval
  const origSetTimeout = globalThis.setTimeout
  const origClearTimeout = globalThis.clearTimeout
  const origRaf = globalThis.requestAnimationFrame
  const origCaf = globalThis.cancelAnimationFrame
  const origWinAdd = typeof window !== 'undefined' ? window.addEventListener.bind(window) : null
  const origWinRem = typeof window !== 'undefined' ? window.removeEventListener.bind(window) : null
  const origDocAdd = typeof document !== 'undefined' ? document.addEventListener.bind(document) : null
  const origDocRem = typeof document !== 'undefined' ? document.removeEventListener.bind(document) : null

  globalThis.setInterval = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    const id = (origSetInterval as unknown as (...a: unknown[]) => ReturnType<typeof setInterval>)(
      fn,
      delay,
      ...args,
    )
    intervals.add(id)
    return id
  }) as unknown as typeof setInterval

  globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
    if (id !== undefined) intervals.delete(id)
    return (origClearInterval as unknown as (id?: ReturnType<typeof setInterval>) => void)(id)
  }) as unknown as typeof clearInterval

  globalThis.setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    const id = (origSetTimeout as unknown as (...a: unknown[]) => ReturnType<typeof setTimeout>)(
      fn,
      delay,
      ...args,
    )
    timeouts.add(id)
    return id
  }) as unknown as typeof setTimeout

  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    if (id !== undefined) timeouts.delete(id)
    return (origClearTimeout as unknown as (id?: ReturnType<typeof setTimeout>) => void)(id)
  }) as unknown as typeof clearTimeout

  if (typeof origRaf === 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = origRaf(cb)
      rafs.add(id)
      return id
    }) as typeof requestAnimationFrame
  }

  if (typeof origCaf === 'function') {
    globalThis.cancelAnimationFrame = ((id: number) => {
      rafs.delete(id)
      return origCaf(id)
    }) as typeof cancelAnimationFrame
  }

  if (typeof window !== 'undefined' && origWinAdd) {
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      windowListeners.push({ target: window, type, listener, options })
      return origWinAdd(type, listener, options)
    }) as typeof window.addEventListener
  }

  if (typeof document !== 'undefined' && origDocAdd) {
    document.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      windowListeners.push({ target: document, type, listener, options })
      return origDocAdd(type, listener, options)
    }) as typeof document.addEventListener
  }

  const clearActiveIntervalsAndTimeouts = () => {
    for (const id of [...intervals]) origClearInterval(id)
    intervals.clear()
    for (const id of [...timeouts]) origClearTimeout(id)
    timeouts.clear()
    if (typeof origCaf === 'function') {
      for (const id of [...rafs]) origCaf(id)
    }
    rafs.clear()
  }

  const clearPendingTimersAndListeners = () => {
    clearActiveIntervalsAndTimeouts()
    for (const entry of windowListeners) {
      if (entry.target === window && origWinRem) {
        origWinRem(entry.type, entry.listener, entry.options)
      } else if (entry.target === document && origDocRem) {
        origDocRem(entry.type, entry.listener, entry.options)
      }
    }
    windowListeners.length = 0
  }

  const restore = () => {
    clearPendingTimersAndListeners()
    globalThis.setInterval = origSetInterval
    globalThis.clearInterval = origClearInterval
    globalThis.setTimeout = origSetTimeout
    globalThis.clearTimeout = origClearTimeout
    if (origRaf) globalThis.requestAnimationFrame = origRaf
    if (origCaf) globalThis.cancelAnimationFrame = origCaf
    if (typeof window !== 'undefined' && origWinAdd) window.addEventListener = origWinAdd
    if (typeof document !== 'undefined' && origDocAdd) document.addEventListener = origDocAdd
  }

  return {
    intervals,
    timeouts,
    rafs,
    windowListeners,
    restore,
    clearPendingTimersAndListeners,
    clearActiveIntervalsAndTimeouts,
  }
}

function saveAndPatchProp(
  target: object,
  prop: string | symbol,
  value: unknown,
  restorers: Array<() => void>,
): void {
  const hadOwn = Object.prototype.hasOwnProperty.call(target, prop)
  const prevDesc = Object.getOwnPropertyDescriptor(target, prop)
  try {
    Object.defineProperty(target, prop, {
      configurable: true,
      writable: true,
      enumerable: prevDesc ? prevDesc.enumerable : true,
      value,
    })
  } catch {
    ;(target as Record<string | symbol, unknown>)[prop] = value
  }
  restorers.push(() => {
    try {
      if (hadOwn && prevDesc) {
        Object.defineProperty(target, prop, prevDesc)
      } else if (!hadOwn) {
        delete (target as Record<string | symbol, unknown>)[prop]
      }
    } catch {
      // Ignore non-configurable property restoration failures
    }
  })
}

function installJsdomStubs(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const restorers: Array<() => void> = []
  const g = globalThis as Record<string, unknown>

  if (typeof g.AudioContext !== 'function') {
    const FakeAudioContext = function FakeAudioContext() {
      return {
        state: 'running',
        currentTime: 0,
        destination: {},
        resume: async () => {},
        close: async () => {},
        createOscillator: () => ({
          type: 'sine',
          frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }),
        createGain: () => ({
          gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          connect: () => {},
        }),
      }
    }
    saveAndPatchProp(g, 'AudioContext', FakeAudioContext, restorers)
    saveAndPatchProp(g, 'webkitAudioContext', FakeAudioContext, restorers)
  }

  if (typeof g.SpeechSynthesisUtterance !== 'function') {
    const FakeUtterance = function SpeechSynthesisUtterance(text = '') {
      return {
        text,
        lang: 'en-US',
        rate: 1,
        pitch: 1,
        volume: 1,
        onend: null,
        onerror: null,
      }
    }
    saveAndPatchProp(g, 'SpeechSynthesisUtterance', FakeUtterance, restorers)
  }

  if (!('speechSynthesis' in window) || !window.speechSynthesis) {
    saveAndPatchProp(
      window,
      'speechSynthesis',
      {
        speaking: false,
        pending: false,
        paused: false,
        speak: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        getVoices: () => [],
      },
      restorers,
    )
  }

  if (typeof window.matchMedia !== 'function') {
    saveAndPatchProp(
      window,
      'matchMedia',
      (queryStr: string) =>
        ({
          matches: false,
          media: queryStr,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
      restorers,
    )
  }

  if (typeof g.ResizeObserver !== 'function') {
    saveAndPatchProp(
      g,
      'ResizeObserver',
      function ResizeObserver() {
        return {
          observe: () => {},
          unobserve: () => {},
          disconnect: () => {},
        }
      },
      restorers,
    )
  }

  if (typeof g.IntersectionObserver !== 'function') {
    saveAndPatchProp(
      g,
      'IntersectionObserver',
      function IntersectionObserver() {
        return {
          observe: () => {},
          unobserve: () => {},
          disconnect: () => {},
          takeRecords: () => [],
        }
      },
      restorers,
    )
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    const stubCtx2d = {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      roundRect: () => {},
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '12px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
    }
    saveAndPatchProp(
      HTMLCanvasElement.prototype,
      'getContext',
      (() => stubCtx2d) as unknown as typeof HTMLCanvasElement.prototype.getContext,
      restorers,
    )
  }

  if (typeof HTMLMediaElement !== 'undefined') {
    saveAndPatchProp(HTMLMediaElement.prototype, 'play', () => Promise.resolve(), restorers)
    saveAndPatchProp(HTMLMediaElement.prototype, 'pause', () => {}, restorers)
    saveAndPatchProp(HTMLMediaElement.prototype, 'load', () => {}, restorers)
  }

  if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    saveAndPatchProp(Element.prototype, 'scrollIntoView', () => {}, restorers)
  }

  if (typeof window.scrollTo !== 'function') {
    saveAndPatchProp(window, 'scrollTo', () => {}, restorers)
  }

  return () => {
    for (let i = restorers.length - 1; i >= 0; i--) {
      restorers[i]!()
    }
  }
}

async function advanceOrWait(ms: number, vi: ViLike | null): Promise<void> {
  if (vi?.isFakeTimers?.() && vi.advanceTimersByTimeAsync) {
    await vi.advanceTimersByTimeAsync(ms)
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
  }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve()
  }
}

interface ActiveHarnessContext {
  tracker: TrackerState
  restoreStubs: () => void
  fetchMock: MockFetchController
  vi: ViLike | null
  goTo: ((screen: string) => void) | null
  appState: { screen: string; codeReady: boolean; runProgram: unknown } | null
  envBackup: Map<string, { existed: boolean; value: string | undefined }>
}

let activeContext: ActiveHarnessContext | null = null

export async function waitForViewSettled(options: WaitSettledOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 3000
  const vi = activeContext?.vi ?? (await getVitestApi())

  // transitionView uses a 160ms timeout before rendering into #view and removing .fading
  await advanceOrWait(180, vi)
  await flushMicrotasks(8)

  const isViewReady = (view: Element | null): boolean => {
    if (!view) return true
    if (view.classList.contains('fading')) return false
    if (view.querySelector('.lazy-load') !== null) return false
    if (activeContext?.appState?.screen === 'workshopHub' && view.children.length === 0) {
      return false
    }
    return true
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const view = typeof document !== 'undefined' ? document.querySelector('#view') : null
    if (isViewReady(view)) {
      // Allow dynamic import callbacks and React island mounts one more turn to commit
      await advanceOrWait(15, vi)
      await flushMicrotasks(8)
      const viewAfter = typeof document !== 'undefined' ? document.querySelector('#view') : null
      if (isViewReady(viewAfter)) {
        return
      }
    }

    await advanceOrWait(20, vi)
    await flushMicrotasks(4)
  }
}

export async function navigateToScreen(
  screen: string,
  options: NavigateOptions = {},
): Promise<void> {
  if (!activeContext?.goTo) {
    throw new Error('navigateToScreen() called before bootSunRootApp().')
  }

  if (options.viaNavButton && typeof document !== 'undefined') {
    const btn = document.querySelector<HTMLButtonElement>(`#navList [data-nav="${screen}"]`)
    if (btn && !btn.disabled) {
      btn.click()
      await waitForViewSettled({ timeoutMs: options.timeoutMs })
      return
    }
  }

  activeContext.goTo(screen)
  await waitForViewSettled({ timeoutMs: options.timeoutMs })
}

export async function cleanupAppHarness(options?: CleanupAppHarnessOptions): Promise<void> {
  const ctx = activeContext
  activeContext = null

  const vi = options?.vi ?? ctx?.vi ?? (await getVitestApi())

  if (ctx) {
    try {
      const farmMod = (await import('../../../src/screens/farm')) as { stopFarmLoop?: () => void }
      farmMod.stopFarmLoop?.()
    } catch {
      // Module may not be loaded
    }

    try {
      const onboardMod = (await import('../../../src/ui/Onboarding')) as { endOnboarding?: () => void }
      onboardMod.endOnboarding?.()
    } catch {
      // Module may not be loaded
    }

    try {
      const reactMountMod = (await import('../../../src/ui/reactMount')) as {
        unmountActiveScreenIsland?: () => void
      }
      reactMountMod.unmountActiveScreenIsland?.()
    } catch {
      // Module may not be loaded
    }

    ctx.tracker.restore()
    ctx.restoreStubs()
    ctx.fetchMock.restore()
    for (const [key, prev] of ctx.envBackup.entries()) {
      if (prev.existed && prev.value !== undefined) {
        process.env[key] = prev.value
      } else {
        delete process.env[key]
      }
    }
  }

  vi?.unstubAllEnvs?.()

  if (typeof document !== 'undefined') {
    document.body.innerHTML = ''
    document.body.className = ''
  }

  try {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  } catch {
    // Ignore storage errors
  }
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  } catch {
    // Ignore storage errors
  }

  vi?.resetModules?.()
}

export async function bootSunRootApp(
  options: BootSunRootOptions = {},
): Promise<SunRootAppHandle> {
  if (activeContext) {
    await cleanupAppHarness(options.vi ? { vi: options.vi } : undefined)
  }

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('bootSunRootApp() requires a DOM environment (jsdom).')
  }

  const vi = await getVitestApi(options.vi)
  if (isVitestRuntime() && !vi?.doMock) {
    throw new Error(
      'bootSunRootApp() requires Vitest mocking API (vi.doMock) under Vitest, but `vi` could not be resolved.',
    )
  }

  const timeoutMs = options.timeoutMs ?? 5000

  document.body.className = ''
  document.body.innerHTML = '<div id="app"></div>'
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // Ignore storage errors
  }

  const restoreStubs = installJsdomStubs()
  const tracker = installGlobalTrackers()

  vi?.resetModules?.()

  const envBackup = new Map<string, { existed: boolean; value: string | undefined }>()
  for (const key of FIREBASE_ENV_KEYS) {
    envBackup.set(key, {
      existed: Object.prototype.hasOwnProperty.call(process.env, key),
      value: process.env[key],
    })
    const val = `e2e-${key.toLowerCase()}`
    vi?.stubEnv?.(key, val)
    process.env[key] = val
  }

  const defaultUser: MockFirebaseUser | null =
    options.user === undefined
      ? {
          uid: 'e2e-learner-1',
          email: 'learner@sunroot.test',
          displayName: 'E2E Learner',
        }
      : options.user

  const seedObj = options.firebaseSeed
  const baseCollections: Record<string, Record<string, Record<string, unknown>>> =
    seedObj && 'collections' in seedObj
      ? cloneValue((seedObj as { collections?: Record<string, Record<string, Record<string, unknown>>> }).collections ?? {})
      : seedObj
        ? cloneValue(seedObj as Record<string, Record<string, Record<string, unknown>>>)
        : {}

  if (defaultUser && options.profile !== null) {
    const usersCol = baseCollections.users ?? {}
    if (!usersCol[defaultUser.uid]) {
      usersCol[defaultUser.uid] = {
        uid: defaultUser.uid,
        email: defaultUser.email ?? 'learner@sunroot.test',
        displayName: defaultUser.displayName ?? 'E2E Learner',
        role: 'student',
        createdAt: Date.now(),
        learningStyle: {
          visual: 0.25,
          auditory: 0.25,
          kinesthetic: 0.25,
          readingWriting: 0.25,
          lastUpdated: Date.now(),
        },
        classroomIds: ['sunroot-original'],
        ...(options.profile ?? {}),
      }
      baseCollections.users = usersCol
    }
  }

  const firebase = createMockFirebase({
    collections: baseCollections,
    currentUser: defaultUser,
  })
  const mocked = firebase.registerWithVitest(vi)
  if (isVitestRuntime() && !mocked) {
    tracker.restore()
    restoreStubs()
    throw new Error(
      'bootSunRootApp() failed to register Firebase mocks with Vitest (vi.doMock returned false).',
    )
  }

  const fetchMock = createMockFetch(options.fetchRoutes)
  fetchMock.install()

  activeContext = {
    tracker,
    restoreStubs,
    fetchMock,
    vi,
    goTo: null,
    appState: null,
    envBackup,
  }

  const mainMod = (await import('../../../src/main')) as { goTo: (screen: string) => void }
  const appStateMod = (await import('../../../src/appState')) as {
    appState: { screen: string; codeReady: boolean; runProgram: unknown }
  }
  const sessionMod = (await import('../../../src/accounts/Session')) as {
    session: { user: MockFirebaseUser | null; profile: Record<string, unknown> | null }
  }
  try {
    const aiMod = (await import('../../../src/ai/AIProvider')) as {
      resetAIAvailability?: () => void
    }
    aiMod.resetAIAvailability?.()
  } catch {
    // Optional reset
  }

  activeContext.goTo = mainMod.goTo
  activeContext.appState = appStateMod.appState

  const deadline = Date.now() + timeoutMs
  if (defaultUser === null) {
    while (appStateMod.appState.screen !== 'login' && Date.now() < deadline) {
      await advanceOrWait(15, vi)
      await flushMicrotasks(6)
    }
    if (appStateMod.appState.screen !== 'login') {
      throw new Error(
        `bootSunRootApp({ user: null }) did not reach 'login' screen within ${timeoutMs}ms (got screen="${appStateMod.appState.screen}").`,
      )
    }
  } else if (options.profile === null) {
    while (
      (!document.querySelector('#finishButton') ||
        sessionMod.session.user?.uid !== defaultUser.uid) &&
      Date.now() < deadline
    ) {
      await advanceOrWait(15, vi)
      await flushMicrotasks(6)
    }
    if (
      sessionMod.session.user?.uid !== defaultUser.uid ||
      !document.querySelector('#finishButton')
    ) {
      throw new Error(
        `bootSunRootApp({ profile: null }) did not render #finishButton for uid="${defaultUser.uid}" within ${timeoutMs}ms (got uid="${sessionMod.session.user?.uid ?? 'null'}", screen="${appStateMod.appState.screen}").`,
      )
    }
  } else {
    while (
      (sessionMod.session.user?.uid !== defaultUser.uid ||
        !sessionMod.session.profile ||
        (appStateMod.appState.screen === 'loading' && !document.querySelector('#loadingFill'))) &&
      Date.now() < deadline
    ) {
      await advanceOrWait(15, vi)
      await flushMicrotasks(6)
    }

    if (sessionMod.session.user?.uid !== defaultUser.uid) {
      throw new Error(
        `bootSunRootApp() auth mock failed: expected session.user.uid="${defaultUser.uid}", got "${sessionMod.session.user?.uid ?? 'null'}" (screen="${appStateMod.appState.screen}").`,
      )
    }

    if (options.waitForLoadingAnimation) {
      while (appStateMod.appState.screen === 'loading' && Date.now() < deadline) {
        await advanceOrWait(100, vi)
        await flushMicrotasks(4)
      }
      if (options.initialScreen && options.initialScreen !== appStateMod.appState.screen) {
        mainMod.goTo(options.initialScreen)
      }
    } else {
      // Cancel boot.ts loading animation interval/timeout so it does not hijack navigation later
      tracker.clearActiveIntervalsAndTimeouts()
      mainMod.goTo(options.initialScreen ?? 'dashboard')
    }
    await waitForViewSettled({ timeoutMs })
  }

  const root = document.querySelector<HTMLElement>('#app')!

  return {
    root,
    goTo: mainMod.goTo,
    appState: appStateMod.appState,
    session: sessionMod.session,
    firebase,
    fetchMock,
    navigateToScreen,
    waitForViewSettled,
    cleanup: () => cleanupAppHarness(options.vi ? { vi: options.vi } : undefined),
  }
}
