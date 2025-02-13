'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from "next/image"
import authBgImage from '@/public/auth-bg.jpg'


export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [activeTab, setActiveTab] = useState('signin')

  // Add session check on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Initial session check:', session)
      if (session) {
        console.log('Session exists, redirecting to calendar')
        router.replace('/calendar')
      }
    }
    checkSession()
  }, [router])

  console.log('Auth page rendered', new Date().toISOString())

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password
      })

      console.log('Sign up response:', { authData, authError })

      if (authError) {
        setError(authError.message)
        return
      }

      if (authData.user) {
        // Manually create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            { id: authData.user.id, email: authData.user.email }
          ])

        if (profileError) {
          console.error('Profile creation error:', profileError)
        }
      }

      toast.success('Check your email for the confirmation link')
      setActiveTab('signin')
      setEmail('')
      setPassword('')
    } catch (err) {
      console.error('Sign up error:', err)
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
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Sign in error details:', error)
        setError(error.message)
        return
      }

      console.log('Sign in successful:', data)
      router.replace('/calendar')
    } catch (err) {
      console.error('Sign in error:', err)
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
        console.error('Reset password error:', error)
      } else {
        toast.success('Password reset email sent')
        setShowForgotPassword(false)
        setResetEmail('')
      }
    } catch (err) {
      console.error('Error:', err)
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
      <div className="absolute inset-0 bg-black/20" />
      
      {/* Content */}
      <div className="relative z-10 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur-sm shadow-xl">
          <CardHeader className="space-y-1">
            <h2 className="text-2xl font-bold text-center">Welcome</h2>
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
                Enter your email address and we'll send you a link to reset your password.
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