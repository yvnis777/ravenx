import type { CopyShare, PositionRow } from '@/lib/attribution'
import { fmtMoney, fmtPrice, fmtSize } from '@/lib/format'

const TH = 'h-[26px] px-3 text-[10px] font-semibold uppercase tracking-wider text-faint whitespace-nowrap'
const TD = 'h-[34px] px-3 text-xs whitespace-nowrap'

interface PositionsTableProps {
  rows: PositionRow[]
  orphans: CopyShare[]
  /** subscription id → how to name that copy. */
  copyLabel: (subscriptionId: number) => string
}

function Side({ szi }: { szi: number }) {
  return (
    <span className={szi > 0 ? 'text-profit' : 'text-loss'}>{szi > 0 ? 'Long' : 'Short'}</span>
  )
}

export function PositionsTable({ rows, orphans, copyLabel }: PositionsTableProps) {
  if (rows.length === 0 && orphans.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-faint">No open positions.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Coin</th>
            <th className={TH}>Side</th>
            <th className={`${TH} text-right`}>Size</th>
            <th className={`${TH} text-right`}>Value</th>
            <th className={`${TH} text-right`}>Entry</th>
            <th className={`${TH} text-right`}>Mark</th>
            <th className={`${TH} text-right`}>uPnL</th>
            <th className={`${TH} text-right`}>Liq. price</th>
            <th className={TH}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ position: p, mark, sources, manualSzi, mismatch }) => (
            <tr key={p.coin} className="border-b border-line">
              <td className={`${TD} font-medium text-fg`}>{p.coin}</td>
              <td className={TD}><Side szi={p.szi} /></td>
              <td className={`${TD} num text-right text-fg`}>{fmtSize(p.szi)}</td>
              <td className={`${TD} num text-right text-muted`}>{fmtMoney(p.position_value)}</td>
              <td className={`${TD} num text-right text-muted`}>{fmtPrice(p.entry_px)}</td>
              <td className={`${TD} num text-right text-muted`}>{fmtPrice(mark)}</td>
              <td className={`${TD} num text-right ${(p.upnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                {fmtMoney(p.upnl, true)}
              </td>
              <td className={`${TD} num text-right text-faint`}>{fmtPrice(p.liq_px)}</td>
              <td className={TD}>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {sources.map((s) => (
                    <span key={s.subscription_id} className="num text-muted">
                      {copyLabel(s.subscription_id)} <span className="text-faint">{fmtSize(s.szi)}</span>
                    </span>
                  ))}
                  {manualSzi !== 0 && (
                    <span className="num text-faint">
                      Manual <span>{fmtSize(manualSzi)}</span>
                    </span>
                  )}
                  {mismatch && (
                    <span
                      className="text-warn"
                      title="Your copies record more than this position holds — part was closed outside RavenX."
                    >
                      ⚠ size mismatch
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {orphans.map((s) => (
            <tr key={`orphan-${s.subscription_id}-${s.coin}`} className="border-b border-line">
              <td className={`${TD} font-medium text-muted`}>{s.coin}</td>
              <td className={TD}><Side szi={s.szi} /></td>
              <td className={`${TD} num text-right text-muted`}>{fmtSize(s.szi)}</td>
              <td colSpan={6} className={`${TD} text-warn`}>
                ⚠ Recorded for {copyLabel(s.subscription_id)}, but not open on Hyperliquid — it was
                closed or liquidated outside RavenX.
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
