import type { Notification } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/format'

const KIND: Record<string, { label: string; className: string }> = {
  copy_executed: { label: 'Executed', className: 'text-accent' },
  limit_placed: { label: 'Order', className: 'text-accent' },
  order_skipped: { label: 'Skipped', className: 'text-faint' },
  stop_loss: { label: 'Stop-loss', className: 'text-loss' },
  max_drawdown: { label: 'Drawdown', className: 'text-loss' },
  copy_started: { label: 'Started', className: 'text-muted' },
  copy_stopped: { label: 'Stopped', className: 'text-muted' },
}

export function ActivityFeed({ items }: { items: Notification[] }) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-faint">
        Nothing yet. Every copied trade — and every trade skipped, with the reason — shows up here.
      </p>
    )
  }
  return (
    <ul>
      {items.map((n) => {
        const kind = KIND[n.type] ?? { label: n.type, className: 'text-muted' }
        return (
          <li key={n.id} className="flex items-baseline gap-3 border-b border-line px-3 py-2 last:border-b-0">
            <span className="num w-16 flex-shrink-0 text-[11px] text-faint" title={new Date(n.created_at).toLocaleString()}>
              {timeAgo(n.created_at)}
            </span>
            <span className={`w-16 flex-shrink-0 text-[11px] font-medium ${kind.className}`}>{kind.label}</span>
            <span className="min-w-0 text-xs">
              <span className="text-fg">{n.title}</span>
              <span className="text-muted"> — {n.message}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
