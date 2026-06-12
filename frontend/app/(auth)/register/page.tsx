'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, User, Building, ArrowRight, ShieldCheck } from 'lucide-react';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const registerSchema = z.object({
  fullName: z.string().min(2, { message: 'Full name must be at least 2 characters long' }),
  email: z.string().email({ message: 'Please enter a valid email address' }),
  organizationName: z.string().min(2, { message: 'Organization name must be at least 2 characters long' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
});

type RegisterSchema = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterSchema) => {
    setIsLoading(true);
    try {
      // Send registration call
      const response = await apiClient.post('/api/v1/auth/register', {
        email: data.email,
        full_name: data.fullName,
        organization_name: data.organizationName,
        password: data.password,
      });

      login(response.data);
      toast.success('Successfully created account and organization!');
      router.push('/');
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Registration error', error);
      
      // In development, let them bypass if backend registration is not fully configured
      if (process.env.NODE_ENV === 'development') {
        toast.info('Bypassing registration with mock account for development mode.');
        const mockAuth = {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
          user: {
            id: 'c59b5ea0cc68-user-id-1234',
            email: data.email,
            full_name: data.fullName,
            is_active: true,
            is_superuser: false,
            email_verified: false,
            last_login_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          memberships: [
            {
              id: 'membership-id-1',
              org_id: 'org-id-1',
              user_id: 'c59b5ea0cc68-user-id-1234',
              role: 'owner' as const,
              joined_at: new Date().toISOString(),
              org: {
                id: 'org-id-1',
                name: data.organizationName,
                slug: data.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                settings: {},
                stripe_customer_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            },
          ],
        };
        login(mockAuth);
        router.push('/');
        return;
      }

      toast.error(error.response?.data?.message || 'Failed to register. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#0A0A0C] text-white min-h-screen">
      {/* Background Glows */}
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[70%] h-[40%] bg-gradient-to-tr from-violet-600/10 to-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6 animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center gap-2 bg-gradient-to-br from-violet-500 to-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-violet-500/10">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-b from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            Get started today
          </h1>
          <p className="text-sm text-neutral-400">
            Create an account to deploy your private RAG workspace
          </p>
        </div>

        <Card className="bg-[#121217]/50 border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-violet-500/15">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-neutral-200 font-bold">Register</CardTitle>
            <CardDescription className="text-neutral-500 text-xs">
              Fill in the details to initialize your tenant workspace
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-neutral-400 text-xs font-semibold">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-600" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    className="pl-10 h-11 bg-neutral-950/40 border-neutral-900 text-neutral-200 placeholder:text-neutral-700 focus-visible:ring-violet-500/25 focus-visible:ring-offset-0 focus-visible:border-violet-500/40"
                    {...register('fullName')}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-red-400 text-xs mt-1 font-medium">{errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-neutral-400 text-xs font-semibold">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-600" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    className="pl-10 h-11 bg-neutral-950/40 border-neutral-900 text-neutral-200 placeholder:text-neutral-700 focus-visible:ring-violet-500/25 focus-visible:ring-offset-0 focus-visible:border-violet-500/40"
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-red-400 text-xs mt-1 font-medium">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationName" className="text-neutral-400 text-xs font-semibold">Organization / Workspace Name</Label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-600" />
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder="Acme Corp"
                    className="pl-10 h-11 bg-neutral-950/40 border-neutral-900 text-neutral-200 placeholder:text-neutral-700 focus-visible:ring-violet-500/25 focus-visible:ring-offset-0 focus-visible:border-violet-500/40"
                    {...register('organizationName')}
                  />
                </div>
                {errors.organizationName && (
                  <p className="text-red-400 text-xs mt-1 font-medium">{errors.organizationName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-neutral-400 text-xs font-semibold">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-neutral-600" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-11 bg-neutral-950/40 border-neutral-900 text-neutral-200 placeholder:text-neutral-700 focus-visible:ring-violet-500/25 focus-visible:ring-offset-0 focus-visible:border-violet-500/40"
                    {...register('password')}
                  />
                </div>
                {errors.password && (
                  <p className="text-red-400 text-xs mt-1 font-medium">{errors.password.message}</p>
                )}
              </div>
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-violet-500/10 transition-all duration-300 cursor-pointer rounded-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    Start Free Trial <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <div className="text-center text-xs text-neutral-500 w-full mt-1">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-bold text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
