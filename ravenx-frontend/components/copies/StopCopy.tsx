'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface StopResult {
  closing?: { closed: string[]; failed: string[]; error?: string }
}

/** What went wrong closing positions on stop, or null if nothing did. */
export function closingProblem(result: StopResult): string | null {
  const c = result.closing
  if (!c) return null
  if (c.error) return `Stopped, but positions weren't closed: ${c.error}. Close them on Hyperliquid.`
  if (c.failed.length > 0) {
    return `Stopped, but ${c.failed.join(', ')} couldn't be closed. Close it on Hyperliquid.`
  }
  return null
}

export function useStopCopy(subId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (closePositions: boolean) =>
      (
        await api.post<StopResult>('/copy/stop', {
          subscription_id: subId,
          close_positions: closePositions,
        })
      ).data,
    onSuccess: () => {
      for (const key of ['subscriptions', 'copy-positions', 'trader', 'copy-fills', 'notifications']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

/**
 * Stop a copy, choosing whether its positions close. Closing sells only this
 * copy's share, at market; keeping leaves them on the account to manage by hand.
 */
export function StopChoice({
  subId,
  onDone,
  onCancel,
  compact = false,
}: {
  subId: number | undefined
  onDone: (problem: string | null) => void
  onCancel: () => void
  compact?: boolean
}) {
  const stop = useStopCopy(subId)
  const run = (close: boolean) =>
    stop.mutate(close, { onSuccess: (result) => onDone(closingProblem(result)) })
  const busy = stop.isPending

  return (
    <div className={`flex ${compact ? 'items-center gap-1' : 'flex-col gap-2'}`}>
      {!compact && <p className="text-[11px] text-muted">Close this copy&apos;s positions?</p>}
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="danger" onClick={() => run(true)} disabled={busy}>
          {busy && stop.variables ? <Spinner size="sm" /> : 'Stop & close positions'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run(false)} disabled={busy}>
          {busy && !stop.variables ? <Spinner size="sm" /> : 'Stop, keep positions'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      {stop.isError && (
        <p role="alert" className="text-[11px] text-loss">
          Couldn&apos;t stop the copy. Try again.
        </p>
      )}
    </div>
  )
}
