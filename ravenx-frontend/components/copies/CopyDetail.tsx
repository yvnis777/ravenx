'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTrader } from '@/hooks/useTrader'
import type { CopyTrades } from '@/lib/copy-fills'
import { fmtMoney, fmtPrice, fmtSize } from '@/lib/format'
import { Spinner } from '@/components/ui/Spinner'
import type { Subscription } from '@/types'

const LABEL = 'text-[10px] font-semibold uppercase tracking-wider text-faint'
const TH = 'h-[24px] px-2 text-[10px] font-semibold uppercase tracking-wider text-faint whitespace-nowrap'
const TD = 'h-[26px] px-2 text-[11px] whitespace-nowrap'
const PAGE = 25

const tone = (n: number) => (n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : 'text-muted')

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** The copied wallet as it is right now, read live from HL. */
function TraderNow({ address }: { address: string }) {
  const router = useRouter()
  const { data: trader, isLoading, isError } = useTrader(address)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>Trader now</span>
        <button
          onClick={() => router.push(`/traders/${address}`)}
          className="text-[11px] text-faint transition-colors hover:text-accent"
        >
          Trader page →
        </button>
      </div>
      {isLoading ? (
        <Spinner size="sm" />
      ) : isError || !trader ? (
        <p className="text-[11px] text-faint">Couldn&apos;t reach Hyperliquid.</p>
      ) : (
        <>
          <p className="num text-[11px] text-muted">
            Equity {fmtMoney(trader.perp_equity)} · uPnL{' '}
            <span className={tone(trader.upnl)}>{fmtMoney(trader.upnl, true)}</span> ·{' '}
            {trader.open_positions.length} open
          </p>
          {trader.open_positions.length > 0 && (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>Coin</th>
                  <th className={TH}>Side</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={`${TH} text-right`}>uPnL</th>
                </tr>
              </thead>
              <tbody>
                {trader.open_positions.map((p) => (
                  <tr key={p.coin} className="border-b border-line last:border-0">
                    <td className={`${TD} text-fg`}>{p.coin}</td>
                    <td className={`${TD} ${p.szi > 0 ? 'text-fg' : 'text-muted'}`}>
                      {p.szi > 0 ? 'Long' : 'Short'}
                    </td>
                    <td className={`${TD} num text-right text-muted`}>
                      {fmtMoney(p.position_value ?? 0)}
                    </td>
                    <td className={`${TD} num text-right ${tone(p.upnl ?? 0)}`}>
                      {fmtMoney(p.upnl ?? 0, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

/** Every fill this copy made on the user's account, newest first. */
function TradeHistory({ trades, loading }: { trades?: CopyTrades; loading: boolean }) {
  const [shown, setShown] = useState(PAGE)
  const fills = trades?.fills ?? []

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={LABEL}>This copy&apos;s trades</span>
      {loading ? (
        <Spinner size="sm" />
      ) : fills.length === 0 ? (
        <p className="text-[11px] text-faint">No trades yet.</p>
      ) : (
        <>
          <p className="num text-[11px] text-muted">
            {fills.length} {fills.length === 1 ? 'fill' : 'fills'} · closed PnL{' '}
            <span className={tone(trades!.realized)}>{fmtMoney(trades!.realized, true)}</span> ·
            fees {fmtMoney(trades!.fees)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>Time</th>
                  <th className={TH}>Coin</th>
                  <th className={TH}>Action</th>
                  <th className={`${TH} text-right`}>Size</th>
                  <th className={`${TH} text-right`}>Price</th>
                  <th className={`${TH} text-right`}>PnL</th>
                  <th className={`${TH} text-right`}>Fee</th>
                </tr>
              </thead>
              <tbody>
                {fills.slice(0, shown).map((f) => {
                  const pnl = parseFloat(f.closedPnl)
                  return (
                    <tr key={`${f.hash}-${f.time}-${f.oid}`} className="border-b border-line last:border-0">
                      <td className={`${TD} num text-faint`}>{fmtTime(f.time)}</td>
                      <td className={`${TD} text-fg`}>{f.coin}</td>
                      <td className={`${TD} text-muted`}>{f.dir}</td>
                      <td className={`${TD} num text-right text-muted`}>{fmtSize(parseFloat(f.sz))}</td>
                      <td className={`${TD} num text-right text-muted`}>{fmtPrice(parseFloat(f.px))}</td>
                      <td className={`${TD} num text-right ${tone(pnl)}`}>
                        {pnl ? fmtMoney(pnl, true) : '—'}
                      </td>
                      <td className={`${TD} num text-right text-faint`}>
                        {fmtMoney(parseFloat(f.fee))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {fills.length > shown && (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="self-start text-[11px] text-faint transition-colors hover:text-muted"
            >
              Show {Math.min(PAGE, fills.length - shown)} more
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function CopyDetail({
  sub,
  trades,
  loading,
}: {
  sub: Subscription
  trades?: CopyTrades
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4 bg-panel px-3 py-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <TraderNow address={sub.target_address} />
      <TradeHistory trades={trades} loading={loading} />
    </div>
  )
}
