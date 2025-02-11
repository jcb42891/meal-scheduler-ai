'use client'

import { useAuth } from '@/lib/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type Profile = {
  first_name: string | null
  last_name: string | null
}

export default function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>({ first_name: '', last_name: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  useEffect(() => {
    if (!user) {
      router.push('/auth')
      return
    }

    // Fetch profile data
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data)
        setFirstName(data.first_name || '')
        setLastName(data.last_name || '')
      }
    }

    fetchProfile()
  }, [user, router])

  const handleSave = async () => {
    if (!user) return

    setIsSaving(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving profile:', error)
        alert('Failed to save profile')
      } else {
        console.log('Profile saved:', data)
        setIsEditing(false)
      }
    } catch (err) {
      console.error('Error:', err)
      alert('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!user?.email) return

    setIsResetting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/update-password`,
      })

      if (error) {
        toast.error('Failed to send reset email')
        console.error('Reset password error:', error)
      } else {
        toast.success('Password reset email sent')
      }
    } catch (err) {
      console.error('Error:', err)
      toast.error('An error occurred')
    } finally {
      setIsResetting(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id)

      if (error) {
        console.error('Update error:', error)
        throw error
      }

      // Update local profile state
      setProfile({
        ...profile,
        first_name: firstName,
        last_name: lastName
      })
      
      toast.success('Profile updated successfully')
      setIsEditing(false) // Exit edit mode
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-xl font-semibold">Account Details</h2>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleResetPassword}
                  disabled={isResetting}
                >
                  {isResetting ? 'Sending...' : 'Reset Password'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                >
                  Edit Profile
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-gray-900">{user?.email}</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">First Name</label>
              {isEditing ? (
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="text-gray-900">{profile.first_name || '-'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Last Name</label>
              {isEditing ? (
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1"
                />
              ) : (
                <p className="text-gray-900">{profile.last_name || '-'}</p>
              )}
            </div>

            {isEditing && (
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateProfile} disabled={isUpdating}>
                  {isUpdating ? 'Updating...' : 'Update Profile'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 