'use client'
import { useState } from 'react'
import { useFills, type Fill } from '@/hooks/useFills'
import type { StatsPeriod } from '@/lib/trader-stats'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import type { OpenPosition } from '@/types'

function fmtPrice(n: number) {
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (Math.abs(n) >= 1) return `$${n.toFixed(4)}`
  return `$${n.toPrecision(4)}`
}

function fmtSize(n: number) {
  return Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TH = 'h-[26px] px-3 text-[10px] font-semibold uppercase tracking-wider text-faint'
const TD = 'num h-[28px] px-3 text-xs text-muted'
const ROW = 'border-b border-line transition-colors hover:bg-raised'

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-xs text-faint">{children}</p>
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  )
}

function PositionsTable({ positions }: { positions: OpenPosition[] }) {
  if (positions.length === 0) return <Empty>No open positions</Empty>

  return (
    <table className="w-full min-w-[560px] border-collapse text-left">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-line">
          <th className={TH}>Coin</th>
          <th className={`${TH} text-right`}>Side</th>
          <th className={`${TH} text-right`}>Size</th>
          <th className={`${TH} text-right`}>Entry</th>
          <th className={`${TH} text-right`}>Notional</th>
          <th className={`${TH} text-right`}>uPnL</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos) => {
          const isLong = pos.szi > 0
          const notional = Math.abs(pos.szi * pos.entry_px)
          const upnl = pos.upnl ?? 0
          return (
            <tr key={pos.coin} className={ROW}>
              <td className={`${TD} font-medium text-fg`}>{pos.coin}</td>
              <td className={`${TD} text-right ${isLong ? 'text-profit' : 'text-loss'}`}>
                {isLong ? 'Long' : 'Short'}
              </td>
              <td className={`${TD} text-right`}>{fmtSize(pos.szi)}</td>
              <td className={`${TD} text-right`}>{fmtPrice(pos.entry_px)}</td>
              <td className={`${TD} text-right`}>
                ${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </td>
              <td
                className={`${TD} text-right font-medium ${upnl >= 0 ? 'text-profit' : 'text-loss'}`}
              >
                {upnl >= 0 ? '+' : '−'}$
                {Math.abs(upnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function FillsTable({ fills, isLoading }: { fills: Fill[]; isLoading: boolean }) {
  if (isLoading) return <Loading />
  if (fills.length === 0) return <Empty>No fills found</Empty>

  return (
    <table className="w-full min-w-[560px] border-collapse text-left">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-line">
          <th className={TH}>Time</th>
          <th className={TH}>Coin</th>
          <th className={`${TH} text-right`}>Direction</th>
          <th className={`${TH} text-right`}>Price</th>
          <th className={`${TH} text-right`}>Size</th>
          <th className={`${TH} text-right`}>Fee</th>
        </tr>
      </thead>
      <tbody>
        {fills.map((fill, i) => {
          const isBuy = fill.dir.includes('Open Long') || fill.dir.includes('Close Short')
          return (
            <tr key={`${fill.hash}-${i}`} className={ROW}>
              <td className={`${TD} text-faint`}>{fmtTime(fill.time)}</td>
              <td className={`${TD} font-medium text-fg`}>{fill.coin}</td>
              <td className={`${TD} text-right ${isBuy ? 'text-profit' : 'text-loss'}`}>
                {fill.dir || (fill.side === 'B' ? 'Buy' : 'Sell')}
              </td>
              <td className={`${TD} text-right`}>
                ${parseFloat(fill.px).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </td>
              <td className={`${TD} text-right`}>
                {parseFloat(fill.sz).toLocaleString('en-US')}
              </td>
              <td className={`${TD} text-right text-faint`}>${parseFloat(fill.fee).toFixed(2)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CompletedTradesTable({ fills, isLoading }: { fills: Fill[]; isLoading: boolean }) {
  if (isLoading) return <Loading />

  const closed = fills.filter((f) => parseFloat(f.closedPnl) !== 0)
  if (closed.length === 0) return <Empty>No completed trades</Empty>

  return (
    <table className="w-full min-w-[560px] border-collapse text-left">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-line">
          <th className={TH}>Time</th>
          <th className={TH}>Coin</th>
          <th className={`${TH} text-right`}>Direction</th>
          <th className={`${TH} text-right`}>Price</th>
          <th className={`${TH} text-right`}>Size</th>
          <th className={`${TH} text-right`}>PnL</th>
        </tr>
      </thead>
      <tbody>
        {closed.map((fill, i) => {
          const pnl = parseFloat(fill.closedPnl)
          return (
            <tr key={`${fill.hash}-${i}`} className={ROW}>
              <td className={`${TD} text-faint`}>{fmtTime(fill.time)}</td>
              <td className={`${TD} font-medium text-fg`}>{fill.coin}</td>
              <td
                className={`${TD} text-right ${
                  fill.dir.includes('Long') ? 'text-profit' : 'text-loss'
                }`}
              >
                {fill.dir}
              </td>
              <td className={`${TD} text-right`}>
                ${parseFloat(fill.px).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </td>
              <td className={`${TD} text-right`}>
                {parseFloat(fill.sz).toLocaleString('en-US')}
              </td>
              <td
                className={`${TD} text-right font-medium ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}
              >
                {pnl >= 0 ? '+' : '−'}$
                {Math.abs(pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

interface TradingActivityProps {
  address: string
  positions: OpenPosition[]
  period?: StatsPeriod
}

export function TradingActivity({ address, positions, period = '30d' }: TradingActivityProps) {
  const [tab, setTab] = useState('positions')
  const { data, isLoading } = useFills(address, period)
  const fills = data?.fills ?? []
  const closedCount = fills.filter((f) => parseFloat(f.closedPnl) !== 0).length

  const items = [
    { label: `Positions (${positions.length})`, value: 'positions' },
    { label: `Fills (${fills.length})`, value: 'fills' },
    { label: `Completed (${closedCount})`, value: 'completed' },
  ]

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[34px] flex-shrink-0 items-center border-b border-line px-3">
        <Tabs items={items} value={tab} onChange={setTab} aria-label="Trading activity" />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'positions' && <PositionsTable positions={positions} />}
        {tab === 'fills' && <FillsTable fills={fills} isLoading={isLoading} />}
        {tab === 'completed' && <CompletedTradesTable fills={fills} isLoading={isLoading} />}
      </div>
    </section>
  )
}
