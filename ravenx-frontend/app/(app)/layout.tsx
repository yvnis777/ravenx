import { TopNav } from '@/components/nav/TopNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-[200] rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium
          text-on-accent focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="main-content" className="flex-1 overflow-auto animate-fade-in">
        {children}
      </main>
    </div>
  )
}
