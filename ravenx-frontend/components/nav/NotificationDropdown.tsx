'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications, useUnreadCount, useMarkRead } from '@/hooks/useNotifications'

const TYPE_ICONS: Record<string, string> = {
  copy_executed: '✓',
  limit_placed: '◷',
  order_skipped: '⊘',
  stop_loss: '⚠',
  max_drawdown: '⚠',
  copy_started: '▶',
  copy_stopped: '■',
}

const TYPE_COLORS: Record<string, string> = {
  copy_executed: 'text-profit',
  limit_placed: 'text-accent',
  order_skipped: 'text-faint',
  stop_loss: 'text-loss',
  max_drawdown: 'text-loss',
  copy_started: 'text-profit',
  copy_stopped: 'text-faint',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function NotificationDropdown({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { data: unreadData } = useUnreadCount(isAuthenticated)
  const { data } = useNotifications(isAuthenticated)
  const markRead = useMarkRead()

  const unreadCount = unreadData?.unread_count ?? 0
  const notifications = data?.notifications ?? []

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node
    if (
      btnRef.current &&
      !btnRef.current.contains(target) &&
      dropdownRef.current &&
      !dropdownRef.current.contains(target)
    ) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function handleOpen() {
    setOpen(!open)
    if (!open && unreadCount > 0) markRead.mutate(undefined)
  }

  if (!isAuthenticated) return null

  const btnRect = btnRef.current?.getBoundingClientRect()
  const dropdownStyle: React.CSSProperties = btnRect
    ? {
        position: 'fixed',
        top: btnRect.bottom + 6,
        right: window.innerWidth - btnRect.right,
        zIndex: 9999,
      }
    : { position: 'fixed', top: 50, right: 12, zIndex: 9999 }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative flex h-[26px] w-[26px] items-center justify-center rounded-md border
          border-line text-faint transition-colors hover:border-line-strong hover:text-fg"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="num absolute -right-1 -top-1 flex min-w-[14px] items-center justify-center
              rounded-sm bg-accent px-0.5 text-[9px] font-bold text-on-accent"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="modal max-h-[440px] w-[340px] overflow-hidden rounded-md"
          >
            <div className="flex h-[30px] items-center justify-between border-b border-line px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Notifications
              </span>
              {notifications.length > 0 && (
                <button
                  onClick={() => markRead.mutate(undefined)}
                  className="text-[11px] text-faint transition-colors hover:text-fg"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-faint">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`border-b border-line px-3 py-2 transition-colors hover:bg-raised ${
                      !n.is_read ? 'bg-raised' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 text-xs ${TYPE_COLORS[n.type] ?? 'text-faint'}`}
                      >
                        {TYPE_ICONS[n.type] ?? '•'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-fg">{n.title}</span>
                          <span className="num flex-shrink-0 text-[10px] text-faint">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{n.message}</p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-sm bg-accent" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
