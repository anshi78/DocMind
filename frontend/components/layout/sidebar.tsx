'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Files, Search, Settings, ShieldAlert, Cpu, HardDrive } from 'lucide-react';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { OrgSwitcher } from './org-switcher';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface Conversation {
  id: string;
  title: string | null;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const user = useAuthStore((state) => state.user);

  // Fetch recent conversations for active org
  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ['conversations', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      try {
        const res = await apiClient.get('/api/v1/conversations');
        return res.data;
      } catch (err) {
        console.error('Failed to fetch conversations', err);
        // Fallback to dummy data in development mode
        return [
          { id: '1', title: 'Self-Supervised Learning Overview' },
          { id: '2', title: 'Q3 Financial PDF Questions' },
          { id: '3', title: 'FastAPI SQLAlchemy Integration' },
        ];
      }
    },
    enabled: !!activeOrgId,
  });

  const mainNav = [
    { name: 'Chat Assistant', href: '/chat', icon: MessageSquare },
    { name: 'Documents', href: '/documents', icon: Files },
    { name: 'Semantic Search', href: '/search', icon: Search },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-neutral-800 bg-neutral-950 flex flex-col z-30 h-screen">
      {/* Header Logo */}
      <div className="h-16 px-6 border-b border-neutral-800 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Cpu className="h-4 w-4 text-white" />
        </div>
        <span className="font-extrabold text-lg bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
          DocuMind
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-800/40 bg-violet-950/40 text-violet-400 font-semibold uppercase">
          Beta
        </span>
      </div>

      {/* Organization / Tenant Switcher */}
      <div className="p-4">
        <OrgSwitcher />
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        <div className="space-y-1">
          {mainNav.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-400 hover:bg-neutral-900/40 hover:text-neutral-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-violet-500' : 'text-neutral-500'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Recent Chats Section */}
        <div className="pt-6">
          <h3 className="px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">
            Recent Chats
          </h3>
          <div className="space-y-0.5">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-neutral-500">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-600">No chats yet</div>
            ) : (
              conversations.map((chat) => {
                const isActive = pathname === `/chat/${chat.id}`;
                return (
                  <Link
                    key={chat.id}
                    href={`/chat/${chat.id}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium truncate transition-colors ${
                      isActive
                        ? 'bg-neutral-900 text-violet-400'
                        : 'text-neutral-400 hover:bg-neutral-900/40 hover:text-neutral-200'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
                    <span className="truncate">{chat.title || 'Untitled Conversation'}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </nav>

      {/* Quota Limits / Storage Usage Indicator */}
      <div className="p-4 border-t border-neutral-900 bg-neutral-950/80">
        <div className="space-y-3 bg-neutral-900/40 border border-neutral-900 p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-neutral-400 flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-neutral-500" /> Storage Limit
            </span>
            <span className="text-neutral-200">12%</span>
          </div>
          <Progress value={12} className="h-1.5 bg-neutral-800" />
          <div className="text-[10px] text-neutral-500 leading-tight">
            Using 12 MB of 100 MB total space. Upgrade plan for higher limits.
          </div>
        </div>
      </div>
    </aside>
  );
}
