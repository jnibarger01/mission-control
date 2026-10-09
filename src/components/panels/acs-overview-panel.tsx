'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { ACSOverview } from '@/lib/acs/overview'

function ValueCard({ label, value, note }: { label: string; value: string | number | null; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 'Unavailable'}</div>
      {note && <div className="mt-2 text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}

export function ACSOverviewPanel() {
  const [data, setData] = useState<ACSOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<ACSOverview>('/api/acs/overview')
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ACS request failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <section className="p-4 md:p-6 space-y-5" aria-labelledby="acs-overview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="acs-overview-title" className="text-xl font-semibold">ACS Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only view of the ACS control plane on port 3000. This panel cannot approve or execute work.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); void refresh() }} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" disabled={loading}>Refresh</button>
      </div>
      {loading && !data && !error && <p role="status">Loading ACS status…</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">ACS Overview unavailable: {error}</p>}
      {data && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            Gateway readiness: <strong>{data.health}</strong>. Data: <strong>{data.status}</strong>.
            Observed {new Date(data.observedAt).toLocaleString()}.
          </p>
          {data.message && <p role="alert" className="rounded-lg border border-border p-3 text-sm">{data.message}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ValueCard label="Loaded work items" value={data.workItems?.loaded ?? null} note="Current API page, not a global total" />
            <ValueCard label="Running work items" value={data.workItems?.running ?? null} note="Within the loaded page" />
            <ValueCard label="Awaiting approval" value={data.workItems?.awaitingApproval ?? null} note="Within the loaded page" />
            <ValueCard label="Registered agents" value={data.registeredAgents} />
            <ValueCard label="Execution mode (view only)" value={data.executionMode ?? null} />
            <ValueCard label="Gateway readiness" value={data.health} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">Recent ACS audit events</h2>
            {data.recentEvents === null
              ? <p className="mt-2 text-sm text-muted-foreground">Unavailable</p>
              : data.recentEvents.length === 0
                ? <p className="mt-2 text-sm text-muted-foreground">No events in the current page.</p>
                : <ul className="mt-3 space-y-2">{data.recentEvents.map((event, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-border pb-2 text-sm">
                      <span>{event.name}</span>
                      <span className="text-muted-foreground">{event.time ? new Date(event.time).toLocaleString() : 'Time unavailable'}</span>
                    </li>
                  ))}</ul>}
          </div>
        </>
      )}
    </section>
  )
}
