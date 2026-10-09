/** Read-only ACS projection; credentials never cross the server boundary. */
export interface ACSOverview {
  status: 'ready' | 'partial' | 'unavailable'
  message?: string
  observedAt: string
  health: 'ready' | 'degraded' | 'unavailable'
  workItems: { loaded: number; running: number; awaitingApproval: number } | null
  registeredAgents: number | null
  executionMode: 'strict' | 'admin' | null
  recentEvents: Array<{ name: string; time: string | null }> | null
}

type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function trustedBaseUrl(raw: string | undefined): string | null {
  try {
    const url = new URL(raw || 'http://127.0.0.1:3000')
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return url.origin
  } catch { return null }
}

async function readJson(fetcher: typeof fetch, base: string, path: string, token?: string, acceptDegraded = false): Promise<JsonObject | null> {
  try {
    const response = await fetcher(base + path, {
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok && !(acceptDegraded && response.status === 503)) return null
    const body: unknown = await response.json()
    return isObject(body) ? body : null
  } catch { return null }
}

function eventSummaries(value: unknown): ACSOverview['recentEvents'] {
  if (!Array.isArray(value)) return null
  return value.slice(0, 5).filter(isObject).map(event => {
    let time: string | null = null
    if (typeof event.timeUnixNano === 'string' && /^\d{1,25}$/.test(event.timeUnixNano)) {
      const ms = Math.floor(Number(event.timeUnixNano) / 1000000)
      if (Number.isSafeInteger(ms) && Math.abs(ms) <= 8640000000000000) time = new Date(ms).toISOString()
    }
    return { name: typeof event.name === 'string' ? event.name : 'Unknown event', time }
  })
}

/** Configure only a read-scoped ACS_READ_TOKEN on the server. No mutation path exists. */
export async function loadAcsOverview(
  fetcher: typeof fetch = fetch,
  env: { ACS_BASE_URL?: string; ACS_READ_TOKEN?: string } = {
    ACS_BASE_URL: process.env.ACS_BASE_URL,
    ACS_READ_TOKEN: process.env.ACS_READ_TOKEN,
  }
): Promise<ACSOverview> {
  const observedAt = new Date().toISOString()
  const base = trustedBaseUrl(env.ACS_BASE_URL)
  const empty: ACSOverview = {
    status: 'unavailable', observedAt, health: 'unavailable',
    workItems: null, registeredAgents: null, executionMode: null, recentEvents: null,
  }
  if (!base) return { ...empty, message: 'ACS_BASE_URL must be a loopback HTTP address.' }

  const health = await readJson(fetcher, base, '/readyz', undefined, true)
  const healthStatus: ACSOverview['health'] = health === null ? 'unavailable'
    : health.ok === true ? 'ready' : 'degraded'

  const token = env.ACS_READ_TOKEN?.trim()
  if (!token) return {
    ...empty, health: healthStatus,
    message: 'ACS read access is not configured. Set a server-only ACS_READ_TOKEN.',
  }

  const [work, agents, mode, audit] = await Promise.all([
    readJson(fetcher, base, '/work-items?limit=100', token),
    readJson(fetcher, base, '/api/agents', token),
    readJson(fetcher, base, '/execution-mode', token),
    readJson(fetcher, base, '/api/events?limit=5', token),
  ])

  const rows = Array.isArray(work?.workItems) ? work.workItems : null
  const workItems = rows === null ? null : {
    loaded: rows.length,
    running: rows.filter(x => isObject(x) && x.status === 'running').length,
    awaitingApproval: rows.filter(x => isObject(x) && x.status === 'needs_approval').length,
  }
  const registeredAgents = Array.isArray(agents?.agents) ? agents.agents.length : null
  const executionMode = mode?.executionMode === 'strict' || mode?.executionMode === 'admin'
    ? mode.executionMode : null
  const recentEvents = eventSummaries(audit?.events)
  const available = [workItems, registeredAgents, executionMode, recentEvents].filter(v => v !== null).length

  return {
    status: available === 4 ? 'ready' : available > 0 ? 'partial' : 'unavailable',
    observedAt, health: healthStatus, workItems, registeredAgents, executionMode, recentEvents,
    ...(available === 4 ? {} : { message: 'Some ACS data could not be read. Check credentials and connectivity.' }),
  }
}
