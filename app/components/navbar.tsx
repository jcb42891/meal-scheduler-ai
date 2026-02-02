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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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

  return (
    <nav className="border-b border-border/60 bg-card/90 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-semibold text-foreground">
            Pantry Planner
          </Link>

          {/* Desktop menu */}
          <div className="hidden sm:flex items-center gap-8">
            {!loading && user && navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-foreground',
                  pathname === item.href
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {loading ? (
            <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse" aria-hidden="true" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="sm:hidden border-b mb-2 pb-2">
                  {navItems.map(item => (
                    <Link key={item.href} href={item.href}>
                      <DropdownMenuItem className="cursor-pointer">
                        {item.label}
                      </DropdownMenuItem>
                    </Link>
                  ))}
                </div>
                <DropdownMenuItem onClick={() => signOut()}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/auth">
              <Button>Sign In</Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
} 
