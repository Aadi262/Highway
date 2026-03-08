'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

export default function AuthCallbackPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { setToken } = useAuthStore()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      setToken(token)
      router.push('/projects')
    } else {
      router.push('/login?error=no_token')
    }
  }, [params, router, setToken])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        Signing in...
      </div>
    </div>
  )
}
