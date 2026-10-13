// components/dashboard/FilterPanel.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import type { TraderFilters } from '@/types'

const DEFAULT_FILTERS: TraderFilters = {
  sort_by: 'pnl',
  order: 'desc',
  page: 1,
}

interface LocalFilters {
  min_pnl: string
  max_pnl: string
  min_win_rate: string
  max_win_rate: string
  min_trades: string
  max_trades: string
  min_equity: string
  max_equity: string
}

function toLocal(filters: TraderFilters): LocalFilters {
  return {
    min_pnl: filters.min_pnl !== undefined ? String(filters.min_pnl) : '',
    max_pnl: filters.max_pnl !== undefined ? String(filters.max_pnl) : '',
    min_win_rate: filters.min_win_rate !== undefined ? String(filters.min_win_rate * 100) : '',
    max_win_rate: filters.max_win_rate !== undefined ? String(filters.max_win_rate * 100) : '',
    min_trades: filters.min_trades !== undefined ? String(filters.min_trades) : '',
    max_trades: filters.max_trades !== undefined ? String(filters.max_trades) : '',
    min_equity: filters.min_equity !== undefined ? String(filters.min_equity) : '',
    max_equity: filters.max_equity !== undefined ? String(filters.max_equity) : '',
  }
}

function toNumeric(local: LocalFilters): Partial<TraderFilters> {
  return {
    min_pnl: local.min_pnl ? Number(local.min_pnl) : undefined,
    max_pnl: local.max_pnl ? Number(local.max_pnl) : undefined,
    min_win_rate: local.min_win_rate ? Number(local.min_win_rate) / 100 : undefined,
    max_win_rate: local.max_win_rate ? Number(local.max_win_rate) / 100 : undefined,
    min_trades: local.min_trades ? Number(local.min_trades) : undefined,
    max_trades: local.max_trades ? Number(local.max_trades) : undefined,
    min_equity: local.min_equity ? Number(local.min_equity) : undefined,
    max_equity: local.max_equity ? Number(local.max_equity) : undefined,
  }
}

/** Min/max pair on one row — half the vertical space of stacked inputs. */
function RangeRow({
  legend,
  minId,
  maxId,
  minValue,
  maxValue,
  onMin,
  onMax,
  max,
}: {
  legend: string
  minId: string
  maxId: string
  minValue: string
  maxValue: string
  onMin: (v: string) => void
  onMax: (v: string) => void
  max?: number
}) {
  const field =
    'num h-[26px] w-full rounded-md border border-line bg-raised px-2 text-xs text-fg ' +
    'placeholder:text-faint outline-none transition-colors focus:border-accent'
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 text-[10px] uppercase tracking-wider text-faint">{legend}</legend>
      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor={minId}>{`Min ${legend}`}</label>
        <input
          id={minId}
          type="number"
          placeholder="Min"
          max={max}
          value={minValue}
          onChange={(e) => onMin(e.target.value)}
          className={field}
        />
        <span className="text-faint">–</span>
        <label className="sr-only" htmlFor={maxId}>{`Max ${legend}`}</label>
        <input
          id={maxId}
          type="number"
          placeholder="Max"
          max={max}
          value={maxValue}
          onChange={(e) => onMax(e.target.value)}
          className={field}
        />
      </div>
    </fieldset>
  )
}

interface FilterPanelProps {
  filters: TraderFilters
  onChange: (f: TraderFilters) => void
  className?: string
}

export function FilterPanel({ filters, onChange, className = '' }: FilterPanelProps) {
  const [local, setLocal] = useState<LocalFilters>(() => toLocal(filters))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocal(toLocal(filters))
  }, [filters])

  function handleChange(field: keyof LocalFilters, value: string) {
    const next = { ...local, [field]: value }
    setLocal(next)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange({ ...filters, ...toNumeric(next), page: 1 })
    }, 600)
  }

  function handleReset() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setLocal(toLocal(DEFAULT_FILTERS))
    onChange(DEFAULT_FILTERS)
  }

  const activeCount = Object.values(local).filter((v) => v !== '').length

  return (
    <aside className={`flex flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
          Filters
        </span>
        {activeCount > 0 && (
          <span className="num text-[10px] text-accent">{activeCount} active</span>
        )}
      </div>

      <RangeRow
        legend="PnL ($)"
        minId="filter-min-pnl"
        maxId="filter-max-pnl"
        minValue={local.min_pnl}
        maxValue={local.max_pnl}
        onMin={(v) => handleChange('min_pnl', v)}
        onMax={(v) => handleChange('max_pnl', v)}
      />
      <RangeRow
        legend="Win Rate (%)"
        minId="filter-min-wr"
        maxId="filter-max-wr"
        minValue={local.min_win_rate}
        maxValue={local.max_win_rate}
        onMin={(v) => handleChange('min_win_rate', v)}
        onMax={(v) => handleChange('max_win_rate', v)}
        max={100}
      />
      <RangeRow
        legend="Trades"
        minId="filter-min-trades"
        maxId="filter-max-trades"
        minValue={local.min_trades}
        maxValue={local.max_trades}
        onMin={(v) => handleChange('min_trades', v)}
        onMax={(v) => handleChange('max_trades', v)}
      />
      <RangeRow
        legend="Equity ($)"
        minId="filter-min-equity"
        maxId="filter-max-equity"
        minValue={local.min_equity}
        maxValue={local.max_equity}
        onMin={(v) => handleChange('min_equity', v)}
        onMax={(v) => handleChange('max_equity', v)}
      />

      <Button variant="ghost" size="sm" onClick={handleReset} className="mt-auto">
        Reset filters
      </Button>
    </aside>
  )
}
