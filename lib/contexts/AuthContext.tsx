'use client'

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, session: null, loading: true, signOut: async () => {} })

async function ensureProfileForUser(user: User) {
  const normalizedEmail = user.email?.trim().toLowerCase()
  if (!normalizedEmail) {
    return true
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: normalizedEmail,
      },
      {
        onConflict: 'id',
      },
    )

  if (error) {
    console.error('Failed to ensure profile exists')
    return false
  }

  return true
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const ensuredProfileForUserId = useRef<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Check active sessions
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        const didEnsureProfile = await ensureProfileForUser(session.user)
        if (didEnsureProfile) {
          ensuredProfileForUserId.current = session.user.id
        }
      } else {
        ensuredProfileForUserId.current = null
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      if (!session?.user) {
        ensuredProfileForUserId.current = null
        return
      }

      if (ensuredProfileForUserId.current === session.user.id) {
        return
      }

      void ensureProfileForUser(session.user).then((didEnsureProfile) => {
        if (didEnsureProfile) {
          ensuredProfileForUserId.current = session.user.id
        }
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    router.push('/auth')
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext) 
