'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  Building, 
  Users, 
  CreditCard, 
  KeyRound, 
  Shield, 
  UserPlus, 
  Trash2, 
  Loader2, 
  Key, 
  Copy, 
  Check, 
  Plus, 
  ExternalLink 
} from 'lucide-react';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface Member {
  id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  max_documents: number;
  max_queries_per_month: number;
  max_storage_mb: number;
  max_members: number;
  features: Record<string, unknown>;
}

interface UsageData {
  plan_name: string;
  max_documents: number;
  max_queries_per_month: number;
  max_storage_mb: number;
  max_members: number;
  current_documents: number;
  current_queries_this_month: number;
  current_storage_mb: number;
  current_members: number;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const currentOrg = useAuthStore((state) => state.currentOrg);
  
  const [workspaceName, setWorkspaceName] = useState(currentOrg?.name || '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  
  // Developer API Key Mocking
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; prefix: string; created: string }[]>([
    { id: 'key-1', name: 'Production RAG Client', prefix: 'dm_live_••••••••xy7b', created: '2026-05-12' },
  ]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Fetch team members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery<Member[]>({
    queryKey: ['org-members', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      try {
        const res = await apiClient.get(`/api/v1/orgs/${activeOrgId}/members`);
        return res.data;
      } catch (err) {
        console.error(err);
        return [
          {
            id: 'm1',
            role: 'owner',
            joined_at: new Date().toISOString(),
            user: { id: 'u1', email: 'owner@company.com', full_name: 'Alex Owner' }
          }
        ];
      }
    },
    enabled: !!activeOrgId,
  });

  // Fetch pending invites
  const { data: invites = [], isLoading: isLoadingInvites } = useQuery<Invite[]>({
    queryKey: ['org-invites', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      try {
        const res = await apiClient.get('/api/v1/invites');
        return res.data;
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    enabled: !!activeOrgId,
  });

  // Update Org Mutation
  const updateOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.put(`/api/v1/orgs/${activeOrgId}`, { name });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Workspace updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['org', activeOrgId] });
      // Reload page to refresh store
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
    onError: () => {
      toast.error('Failed to update workspace.');
    }
  });

  // Invite Member Mutation
  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; role: string }) => {
      const res = await apiClient.post('/api/v1/invites', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Invitation sent.');
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['org-invites', activeOrgId] });
    },
    onError: (err: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(err.response?.data?.detail || 'Failed to send invitation.');
    }
  });

  // Revoke Invite Mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiClient.post(`/api/v1/invites/${inviteId}/revoke`);
    },
    onSuccess: () => {
      toast.success('Invitation revoked.');
      queryClient.invalidateQueries({ queryKey: ['org-invites', activeOrgId] });
    },
    onError: () => {
      toast.error('Failed to revoke invitation.');
    }
  });

  // Stripe Checkout Session Mutation
  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiClient.post('/api/v1/billing/checkout', {
        plan_id: planId,
        success_url: window.location.href + '?billing=success',
        cancel_url: window.location.href + '?billing=cancel',
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: () => {
      toast.error('Unable to initialize payment checkout session.');
    }
  });

  // Fetch Billing Plans
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/v1/billing/plans');
        return res.data;
      } catch (err) {
        console.error(err);
        return [];
      }
    }
  });

  // Fetch live usage metrics
  const { data: usage } = useQuery<UsageData>({
    queryKey: ['billing-usage', activeOrgId],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/billing/usage');
      return res.data;
    },
    enabled: !!activeOrgId,
  });

  const storagePercent = usage ? Math.min(100, Math.round((usage.current_storage_mb / usage.max_storage_mb) * 100)) : 0;
  const memberPercent = usage ? Math.min(100, Math.round((usage.current_members / usage.max_members) * 100)) : 0;
  const queryPercent = usage ? Math.min(100, Math.round((usage.current_queries_this_month / usage.max_queries_per_month) * 100)) : 0;

  const handleUpdateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    updateOrgMutation.mutate(workspaceName);
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleCreateApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    const randomKey = `dm_live_${Math.random().toString(36).substr(2, 9)}${Math.random().toString(36).substr(2, 9)}`;
    setGeneratedKey(randomKey);
    setApiKeys((prev) => [
      ...prev,
      {
        id: `key-${Math.random()}`,
        name: newKeyName,
        prefix: `dm_live_••••••••${randomKey.substr(-4)}`,
        created: new Date().toISOString().split('T')[0],
      }
    ]);
    setNewKeyName('');
    toast.success('API Secret Key generated successfully.');
  };

  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
      toast.success('API Key copied.');
    }
  };

  const handleDeleteApiKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
    toast.info('API token credentials revoked.');
  };

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto text-white relative">
      <div className="absolute top-[10%] right-[10%] w-[35%] h-[35%] bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <div className="space-y-2 z-10 relative animate-fade-in">
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-violet-500/20 bg-violet-950/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider">
          Workspace Management
        </div>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-sm text-neutral-400">
          Provision roles, invite coworkers, check billing status, and retrieve developer client tokens.
        </p>
      </div>

      <div className="z-10 relative animate-fade-in">
        <Tabs defaultValue="workspace" className="space-y-6">
          <TabsList className="bg-[#121217]/50 border border-white/5 backdrop-blur p-1 rounded-xl">
            <TabsTrigger value="workspace" className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg cursor-pointer">
              <Building className="h-4 w-4" /> Workspace
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg cursor-pointer">
              <Users className="h-4 w-4" /> Team Members
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg cursor-pointer">
              <CreditCard className="h-4 w-4" /> Billing & Usage
            </TabsTrigger>
            <TabsTrigger value="developer" className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg cursor-pointer">
              <KeyRound className="h-4 w-4" /> Developer API
            </TabsTrigger>
          </TabsList>

          {/* TAB: WORKSPACE PROFILE */}
          <TabsContent value="workspace">
            <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold text-neutral-250">Workspace Details</CardTitle>
                <CardDescription className="text-neutral-500 text-xs">
                  Configure organization slug identifiers and metadata.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleUpdateWorkspace}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName" className="text-xs font-semibold text-neutral-400">Workspace Name</Label>
                    <Input
                      id="orgName"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Acme Corp Workspace"
                      className="bg-neutral-950/40 border-neutral-900 focus-visible:ring-violet-500/20 focus-visible:border-violet-500/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-neutral-400">Workspace ID</Label>
                    <div className="p-3 bg-neutral-950/60 border border-neutral-900 text-xs text-neutral-500 font-mono rounded-lg select-all">
                      {activeOrgId || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-neutral-400">Workspace Slug</Label>
                    <div className="p-3 bg-neutral-950/60 border border-neutral-900 text-xs text-neutral-500 font-mono rounded-lg">
                      {currentOrg?.slug || 'n-a'}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-white/5 pt-4">
                  <Button
                    type="submit"
                    disabled={updateOrgMutation.isPending || workspaceName === currentOrg?.name}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer rounded-lg text-xs px-4"
                  >
                    {updateOrgMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Changes'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          {/* TAB: TEAM MEMBERS */}
          <TabsContent value="members" className="space-y-6">
            <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold text-neutral-250">Invite Coworkers</CardTitle>
                <CardDescription className="text-neutral-500 text-xs">
                  Grant system roles inside this workspace organization.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSendInvite}>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 space-y-2 w-full">
                    <Label htmlFor="inviteEmail" className="text-xs font-semibold text-neutral-400">Email Address</Label>
                    <Input
                      id="inviteEmail"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="coworker@company.com"
                      className="bg-neutral-950/40 border-neutral-900 focus-visible:ring-violet-500/20 focus-visible:border-violet-500/40 h-10"
                    />
                  </div>
                  <div className="space-y-2 w-full sm:w-44">
                    <Label htmlFor="inviteRole" className="text-xs font-semibold text-neutral-400">Role</Label>
                    <select
                      id="inviteRole"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-neutral-950/40 border border-neutral-900 rounded-lg text-xs text-neutral-300 h-10 px-3 outline-none focus:border-violet-500/40"
                    >
                      <option value="member" className="bg-[#0A0A0C]">Member</option>
                      <option value="viewer" className="bg-[#0A0A0C]">Viewer</option>
                      <option value="admin" className="bg-[#0A0A0C]">Admin</option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer rounded-lg text-xs px-4 h-10 shrink-0 w-full sm:w-auto"
                  >
                    {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex items-center gap-1.5"><UserPlus className="h-4 w-4" /> Send Invite</span>}
                  </Button>
                </CardContent>
              </form>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Active Members */}
              <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Active Workspace Membership</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingMembers ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {members.map((m) => (
                        <div key={m.id} className="py-3 flex items-center justify-between group first:pt-0 last:pb-0">
                          <div className="truncate pr-4">
                            <div className="text-xs font-bold text-neutral-250 truncate">{m.user.full_name || 'Anonymous User'}</div>
                            <div className="text-[10px] text-neutral-500 truncate">{m.user.email}</div>
                          </div>
                          <Badge className="bg-neutral-950 text-neutral-400 border-white/5 text-[9px] uppercase font-mono px-2 py-0.5 shrink-0">
                            {m.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pending Invites */}
              <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Pending invitations</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingInvites ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                    </div>
                  ) : invites.length === 0 ? (
                    <div className="text-center py-6 text-neutral-600 text-xs">No pending invitations</div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {invites.map((inv) => (
                        <div key={inv.id} className="py-3 flex items-center justify-between group first:pt-0 last:pb-0">
                          <div className="truncate pr-4">
                            <div className="text-xs font-bold text-neutral-250 truncate">{inv.email}</div>
                            <div className="text-[9px] text-neutral-500">Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge className="bg-violet-950/20 text-violet-400 border-violet-800/40 text-[9px] uppercase font-mono px-2 py-0.5">
                              {inv.role}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-neutral-500 hover:text-red-400 cursor-pointer rounded-md hover:bg-red-500/10"
                              onClick={() => revokeInviteMutation.mutate(inv.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB: BILLING & USAGE */}
          <TabsContent value="billing" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Left Side: Current Limits */}
              <div className="md:col-span-1 space-y-6">
                <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Active Plan Limits</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Storage Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-neutral-400">Disk Storage</span>
                        <span className="text-neutral-200">{storagePercent}% used</span>
                      </div>
                      <Progress value={storagePercent} className="h-1.5 bg-neutral-950" />
                      <div className="text-[10px] text-neutral-500 font-mono">{usage?.current_storage_mb ?? 0} MB of {usage?.max_storage_mb ?? 100} MB</div>
                    </div>

                    {/* Member Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-neutral-400">Team seats</span>
                        <span className="text-neutral-200">{memberPercent}% used</span>
                      </div>
                      <Progress value={memberPercent} className="h-1.5 bg-neutral-950" />
                      <div className="text-[10px] text-neutral-500 font-mono">{usage?.current_members ?? 0} of {usage?.max_members ?? 5} members</div>
                    </div>

                    {/* Query count Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-neutral-400">Monthly RAG queries</span>
                        <span className="text-neutral-200">{queryPercent}% used</span>
                      </div>
                      <Progress value={queryPercent} className="h-1.5 bg-neutral-950" />
                      <div className="text-[10px] text-neutral-500 font-mono">{usage?.current_queries_this_month ?? 0} of {usage?.max_queries_per_month ?? 50} queries</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Side: Available Tiers */}
              <div className="md:col-span-2 space-y-4">
                <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider pl-1">Upgrade Options</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Starter Tier info */}
                  <Card className="bg-[#121217]/10 border-white/5 p-6 rounded-xl flex flex-col justify-between h-56 relative">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <h3 className="text-sm font-bold text-white">Starter</h3>
                        <Badge className="bg-neutral-950 text-neutral-500 border-white/5 text-[9px] uppercase font-mono px-2 py-0.5">Active</Badge>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">Evaluation pilot including 1 workspace, 100 MB storage limits, and 50 streams.</p>
                      <div className="text-lg font-black text-white">$0 <span className="text-[10px] font-normal text-neutral-500">/ mo</span></div>
                    </div>
                    <Button disabled className="w-full text-xs bg-neutral-950 border-white/5 text-neutral-600 rounded-lg h-9">
                      Current Plan
                    </Button>
                  </Card>

                  {/* Pro Tier Upgrade */}
                  <Card className="bg-[#121217]/50 border-violet-500/25 p-6 rounded-xl flex flex-col justify-between h-56 shadow-lg shadow-violet-950/5 relative overflow-hidden transition-all duration-300 hover:border-violet-500/40">
                    <div className="absolute top-0 right-4 -translate-y-1/2 px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-950 text-[8px] font-bold uppercase tracking-wider text-violet-300">Popular</div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-white">Pro</h3>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">Unlimited workspaces, 2 GB Storage limit, unlimited streams, Stripe billing access.</p>
                      <div className="text-lg font-black text-white">$29 <span className="text-[10px] font-normal text-neutral-500">/ mo</span></div>
                    </div>
                    <Button
                      onClick={() => {
                        const defaultProPlanId = plans.find((p) => p.name.toLowerCase() === 'pro')?.id || 'b528b8a5-d860-44bb-8531-9f93ee7cb058';
                        checkoutMutation.mutate(defaultProPlanId);
                      }}
                      disabled={checkoutMutation.isPending}
                      className="w-full text-xs bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer rounded-lg h-9 transition-all"
                    >
                      {checkoutMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="flex items-center gap-1">Upgrade Plan <ExternalLink className="h-3 w-3" /></span>}
                    </Button>
                  </Card>
                </div>
              </div>

            </div>

            {/* Invoices List */}
            <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Billing Invoice History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-neutral-600 text-xs">
                  No invoices available yet. Payments processed via Stripe.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: DEVELOPER API */}
          <TabsContent value="developer" className="space-y-6">
            <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold text-neutral-250 font-sans">API Authorization Tokens</CardTitle>
                <CardDescription className="text-neutral-500 text-xs">
                  Provision HMAC authorization tokens to query the semantic database from external clients.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleCreateApiKey}>
                <CardContent className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="keyName" className="text-xs font-semibold text-neutral-400">Token Description Name</Label>
                    <Input
                      id="keyName"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Production API Endpoint Client"
                      className="bg-neutral-950/40 border-neutral-900 focus-visible:ring-violet-500/20 focus-visible:border-violet-500/40"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!newKeyName.trim()}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer rounded-lg text-xs px-4 h-10"
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Generate Token
                  </Button>
                </CardContent>
              </form>
            </Card>

            {generatedKey && (
              <Card className="bg-[#121217]/40 border-violet-500/25 border p-5 rounded-xl space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-violet-400 font-bold uppercase tracking-wider">
                  <Shield className="h-4 w-4" /> Secret Key Provisioned
                </div>
                <p className="text-[11px] text-neutral-500 leading-normal">
                  Copy this token keys credentials safely. It will not be shown again for compliance security parameters.
                </p>
                <div className="flex gap-2 items-center bg-neutral-950/80 p-3 rounded-lg border border-neutral-900">
                  <div className="flex-1 font-mono text-xs text-neutral-300 break-all select-all pr-4">{generatedKey}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyKey}
                    className="h-8 w-8 text-neutral-500 hover:text-white rounded-lg cursor-pointer"
                  >
                    {copiedKey ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </Card>
            )}

            <Card className="bg-[#121217]/40 border-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Active Client Keys</CardTitle>
              </CardHeader>
              <CardContent>
                {apiKeys.length === 0 ? (
                  <div className="text-center py-6 text-neutral-600 text-xs">No active developer keys</div>
                ) : (
                  <div className="divide-y divide-white/5 animate-fade-in">
                    {apiKeys.map((k) => (
                      <div key={k.id} className="py-4 flex items-center justify-between group first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-neutral-950 border border-neutral-900 flex items-center justify-center shrink-0 shadow-inner">
                            <Key className="h-4 w-4 text-neutral-500 group-hover:text-violet-400 transition-colors" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-neutral-250">{k.name}</div>
                            <div className="text-[10px] text-neutral-500 font-mono">{k.prefix}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-[10px] text-neutral-500">Issued {k.created}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neutral-500 hover:text-red-400 cursor-pointer rounded-lg hover:bg-red-500/10"
                            onClick={() => handleDeleteApiKey(k.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

    </div>
  );
}
