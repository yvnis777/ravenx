'use client'
import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts'
import { usePnlHistory, type PnlPeriod } from '@/hooks/usePnlHistory'
import { Spinner } from '@/components/ui/Spinner'
import { IS_MAINNET } from '@/lib/hl-env'

/**
 * lightweight-charts needs literal colors, not CSS variables.
 * These mirror the tokens in globals.css — keep them in sync.
 */
const C = {
  profit: '#2ecc80',
  loss: '#ff5c5c',
  profitFill: 'rgba(46, 204, 128, 0.18)',
  lossFill: 'rgba(255, 92, 92, 0.18)',
  fade: 'rgba(0, 0, 0, 0)',
  grid: 'rgba(255, 255, 255, 0.035)',
  line: '#212128',
  faint: '#7a7c88',
  raised: '#17171d',
}

export function PnlChart({ address, period }: { address: string; period: PnlPeriod }) {
  const { data, isLoading } = usePnlHistory(address, period)
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: C.faint,
        fontFamily: 'var(--font-mono-jb), monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        vertLine: { color: C.line, labelBackgroundColor: C.raised },
        horzLine: { color: C.line, labelBackgroundColor: C.raised },
      },
      rightPriceScale: { borderColor: C.line },
      timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    })

    chartInstance.current = chart

    const series = chart.addSeries(AreaSeries, {
      lineColor: C.profit,
      topColor: C.profitFill,
      bottomColor: C.fade,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          const sign = price >= 0 ? '+' : ''
          return `${sign}$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        },
      },
    })

    seriesRef.current = series

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartInstance.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || !data?.data) return

    const points = data.data
    if (points.length === 0) {
      seriesRef.current.setData([])
      return
    }

    const isPositive = points[points.length - 1].value >= 0

    seriesRef.current.applyOptions({
      lineColor: isPositive ? C.profit : C.loss,
      topColor: isPositive ? C.profitFill : C.lossFill,
      bottomColor: C.fade,
      crosshairMarkerBackgroundColor: isPositive ? C.profit : C.loss,
      crosshairMarkerBorderColor: isPositive ? C.profit : C.loss,
    })

    seriesRef.current.setData(points as never)
    chartInstance.current?.timeScale().fitContent()
  }, [data])

  const totalPnl = data?.pnl ?? 0
  const hasPnl = !!data && data.data.some((p) => p.value !== 0)

  return (
    <section className="border-b border-line">
      <header className="flex h-[34px] items-center gap-3 border-b border-line px-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-faint">
          Cumulative PnL
        </h2>
        {hasPnl && (
          <span className={`num text-sm font-semibold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
            {totalPnl >= 0 ? '+' : '−'}$
            {Math.abs(totalPnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
      </header>

      <div className="relative" style={{ height: 280 }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel">
            <Spinner />
          </div>
        )}
        {!isLoading && !hasPnl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-faint">
              No PnL in this period{IS_MAINNET ? '' : ' on testnet'}
            </p>
          </div>
        )}
        <div ref={chartRef} className="h-full w-full" />
      </div>
    </section>
  )
}
