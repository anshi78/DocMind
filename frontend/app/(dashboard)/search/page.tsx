'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Sparkles, BookOpen, AlertCircle, FileText, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SearchResult {
  chunk_id: string;
  document_name: string;
  content: string;
  relevance_score: number;
  chunk_index: number;
}

export default function SearchPage() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([
    'onboarding standard protocols',
    'quarterly revenue margins',
    'AES-256 cipher rules',
  ]);

  // Fetch search results
  const { data: results = [], isLoading, isError } = useQuery<SearchResult[]>({
    queryKey: ['semantic-search', activeOrgId, searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim() || !activeOrgId) return [];
      const res = await apiClient.get('/api/v1/documents/search', {
        params: { q: searchQuery },
      });
      return res.data;
    },
    enabled: !!searchQuery.trim() && !!activeOrgId,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    executeSearch(query);
  };

  const executeSearch = (term: string) => {
    setQuery(term);
    setSearchQuery(term);
    
    // Add to local history list without duplicates
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.toLowerCase() !== term.toLowerCase());
      return [term, ...filtered].slice(0, 5);
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Snippet copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const suggestions = [
    { label: 'Security Guidelines', term: 'What is the encryption standard for storing customer records?' },
    { label: 'SOP Document Summaries', term: 'Summarize standard operating procedures' },
    { label: 'Audits Schedule', term: 'How often are authorization and IAM audits required?' },
  ];

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto text-white relative">
      <div className="absolute top-[15%] left-[20%] w-[45%] h-[45%] bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Page Title */}
      <div className="space-y-2 z-10 relative animate-fade-in">
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-violet-500/20 bg-violet-950/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider">
          Hybrid Dense & Sparse Search
        </div>
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-violet-400 animate-pulse" /> Semantic Explorer
        </h1>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Search your organization&apos;s document chunks using high-dimensional dense vector scores and sparse BM25 keyword rankings.
        </p>
      </div>

      {/* Input Box Spotlight Card */}
      <div className="z-10 relative animate-fade-in">
        <Card className="bg-[#121217]/50 border-white/5 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 hover:border-violet-500/15">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          <CardContent className="pt-6 pb-5">
            <form onSubmit={handleSearch} className="flex gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-neutral-600" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Query knowledge base (e.g. security audits, AES encryption, employee rules)..."
                  className="pl-11 h-12 bg-neutral-950/40 border-neutral-900 text-neutral-200 placeholder:text-neutral-700 focus-visible:ring-violet-500/25 focus-visible:ring-offset-0 focus-visible:border-violet-500/40 text-sm"
                />
              </div>
              <Button
                type="submit"
                className="h-12 px-6 bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-lg shadow-violet-600/10 cursor-pointer rounded-lg transition-all"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : 'Search'}
              </Button>
            </form>

            {/* Quick Suggestions */}
            <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest shrink-0">Suggestions:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => executeSearch(s.term)}
                    className="text-[11px] px-2.5 py-1 rounded-md border border-neutral-900 bg-neutral-950/20 text-neutral-400 hover:border-violet-500/20 hover:text-violet-300 transition-colors cursor-pointer font-medium"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History & Results */}
      <div className="z-10 relative grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left side: Search history panel */}
        <div className="lg:col-span-1 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pl-1">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Search History</span>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-[10px] text-neutral-500 hover:text-white transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <Card className="bg-[#121217]/25 border-white/5 p-4 rounded-xl">
            {history.length === 0 ? (
              <div className="text-[11px] text-neutral-600 text-center py-4">No recent queries</div>
            ) : (
              <div className="space-y-1.5">
                {history.map((term, idx) => (
                  <button
                    key={idx}
                    onClick={() => executeSearch(term)}
                    className="w-full text-left text-xs text-neutral-400 hover:text-white truncate py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2 group font-medium"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-neutral-600 group-hover:text-violet-400 shrink-0 transition-colors" />
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right side: Results panel */}
        <div className="lg:col-span-3 space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
              <span className="text-xs text-neutral-500">Querying semantic index tables...</span>
            </div>
          )}

          {isError && (
            <div className="p-8 text-center bg-red-950/15 border border-red-900/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-red-400 text-sm animate-fade-in">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <span className="font-semibold">Search index failed</span>
              <p className="text-xs text-neutral-500 max-w-sm">
                Ensure PostgreSQL is running and files have been embedded with dense model vectors.
              </p>
            </div>
          )}

          {!isLoading && !isError && searchQuery && results.length === 0 && (
            <div className="text-center py-16 text-neutral-500 text-xs bg-[#121217]/20 border border-white/5 rounded-2xl animate-fade-in">
              No matching semantic segments found for &ldquo;{searchQuery}&rdquo;. Try uploading more PDFs.
            </div>
          )}

          {!isLoading && !isError && results.length > 0 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">
                Top results matching &ldquo;{searchQuery}&rdquo;
              </h2>
              
              <div className="grid gap-4">
                {results.map((result) => (
                  <Card key={result.chunk_id} className="bg-[#121217]/40 border-white/5 backdrop-blur-xl hover:border-violet-500/15 transition-all overflow-hidden group rounded-xl shadow-lg">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    
                    <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between space-y-0">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-neutral-950 border border-neutral-900 flex items-center justify-center shadow-inner">
                          <FileText className="h-4 w-4 text-neutral-500 group-hover:text-violet-400 transition-colors" />
                        </div>
                        <div>
                          <CardTitle className="text-xs font-bold text-neutral-200">
                            {result.document_name}
                          </CardTitle>
                          <CardDescription className="text-[10px] text-neutral-500">
                            Chunk Index: #{result.chunk_index}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] font-bold text-emerald-400 font-mono">
                            {Math.round(result.relevance_score * 100)}% Match
                          </span>
                          {/* Mini relevance meter */}
                          <div className="h-1 w-16 bg-neutral-850 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.round(result.relevance_score * 100)}%` }}
                            />
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-neutral-500 hover:text-white rounded-lg cursor-pointer hover:bg-white/5"
                          onClick={() => copyToClipboard(result.content, result.chunk_id)}
                        >
                          {copiedId === result.chunk_id ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="px-5 pb-4">
                      <p className="text-xs text-neutral-350 leading-relaxed font-mono bg-neutral-950/45 border border-white/5 p-4 rounded-xl whitespace-pre-wrap">
                        {result.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
