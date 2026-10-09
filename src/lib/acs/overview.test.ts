import { describe, expect, it, vi } from 'vitest'
import { loadAcsOverview } from './overview'

function response(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}

describe('ACS read-only overview projection', () => {
  it('does not request protected ACS data when the read credential is missing', async () => {
    const fetcher = vi.fn(async () => response({ ok: true })) as unknown as typeof fetch
    const result = await loadAcsOverview(fetcher, {})
    expect(result.status).toBe('unavailable')
    expect(result.health).toBe('ready')
    expect(result.workItems).toBeNull()
    expect(vi.mocked(fetcher).mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:3000/readyz'])
  })

  it('rejects non-loopback ACS addresses without making a request', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    const result = await loadAcsOverview(fetcher, { ACS_BASE_URL: 'http://evil.example:3000', ACS_READ_TOKEN: 'secret' })
    expect(result.status).toBe('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('maps only canonical ACS fields and keeps page counts explicitly bounded', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.endsWith('/readyz')) return response({ ok: true })
      expect(init?.method).toBe('GET')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer read-secret')
      if (path.includes('/work-items')) return response({ workItems: [
        { id: '1', status: 'running' }, { id: '2', status: 'needs_approval' },
        { id: '3', status: 'approved' },
      ] })
      if (path.endsWith('/api/agents')) return response({ agents: [{ id: 'a' }, { id: 'b' }] })
      if (path.endsWith('/execution-mode')) return response({ executionMode: 'admin' })
      if (path.includes('/api/events')) return response({ events: [{ name: 'policy.decided', body: { password: 'do-not-leak' } }] })
      return response({}, 404)
    }) as typeof fetch
    const result = await loadAcsOverview(fetcher, { ACS_READ_TOKEN: 'read-secret' })
    expect(result.status).toBe('ready')
    expect(result.workItems).toEqual({ loaded: 3, running: 1, awaitingApproval: 1 })
    expect(result.registeredAgents).toBe(2)
    expect(result.executionMode).toBe('admin')
    expect(result.recentEvents).toEqual([{ name: 'policy.decided', time: null }])
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
    expect(JSON.stringify(result)).not.toContain('read-secret')
  })

  it('reports a live ACS readiness HTTP 503 with JSON as degraded rather than unreachable', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/readyz') ? response({ ok: false, checks: { executionAdmission: { ok: false } } }, 503)
        : response({ error: 'unauthorized' }, 401)
    ) as typeof fetch
    const result = await loadAcsOverview(fetcher, { ACS_READ_TOKEN: 'read' })
    expect(result.health).toBe('degraded')
    expect(result.status).toBe('unavailable')
  })

  it('keeps failed or unauthorized reads unavailable rather than zero', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/readyz') ? response({ ok: false }) : response({ error: 'unauthorized' }, 401)
    ) as typeof fetch
    const result = await loadAcsOverview(fetcher, { ACS_READ_TOKEN: 'expired' })
    expect(result.status).toBe('unavailable')
    expect(result.health).toBe('degraded')
    expect(result.workItems).toBeNull()
    expect(result.registeredAgents).toBeNull()
    expect(result.executionMode).toBeNull()
  })

  it('does not redirect to a different host when reading ACS', async () => {
    const fetcher = vi.fn(async () => response({}, 302)) as unknown as typeof fetch
    const result = await loadAcsOverview(fetcher, { ACS_READ_TOKEN: 'read' })
    expect(result.status).toBe('unavailable')
    expect(vi.mocked(fetcher).mock.calls.every(call => call[1]?.redirect === 'error')).toBe(true)
  })
})
