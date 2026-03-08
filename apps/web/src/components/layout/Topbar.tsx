'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { Search, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface Crumb {
  label: string
  href?: string
}

function useBreadcrumbs(): Crumb[] {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const crumbs: Crumb[] = [{ label: 'Home', href: '/projects' }]

  // /projects
  if (segments[0] === 'projects') {
    if (segments.length === 1) {
      crumbs.push({ label: 'Projects' })
    } else {
      crumbs.push({ label: 'Projects', href: '/projects' })
      // /projects/[projectId]
      if (segments[1]) {
        crumbs.push({ label: 'Project', href: `/projects/${segments[1]}` })
      }
      // /projects/[projectId]/services/[serviceId]
      if (segments[2] === 'services' && segments[3]) {
        crumbs.push({ label: 'Service' })
      }
    }
  } else if (segments[0] === 'databases') {
    crumbs.push({ label: 'Databases' })
  } else if (segments[0] === 'monitoring') {
    crumbs.push({ label: 'Monitoring' })
  } else if (segments[0] === 'templates') {
    crumbs.push({ label: 'Templates' })
  }

  return crumbs
}

interface TopbarProps {
  onOpenCommandPalette?: () => void
}

export function Topbar({ onOpenCommandPalette }: TopbarProps) {
  const crumbs = useBreadcrumbs()
  const { user } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header className={cn(
      'sticky top-0 z-30 h-12 flex items-center justify-between px-6 border-b border-border transition-all',
      scrolled ? 'bg-background/80 backdrop-blur-md' : 'bg-background'
    )}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 text-xs text-muted-foreground bg-surface border border-border rounded px-2.5 py-1.5 hover:text-foreground transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] bg-muted px-1 rounded">
            <span>⌘</span><span>K</span>
          </kbd>
        </button>

        {user?.avatarUrl && (
          <Image
            src={user.avatarUrl}
            alt={user.username}
            width={28}
            height={28}
            className="rounded-full border border-border"
          />
        )}
      </div>
    </header>
  )
}
