'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from "next/image"
import authBgImage from '@/public/auth-bg.jpg'

const DEFAULT_SIGNED_IN_PATH = '/calendar'

function getSafeNextPath(rawPath: string | null) {
  if (rawPath && rawPath.startsWith('/') && !rawPath.startsWith('//') && !rawPath.startsWith('/api/')) {
    return rawPath
  }

  return DEFAULT_SIGNED_IN_PATH
}

function AuthPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [activeTab, setActiveTab] = useState('signin')
  const nextPath = getSafeNextPath(searchParams.get('next'))

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace(nextPath)
      }
    }
    checkSession()
  }, [nextPath, router])

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(nextPath)
    }
  }, [authLoading, nextPath, router, user])

  if (authLoading || user) {
    return <div className="min-h-[calc(100vh-4rem)]" />
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (authData.session) {
        toast.success('Account created successfully')
      } else {
        toast.success('Check your email for the confirmation link')
        setActiveTab('signin')
      }

      setEmail('')
      setPassword('')
    } catch {
      console.error('Sign up failed')
      toast.error('An error occurred during sign up')
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Sign in failed')
        setError(error.message)
        return
      }

      router.replace(nextPath)
    } catch {
      console.error('Sign in failed')
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      toast.error('Please enter your email')
      return
    }

    setIsResetting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      })

      if (error) {
        toast.error('Failed to send reset email')
        console.error('Password reset failed')
      } else {
        toast.success('Password reset email sent')
        setShowForgotPassword(false)
        setResetEmail('')
      }
    } catch {
      console.error('Password reset request failed')
      toast.error('An error occurred')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      {/* Background Image */}
      <Image
        src={authBgImage}
        alt="Background"
        fill
        priority
        className="object-cover"
      />
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-foreground/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/30 to-background/55" />
      
      {/* Content */}
      <div className="relative z-10 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md border-border/80 bg-card/95 backdrop-blur-md shadow-xl">
          <CardHeader className="space-y-1">
            <h2 className="text-center text-2xl font-semibold tracking-tight">Welcome</h2>
            <p className="text-sm text-muted-foreground text-center">
              Sign in to your account to continue
            </p>
          </CardHeader>
          
          <Tabs defaultValue="signin" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <CardContent className="pt-6">
              {error && (
                <div className="mb-4 rounded-lg bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Loading...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Loading...' : 'Sign Up'}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500">
                Enter your email address and we will send you a link to reset your password.
              </label>
              <Input
                type="email"
                placeholder="Email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForgotPassword(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isResetting}>
                {isResetting ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)]" />}>
      <AuthPageContent />
    </Suspense>
  )
}
