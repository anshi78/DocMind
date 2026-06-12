export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  org?: Organization;
  user?: User;
}

export interface Document {
  id: string;
  org_id: string;
  name: string;
  extension: string;
  created_at: string;
  updated_at: string;
  latest_version?: DocumentVersion;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_num: number;
  storage_key: string;
  size_bytes: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  meta: Record<string, any>;
  created_at: string;
}

export interface Chunk {
  id: string;
  version_id: string;
  chunk_index: number;
  content: string;
  meta: Record<string, any>;
}

export interface Citation {
  id: string;
  message_id: string;
  chunk_id: string;
  relevance_score: number;
  position: number;
  chunk?: Chunk & { version?: DocumentVersion & { document?: Document } };
}

export interface Conversation {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  document_scope: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number | null;
  from_cache: boolean;
  created_at: string;
  citations?: Citation[];
}

export interface Plan {
  id: string;
  name: string;
  stripe_price_id: string | null;
  max_documents: number;
  max_queries_per_month: number;
  max_storage_mb: number;
  max_members: number;
  features: Record<string, any>;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  created_at: string;
  plan?: Plan;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  memberships: OrgMembership[];
}
