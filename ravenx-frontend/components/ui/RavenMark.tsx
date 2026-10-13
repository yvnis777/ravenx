// components/ui/RavenMark.tsx
// The RavenX logo tile. Geometry mirrors branding/build-logo.js — change both together.
export function RavenMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="RavenX"
    >
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <g transform="translate(7.68 7.68) scale(0.76)" fill="var(--on-accent)">
        <path d="M62 17 L50 12 L44 8.5 L37 9.5 L32 15 L26 26 L6 50 L2 60 L13 56 L22 52 L32 50 L40 44 L44 36 L44 30 L47 25 L46 22.5 L53 21 Z" />
        <path d="M26.8 47 L29.2 47 L28.4 60 L26 60 Z M34 45 L36.4 45 L36.4 60 L34 60 Z" />
        <path d="M39 13.5 L42.5 15.5 L39 17.5 Z" fill="var(--accent)" />
      </g>
    </svg>
  )
}
