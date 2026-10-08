import { afterEach, describe, expect, it, vi } from 'vitest'

const { requireRoleMock, loadAcsOverviewMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  loadAcsOverviewMock: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/acs/overview', () => ({ loadAcsOverview: loadAcsOverviewMock }))
import { GET } from '@/app/api/acs/overview/route'

describe('GET /api/acs/overview', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated users before accessing ACS', async () => {
    requireRoleMock.mockReturnValue({ error: 'Authentication required', status: 401 })
    const response = await GET(new Request('http://localhost:3001/api/acs/overview'))
    expect(response.status).toBe(401)
    expect(loadAcsOverviewMock).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(requireRoleMock).toHaveBeenCalledWith(expect.any(Request), 'admin')
  })

  it('rejects non-admin users before accessing ACS', async () => {
    requireRoleMock.mockReturnValue({ error: 'Requires admin role', status: 403 })
    const response = await GET(new Request('http://localhost:3001/api/acs/overview'))
    expect(response.status).toBe(403)
    expect(loadAcsOverviewMock).not.toHaveBeenCalled()
  })

  it('returns a cache-disabled read-only projection for admin users', async () => {
    requireRoleMock.mockReturnValue({ user: { id: 1, role: 'admin' } })
    loadAcsOverviewMock.mockResolvedValue({ status: 'unavailable', health: 'unavailable' })
    const response = await GET(new Request('http://localhost:3001/api/acs/overview'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'unavailable', health: 'unavailable' })
    expect(loadAcsOverviewMock).toHaveBeenCalledOnce()
  })
})
