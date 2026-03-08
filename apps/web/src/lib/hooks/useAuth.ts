'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../store'
import { auth } from '../api'

export function useAuth(requireAuth = true) {
  const { token, user, _hasHydrated, setUser, logout } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before making decisions
    if (!_hasHydrated) return

    if (!token && requireAuth) {
      router.push('/login')
      return
    }
    if (token && !user) {
      auth.me().then(setUser).catch(() => {
        logout()
        router.push('/login')
      })
    }
  }, [token, user, _hasHydrated, requireAuth, router, setUser, logout])

  // Show loading until hydrated, or while fetching user
  return { user, token, logout, isLoading: !_hasHydrated || (!!token && !user) }
}
