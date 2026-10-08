import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadAcsOverview } from '@/lib/acs/overview'

/** PR1 is deliberately read-only and admin-only until an ACS identity bridge exists. */
export async function GET(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const overview = await loadAcsOverview()
  return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } })
}
