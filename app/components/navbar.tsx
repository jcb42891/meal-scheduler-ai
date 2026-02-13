'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, Menu } from 'lucide-react'

export function Navbar() {
  const { user, signOut, loading } = useAuth()
  const pathname = usePathname()

  const navItems = [
    { href: '/calendar', label: 'Calendar' },
    { href: '/meals', label: 'Meal Library' },
    { href: '/staples', label: 'Staple Ingredients' },
    { href: '/groups', label: 'Groups' },
    { href: '/profile', label: 'Profile' },
  ]

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Pantry Planner
          </Link>

          {loading ? (
            <div className="hidden md:flex items-center gap-2">
              <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
              <div className="h-8 w-24 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
              <div className="h-8 w-16 animate-pulse rounded-full bg-muted/80" aria-hidden="true" />
            </div>
          ) : user ? (
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border/70 bg-card/80 p-1 shadow-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center gap-2" aria-hidden="true">
            <div className="h-9 w-9 animate-pulse rounded-md bg-muted/80 md:hidden" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted/80" />
          </div>
        ) : user ? (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden border-border/70 bg-card"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={cn(isActive(item.href) && 'font-semibold text-foreground')}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border border-border/70">
                    <AvatarFallback className="bg-surface-2 text-foreground font-semibold">
                      {user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="text-xs uppercase tracking-wide text-muted-foreground">
                  {user.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link href="/auth">
            <Button>Sign In</Button>
          </Link>
        )}
      </div>
      {loading ? (
        <div className="border-t border-border/70 bg-card/70 px-4 py-2 md:hidden sm:px-6" aria-hidden="true">
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto pb-1">
            <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-muted/80" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-muted/80" />
          </div>
        </div>
      ) : user ? (
        <div className="border-t border-border/70 bg-card/70 px-4 py-2 md:hidden sm:px-6">
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive(item.href)
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/70 bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  )
} 
