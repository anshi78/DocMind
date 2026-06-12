import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, OrgMembership, AuthResponse, Organization } from '../../types/api';

interface AuthState {
  user: User | null;
  memberships: OrgMembership[];
  accessToken: string | null;
  refreshToken: string | null;
  activeOrgId: string | null;
  currentOrg: Organization | null;
  isAuthenticated: boolean;
  
  login: (data: AuthResponse) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setActiveOrgId: (orgId: string | null) => void;
  updateUser: (user: User) => void;
  updateMemberships: (memberships: OrgMembership[]) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      memberships: [],
      accessToken: null,
      refreshToken: null,
      activeOrgId: null,
      currentOrg: null,
      isAuthenticated: false,

      login: (data) => {
        const defaultMembership = data.memberships.length > 0 ? data.memberships[0] : null;
        const defaultOrgId = defaultMembership ? defaultMembership.org_id : null;
        const defaultOrg = defaultMembership?.org || null;
        
        set({
          user: data.user,
          memberships: data.memberships,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          activeOrgId: defaultOrgId,
          currentOrg: defaultOrg,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          user: null,
          memberships: [],
          accessToken: null,
          refreshToken: null,
          activeOrgId: null,
          currentOrg: null,
          isAuthenticated: false,
        });
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
      },

      setActiveOrgId: (activeOrgId) => {
        set((state) => {
          const membership = state.memberships.find((m) => m.org_id === activeOrgId);
          return {
            activeOrgId,
            currentOrg: membership?.org || null,
          };
        });
      },

      updateUser: (user) => {
        set({ user });
      },

      updateMemberships: (memberships) => {
        set((state) => {
          const hasActive = memberships.some((m) => m.org_id === state.activeOrgId);
          const nextActiveMembership = hasActive 
            ? memberships.find((m) => m.org_id === state.activeOrgId)
            : (memberships.length > 0 ? memberships[0] : null);
            
          return {
            memberships,
            activeOrgId: nextActiveMembership ? nextActiveMembership.org_id : null,
            currentOrg: nextActiveMembership?.org || null,
          };
        });
      },
    }),
    {
      name: 'documind-auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
