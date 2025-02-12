'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  // Get initials from email
  const getInitials = (email: string) => {
    return email.split('@')[0].substring(0, 2).toUpperCase()
  }

  const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
    const isActive = pathname === href
    return (
      <Link
        href={href}
        className={cn(
          "text-sm font-medium transition-colors hover:text-primary",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {children}
      </Link>
    )
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[#98C1B2] bg-white/80 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-2xl font-serif text-[#2F4F4F] hover:text-[#98C1B2] transition-colors">
              Pantry Planner 
            </Link>
            {user && (
              <div className="hidden md:flex items-center gap-4">
                <Link 
                  href="/calendar" 
                  className="text-[#2F4F4F] hover:text-[#98C1B2] font-medium transition-colors"
                >
                  Calendar
                </Link>
                <Link 
                  href="/meals" 
                  className="text-[#2F4F4F] hover:text-[#98C1B2] font-medium transition-colors"
                >
                  Meals
                </Link>
                <Link 
                  href="/groups" 
                  className="text-[#2F4F4F] hover:text-[#98C1B2] font-medium transition-colors"
                >
                  Groups
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-10 w-10 rounded-full border-2 border-[#98C1B2] hover:bg-[#98C1B2]/10"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.user_metadata.avatar_url} />
                      <AvatarFallback className="bg-[#FF9B76]/10 text-[#2F4F4F]">
                        {user.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-serif">My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth">
                <Button className="bg-[#FF9B76] hover:bg-[#FF9B76]/90 text-white">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
} 