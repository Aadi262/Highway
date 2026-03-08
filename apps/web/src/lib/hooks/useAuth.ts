'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../store'
import { auth } from '../api'

export function useAuth(requireAuth = true) {
  const { token, user, setUser, logout } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
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
  }, [token, user, requireAuth, router, setUser, logout])

  return { user, token, logout, isLoading: !!token && !user }
}
