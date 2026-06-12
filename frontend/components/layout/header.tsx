'use client'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

export function Header() {
  const { user, logout } = useAuthStore()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await apiClient.post('/api/v1/auth/logout')
    } catch (e) {
      console.warn('Backend logout route not found, logging out locally.')
    }
    logout()
    router.push('/login')
  }

  return (
    <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 bg-neutral-950 text-neutral-200">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-400">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="cursor-pointer">
          Sign out
        </Button>
      </div>
    </header>
  )
}
