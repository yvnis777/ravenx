/** Copy (two overlapping squares) and a check mark once copied, in the current text color. */
export function CopyIcon({ copied = false, size = 13 }: { copied?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {copied ? (
        <path d="M3 8.5l3.2 3L13 4.5" />
      ) : (
        <>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5V3.5A1 1 0 0 0 9.5 2.5H3.5A1 1 0 0 0 2.5 3.5V9.5A1 1 0 0 0 3.5 10.5H5.5" />
        </>
      )}
    </svg>
  )
}
