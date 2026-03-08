import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  name: string
  avatarUrl: string
}

interface AuthStore {
  token: string | null
  user: User | null
  _hasHydrated: boolean
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,
      setToken: (token) => {
        set({ token })
        localStorage.setItem('highway_token', token)
      },
      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem('highway_token')
        set({ token: null, user: null })
      },
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'highway-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
