'use client'

interface SparklineProps {
  value: number // Current period PnL — determines direction and color
  size?: { width: number; height: number }
}

// Generate a simple 7-point trend line from a hash of the value
function generatePoints(value: number, width: number, height: number): string {
  const points = 7
  const stepX = width / (points - 1)
  const isPositive = value >= 0
  const seed = Math.abs(Math.round(value * 100))

  const coords: string[] = []
  for (let i = 0; i < points; i++) {
    const x = Math.round(i * stepX)
    const progress = i / (points - 1)
    const trend = isPositive
      ? height * (1 - progress * 0.8) + ((seed >> i) % 4) - 2
      : height * (0.2 + progress * 0.7) + ((seed >> i) % 4) - 2
    const y = Math.max(2, Math.min(height - 2, Math.round(trend)))
    coords.push(`${x},${y}`)
  }
  return coords.join(' ')
}

export function Sparkline({ value, size = { width: 48, height: 16 } }: SparklineProps) {
  const { width, height } = size
  const color = value >= 0 ? 'var(--profit)' : 'var(--loss)'
  const points = generatePoints(value, width, height)
  const lastPoint = points.split(' ').pop()?.split(',') ?? [String(width), String(height / 2)]

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="1.5" fill={color} />
    </svg>
  )
}
