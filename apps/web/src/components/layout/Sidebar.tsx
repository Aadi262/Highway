'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  Database,
  Settings,
  LogOut,
  Server,
  Activity,
  ChevronRight,
  Layers,
} from 'lucide-react'
import Image from 'next/image'

const navItems = [
  { href: '/projects', label: 'Projects', icon: LayoutGrid },
  { href: '/databases', label: 'Databases', icon: Database },
  { href: '/monitoring', label: 'Monitoring', icon: Activity },
  { href: '/templates', label: 'Templates', icon: Layers },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-surface border-r border-border flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-border">
        <Link href="/projects" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent rounded flex items-center justify-center">
            <Server className="w-4 h-4 text-black" />
          </div>
          <span className="font-semibold text-sm tracking-tight">
            High<span className="text-muted-foreground">way</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors',
                active
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded hover:bg-white/5 transition-colors">
          {user?.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.username}
              width={28}
              height={28}
              className="rounded-full"
            />
          ) : (
            <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center text-xs">
              {user?.username?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
          </div>
          <button
            onClick={logout}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
