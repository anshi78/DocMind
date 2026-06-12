'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, BrainCircuit, Shield, Zap, Search, Layers, FileText, CheckCircle, Database } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function MarketingLandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  // RAG Pipeline terminal simulation state
  const [terminalStep, setTerminalStep] = useState(0);
  const [terminalText, setTerminalText] = useState('');
  const [citationsVisible, setCitationsVisible] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTerminalStep((prev) => {
        const next = (prev + 1) % 5;
        if (next === 0) {
          setTerminalText('');
          setCitationsVisible(false);
        }
        return next;
      });
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (terminalStep === 0) {
      setTimeout(() => {
        setTerminalText('');
      }, 0);
    } else if (terminalStep === 1) {
      // Typing query
      const str = 'Analyze the new standard operating procedures...';
      let i = 0;
      const typeTimer = setInterval(() => {
        if (i < str.length) {
          setTerminalText((prev) => prev + str.charAt(i));
          i++;
        } else {
          clearInterval(typeTimer);
        }
      }, 50);
      return () => clearInterval(typeTimer);
    } else if (terminalStep === 2) {
      setTimeout(() => {
        setTerminalText('Analyze the new standard operating procedures...');
      }, 0);
    } else if (terminalStep === 3) {
      // Show response streaming
      const str = 'According to Section 4.2 [1], all client records must be stored using AES-256 encryption. Access controls must be audited quarterly [2].';
      setTimeout(() => {
        setTerminalText(str);
        setCitationsVisible(true);
      }, 0);
    }
  }, [terminalStep]);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-neutral-200 selection:bg-violet-600/30 selection:text-white font-sans overflow-x-hidden relative">
      
      {/* Background elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute top-[800px] right-0 w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.03),transparent_60%)] pointer-events-none" />
      <div className="absolute top-[1800px] left-0 w-[600px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.03),transparent_60%)] pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 h-16 border-b border-white/5 bg-[#0A0A0C]/75 backdrop-blur-md z-50 flex items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <span className="font-extrabold text-lg bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent tracking-tight">
            DocuMind
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-400 font-medium">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pipeline" className="hover:text-white transition-colors">Architecture</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </nav>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link href="/chat">
              <Button size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold cursor-pointer shadow-lg shadow-violet-500/10 rounded-lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-white hover:bg-neutral-200 text-neutral-900 font-semibold cursor-pointer rounded-lg px-4">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 md:px-12 max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-500/25 bg-violet-950/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-6 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span>Next-Gen Enterprise RAG</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-tight max-w-4xl">
          Your organization&apos;s knowledge, <br />
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-violet-500 bg-clip-text text-transparent">
            instantly synthesis-ready.
          </span>
        </h1>

        <p className="mt-6 text-base md:text-lg text-neutral-400 max-w-2xl leading-relaxed">
          DocuMind indexes PDFs, manuals, and documents with custom hybrid retrieval algorithms, enabling secure conversational synthesis with pin-point accuracy citations.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link href={isAuthenticated ? '/chat' : '/register'}>
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold cursor-pointer shadow-lg shadow-violet-600/20 rounded-xl px-8 py-6 text-base flex items-center gap-2">
              Start Building Free <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <a href="#pipeline">
            <Button size="lg" variant="outline" className="border-white/10 hover:border-white/20 hover:bg-white/5 text-neutral-300 font-semibold cursor-pointer rounded-xl px-8 py-6 text-base">
              Explore Architecture
            </Button>
          </a>
        </div>

        {/* Live Simulation Terminal Mockup */}
        <div className="mt-16 w-full max-w-4xl rounded-2xl border border-white/5 bg-[#121217]/45 backdrop-blur-xl p-1 shadow-2xl relative">
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-violet-500/15 via-transparent to-indigo-500/10 pointer-events-none" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          
          <div className="rounded-xl bg-[#09090D] overflow-hidden text-left border border-white/5">
            {/* Terminal Top bar */}
            <div className="h-10 border-b border-white/5 px-4 flex items-center justify-between bg-[#0C0C10]">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-neutral-800" />
                <span className="h-3 w-3 rounded-full bg-neutral-800" />
                <span className="h-3 w-3 rounded-full bg-neutral-800" />
              </div>
              <span className="text-[10px] text-neutral-600 font-mono">documind-rag-engine v1.0.4</span>
              <div className="w-12" />
            </div>

            {/* Terminal Content */}
            <div className="p-6 font-mono text-xs md:text-sm space-y-4 min-h-[260px] flex flex-col justify-between">
              <div className="space-y-4">
                {/* Step 1: User prompt */}
                <div className="flex items-start gap-2">
                  <span className="text-violet-500 font-bold font-sans">#</span>
                  <span className="text-neutral-400">query:</span>
                  <span className="text-white font-medium">
                    {terminalStep >= 1 ? terminalText : <span className="animate-pulse">|</span>}
                  </span>
                </div>

                {/* Step 2: Retrieving logic logs */}
                {terminalStep >= 2 && (
                  <div className="space-y-1 text-xs text-neutral-500 border-l-2 border-violet-500/30 pl-3">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-violet-400 animate-spin" />
                      <span>Retrieving documents using pgvector & HNSW indexing...</span>
                    </div>
                    {terminalStep >= 3 && (
                      <>
                        <div className="text-neutral-400">✔ Found 2 matched segments across handbook_2026.pdf & compliance_sop.md</div>
                        <div className="text-neutral-400">✔ Running Reciprocal Rank Fusion (RRF) rank-merging... Done (alpha=0.6)</div>
                      </>
                    )}
                  </div>
                )}

                {/* Step 3: Stream output */}
                {terminalStep >= 3 && (
                  <div className="space-y-2 mt-4">
                    <div className="text-neutral-400 flex items-center gap-1.5 font-sans font-semibold text-xs uppercase tracking-wider text-violet-400">
                      <BrainCircuit className="h-3.5 w-3.5" />
                      <span>RAG Output Stream</span>
                    </div>
                    <p className="text-neutral-200 leading-relaxed max-w-3xl whitespace-pre-wrap font-sans">
                      According to Section 4.2 <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-950/40 text-violet-300 text-[10px] font-mono cursor-pointer font-bold mx-0.5 animate-bounce">1</span>, all client records must be stored using AES-256 encryption. Access controls must be audited quarterly <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 text-[10px] font-mono cursor-pointer font-bold mx-0.5">2</span>.
                    </p>
                  </div>
                )}
              </div>

              {/* Step 4: Citations list drawer preview */}
              {citationsVisible && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-white/5 animate-citation-slide">
                  <div className="bg-[#121217]/80 p-3 rounded-lg border border-violet-500/20 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-violet-400 font-bold uppercase">Citation [1]</span>
                      <span className="text-[10px] text-emerald-400 font-semibold font-mono">94.8% Match</span>
                    </div>
                    <span className="text-xs font-semibold text-white truncate font-sans">compliance_sop.pdf (Page 12)</span>
                    <span className="text-[10px] text-neutral-500 line-clamp-1 leading-relaxed font-sans font-normal italic">
                      {"\"...all customer records and credentials in the production cluster must be encrypted via cipher suites like AES-256...\""}
                    </span>
                  </div>

                  <div className="bg-[#121217]/80 p-3 rounded-lg border border-white/5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase">Citation [2]</span>
                      <span className="text-[10px] text-emerald-400 font-semibold font-mono">89.2% Match</span>
                    </div>
                    <span className="text-xs font-semibold text-white truncate font-sans">handbook_2026.pdf (Page 8)</span>
                    <span className="text-[10px] text-neutral-500 line-clamp-1 leading-relaxed font-sans font-normal italic">
                      {"\"...compliance team requires a thorough audit of system authorization and IAM settings on a quarterly cycle...\""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 md:px-12 max-w-6xl mx-auto border-t border-white/5 relative z-10">
        <div className="flex flex-col items-center text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
            Designed for secure operational speed.
          </h2>
          <p className="text-sm md:text-base text-neutral-400 max-w-xl">
            Everything you need to orchestrate hybrid search databases and LLM streaming out-of-the-box.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: Search,
              title: 'Hybrid Keyword & Vector Search',
              desc: 'Leverages dense pgvector embeddings alongside sparse BM25 text indices. Results are merged cleanly with Reciprocal Rank Fusion (RRF) for ultimate accuracy.',
            },
            {
              icon: Shield,
              title: 'Granular Organization isolation',
              desc: 'Fully sandboxed multi-tenant design pattern. Users belong to strictly partitioned organizations, maintaining data compliance pipelines effortlessly.',
            },
            {
              icon: Zap,
              title: 'Live Stream Reasoning & Citations',
              desc: 'Streams answers segment-by-segment with instant citation hooks mapping straight to source PDFs, highlighting similarity metrics and document pages.',
            },
            {
              icon: Layers,
              title: 'Notion-style Version Auditing',
              desc: 'Track files from upload through embed cycles. Complete with a live metadata inspector showing file sizes, processing status, and document revision paths.',
            },
            {
              icon: FileText,
              title: 'Zero Configuration Ingestion',
              desc: 'Drag and drop PDFs, Markdowns, or Text files. DocuMind automatically slices documents using smart semantic boundary chunk loaders.',
            },
            {
              icon: Database,
              title: 'Enterprise API Access',
              desc: 'Integrate the semantic database directly into external workflows. Provision secure HMAC API authorization tokens in seconds.',
            },
          ].map((feat, idx) => (
            <Card key={idx} className="bg-[#121217]/30 border-white/5 p-6 hover:border-violet-500/20 hover:bg-[#121217]/55 transition-all duration-300 group rounded-2xl flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="h-10 w-10 rounded-xl bg-violet-950/40 border border-violet-800/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feat.icon className="h-5 w-5 text-violet-400" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">{feat.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* RAG Pipeline Architecture Section */}
      <section id="pipeline" className="py-24 px-6 md:px-12 max-w-6xl mx-auto border-t border-white/5 relative z-10">
        <div className="flex flex-col items-center text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
            How DocuMind works.
          </h2>
          <p className="text-sm md:text-base text-neutral-400 max-w-xl">
            A state-of-the-art ingestion, storage, search, and synthesis pipeline.
          </p>
        </div>

        {/* Pipeline CSS Workflow */}
        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-600/30 via-indigo-600/30 to-violet-600/10 -translate-y-1/2 hidden lg:block z-0" />
          
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 relative z-10">
            {[
              { step: '1', title: 'Upload & Parse', text: 'Files parsed into semantic text paragraphs' },
              { step: '2', title: 'Dynamic Chunking', text: 'Split with overlap boundaries to protect context' },
              { step: '3', title: 'Embed (dense)', text: 'Vector representation using neural embeddings' },
              { step: '4', title: 'HNSW & BM25', text: 'Dual-index indexing for precision & semantic capture' },
              { step: '5', title: 'RRF Merge', text: 'Reciprocal Rank Fusion merges dense & sparse scores' },
              { step: '6', title: 'LLM Stream', text: 'Citations pinned dynamically onto token stream' },
            ].map((p, idx) => (
              <div key={idx} className="bg-[#0D0D11]/90 border border-white/5 p-5 rounded-2xl flex flex-col justify-between items-center text-center relative hover:border-violet-500/25 transition-all">
                <div className="h-8 w-8 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold font-mono shadow-md shadow-violet-600/20 mb-3">
                  {p.step}
                </div>
                <h4 className="text-xs font-bold text-white mb-1">{p.title}</h4>
                <p className="text-[10px] text-neutral-400 leading-normal">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 md:px-12 max-w-5xl mx-auto border-t border-white/5 relative z-10">
        <div className="flex flex-col items-center text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
            Pricing plans for any scale.
          </h2>
          <p className="text-sm md:text-base text-neutral-400 max-w-xl">
            Start completely free. Upgrade for unlimited workspaces, API keys, and Stripe billing limits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Starter Plan */}
          <div className="bg-[#121217]/20 border border-white/5 p-8 rounded-2xl flex flex-col justify-between relative hover:border-white/10 transition-all">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Starter</h3>
                <p className="text-xs text-neutral-400 mt-1">For developer pilots & evaluations</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">$0</span>
                <span className="text-xs text-neutral-400">/ month</span>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-400">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>1 Workspace</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>100 MB Storage limit</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>50 query streams / mo</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>Interactive Citations UI</span>
                </li>
              </ul>
            </div>
            <Link href={isAuthenticated ? '/chat' : '/register'} className="mt-8">
              <Button variant="outline" className="w-full border-white/10 hover:border-white/20 hover:bg-white/5 font-semibold py-5 cursor-pointer rounded-xl text-xs">
                {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
              </Button>
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="bg-[#121217]/50 border border-violet-500/30 p-8 rounded-2xl flex flex-col justify-between relative shadow-xl shadow-violet-950/10 hover:border-violet-500/50 transition-all">
            <div className="absolute top-0 right-6 -translate-y-1/2 px-2.5 py-0.5 rounded-full border border-violet-500/40 bg-violet-950 text-[9px] font-bold uppercase tracking-wider text-violet-300">
              Most Popular
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                  Pro <Sparkles className="h-4 w-4 text-violet-400" />
                </h3>
                <p className="text-xs text-neutral-400 mt-1">For teams demanding infinite scale</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">$29</span>
                <span className="text-xs text-neutral-400">/ month</span>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-400">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="text-white font-medium">Unlimited Workspaces</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="text-white font-medium">2 GB Storage limit</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="text-white font-medium">Unlimited stream queries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>Stripe Billing Portal</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>Shared Team Workspace Roles</span>
                </li>
              </ul>
            </div>
            <Link href={isAuthenticated ? '/settings' : '/register'} className="mt-8">
              <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-5 cursor-pointer rounded-xl text-xs shadow-md shadow-violet-500/10">
                {isAuthenticated ? 'Upgrade in Settings' : 'Upgrade to Pro'}
              </Button>
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-[#121217]/20 border border-white/5 p-8 rounded-2xl flex flex-col justify-between relative hover:border-white/10 transition-all">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Enterprise</h3>
                <p className="text-xs text-neutral-400 mt-1">For strict compliance requirements</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">Custom</span>
              </div>
              <ul className="space-y-2.5 text-xs text-neutral-400">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>On-premise / VPC Hosting</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>SSO & SAML Authentication</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>99.9% uptime SLA guarantee</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-400 shrink-0" />
                  <span>Dedicated solutions architect</span>
                </li>
              </ul>
            </div>
            <a href="mailto:sales@documind.ai" className="mt-8">
              <Button variant="outline" className="w-full border-white/10 hover:border-white/20 hover:bg-white/5 font-semibold py-5 cursor-pointer rounded-xl text-xs">
                Contact Sales
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6 md:px-12 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500 gap-4 relative z-10 bg-[#0A0A0C]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <BrainCircuit className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold text-neutral-400">DocuMind</span>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <span>Built with Next.js & FastAPI</span>
          <span>•</span>
          <span>Secure AES-256 Storage</span>
          <span>•</span>
          <span>OpenAI and pgvector integrations</span>
        </div>

        <div>
          © {new Date().getFullYear()} DocuMind, Inc. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
