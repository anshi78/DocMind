'use client'
import { useAuthStore } from '@/lib/stores/auth-store'

export function OrgSwitcher() {
  const { currentOrg } = useAuthStore()
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200">
      <div className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-xs font-bold text-white">
        {currentOrg?.name?.[0] || 'D'}
      </div>
      <span className="text-sm font-medium truncate">{currentOrg?.name || 'My Org'}</span>
    </div>
  )
}
