import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { session } from './Session'
import { estimateCostUsd, type ModelTier, type AITaskKind } from '../ai/ModelRouter'
import type { AIUsageRecord } from '../ai/AIProvider'

const LOCAL_USAGE_KEY = 'sunroot:ai_usage_logs:v1'
const MAX_LOCAL_LOGS = 200

export interface AIUsageSummary {
  totalCalls: number
  cachedCalls: number
  liveCalls: number
  cacheHitRate: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalUsd: number
  estimatedSavedUsd: number
  avgLatencyMs: number
  uniqueLearners: number
  byTier: Record<ModelTier, { calls: number; tokens: number; usd: number }>
  byTask: Partial<Record<AITaskKind, { calls: number; tokens: number; usd: number }>>
}

function readLocalLogs(): AIUsageRecord[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LOCAL_USAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AIUsageRecord[]) : []
  } catch {
    return []
  }
}

function writeLocalLogs(logs: AIUsageRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LOCAL_USAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOCAL_LOGS)))
  } catch {
    /* ignore storage quota / private mode errors */
  }
}

export function clearLocalUsageLogs(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_USAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

export async function recordAIUsage(record: AIUsageRecord): Promise<void> {
  const effectiveUid = record.uid ?? session.user?.uid ?? null
  const normalized: AIUsageRecord = {
    ...record,
    uid: effectiveUid,
  }

  const locals = readLocalLogs()
  locals.unshift(normalized)
  writeLocalLogs(locals)

  if (!isFirebaseConfigured() || !session.user) return

  try {
    await addDoc(collection(db, 'aiUsageLogs'), {
      ...normalized,
      uid: session.user.uid,
      createdAt: serverTimestamp(),
    })
  } catch {
    /* local ring buffer preserves telemetry if Firestore write fails */
  }
}

export async function getRecentUsageLogs(
  options: { limit?: number; uid?: string } = {},
): Promise<AIUsageRecord[]> {
  const max = Math.max(1, Math.min(500, options.limit ?? 100))
  const localFiltered = readLocalLogs().filter((r) => (options.uid ? r.uid === options.uid : true))

  if (!isFirebaseConfigured() || !session.user) {
    return localFiltered
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, max)
  }

  try {
    const col = collection(db, 'aiUsageLogs')
    const q = options.uid
      ? query(col, where('uid', '==', options.uid), orderBy('timestamp', 'desc'), fbLimit(max))
      : query(col, orderBy('timestamp', 'desc'), fbLimit(max))
    const snap = await getDocs(q)
    const remote = snap.docs.map((d) => d.data() as AIUsageRecord)

    const dedup = new Map<string, AIUsageRecord>()
    for (const item of [...remote, ...localFiltered]) {
      const key = `${item.timestamp}|${item.uid ?? ''}|${item.task}|${item.model}|${item.totalTokens}|${item.cached}`
      if (!dedup.has(key)) dedup.set(key, item)
    }
    return Array.from(dedup.values())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, max)
  } catch {
    return localFiltered
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, max)
  }
}

export async function getUsageSummary(
  options: { uid?: string; sinceIso?: string; logs?: AIUsageRecord[] } = {},
): Promise<AIUsageSummary> {
  const sourceLogs = options.logs ?? (await getRecentUsageLogs({ limit: 500, uid: options.uid }))
  const filtered = sourceLogs.filter((r) => {
    if (options.uid && r.uid !== options.uid) return false
    if (options.sinceIso && r.timestamp < options.sinceIso) return false
    return true
  })

  const byTier: AIUsageSummary['byTier'] = {
    nano: { calls: 0, tokens: 0, usd: 0 },
    flash: { calls: 0, tokens: 0, usd: 0 },
    pro: { calls: 0, tokens: 0, usd: 0 },
  }
  const byTask: AIUsageSummary['byTask'] = {}
  const learners = new Set<string>()

  let cachedCalls = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalTokens = 0
  let totalUsd = 0
  let estimatedSavedUsd = 0
  let totalLatency = 0

  for (const r of filtered) {
    if (r.uid) learners.add(r.uid)
    if (r.cached) {
      cachedCalls++
      estimatedSavedUsd += estimateCostUsd(r.model, r.promptTokens, r.completionTokens)
    } else {
      totalUsd += r.estimatedUsd
    }

    totalPromptTokens += r.promptTokens
    totalCompletionTokens += r.completionTokens
    totalTokens += r.totalTokens
    totalLatency += r.latencyMs

    const tierBucket = byTier[r.tier] ?? byTier.flash
    tierBucket.calls += 1
    tierBucket.tokens += r.totalTokens
    tierBucket.usd += r.cached ? 0 : r.estimatedUsd

    const taskBucket = byTask[r.task] ?? { calls: 0, tokens: 0, usd: 0 }
    taskBucket.calls += 1
    taskBucket.tokens += r.totalTokens
    taskBucket.usd += r.cached ? 0 : r.estimatedUsd
    byTask[r.task] = taskBucket
  }

  const totalCalls = filtered.length
  const liveCalls = totalCalls - cachedCalls
  const roundUsd = (v: number) => Math.round(v * 1_000_000_000) / 1_000_000_000

  return {
    totalCalls,
    cachedCalls,
    liveCalls,
    cacheHitRate: totalCalls > 0 ? cachedCalls / totalCalls : 0,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    totalUsd: roundUsd(totalUsd),
    estimatedSavedUsd: roundUsd(estimatedSavedUsd),
    avgLatencyMs: totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0,
    uniqueLearners: learners.size,
    byTier,
    byTask,
  }
}
