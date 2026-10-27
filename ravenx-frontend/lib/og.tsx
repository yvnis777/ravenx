/**
 * Link-preview cards (Open Graph / X), drawn with next/og. Colors mirror the
 * tokens in app/globals.css: ImageResponse can't read CSS variables.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { FEES_ENABLED } from '@/lib/fee'

export const OG_SIZE = { width: 1200, height: 630 }

export const C = {
  surface: '#0a0a0c',
  panel: '#101014',
  line: '#212128',
  fg: '#ecedf0',
  muted: '#a4a6b0',
  faint: '#7a7c88',
  accent: '#f5a623',
  profit: '#2ecc80',
  loss: '#ff5c5c',
}

export const TAGLINE = FEES_ENABLED
  ? 'Non-custodial · Open source'
  : 'Free during launch · Non-custodial · Open source'

/** The logo as a data URL: ImageResponse can't fetch from the app's own server. */
export async function loadLogo(): Promise<string> {
  const png = await readFile(join(process.cwd(), 'public/ravenx-icon-512.png'))
  return `data:image/png;base64,${png.toString('base64')}`
}

/** The frame every card shares: logo and name on top, tagline and URL below.
 * Synchronous, as ImageResponse requires: load the logo with loadLogo first. */
export function CardFrame({ logo, children }: { logo: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: C.surface,
        border: `2px solid ${C.line}`,
        padding: '56px 64px',
        color: C.fg,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img */}
        <img src={logo} width={64} height={64} alt="" style={{ borderRadius: 12 }} />
        <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>RavenX</span>
      </div>
      {children}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `2px solid ${C.line}`,
          paddingTop: 24,
          fontSize: 26,
          color: C.muted,
        }}
      >
        <span>{TAGLINE}</span>
        <span style={{ color: C.accent }}>ravenx.app</span>
      </div>
    </div>
  )
}

/** A promise that gives up after `ms`, so a slow API can't stall a crawler. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}
