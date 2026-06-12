'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles, Files, Info, MessageSquare, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

interface Document {
  id: string;
  name: string;
}

export default function NewChatPage() {
  const router = useRouter();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available documents for scopes
  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ['documents', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      try {
        const res = await apiClient.get('/api/v1/documents');
        return res.data;
      } catch (err) {
        console.error(err);
        return [
          { id: 'doc-1', name: 'Standard_Operating_Procedures.pdf' },
          { id: 'doc-2', name: 'Q3_Earnings_Transcript.md' },
          { id: 'doc-3', name: 'Employee_Handbook_2026.pdf' },
        ];
      }
    },
    enabled: !!activeOrgId,
  });

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  // Mutation to create a new conversation and trigger the chat stream
  const createChatMutation = useMutation({
    mutationFn: async (firstMessage: string) => {
      const res = await apiClient.post('/api/v1/conversations', {
        title: firstMessage.substring(0, 40) + '...',
        document_scope: selectedDocs.length > 0 ? selectedDocs : null,
      });
      return res.data;
    },
    onSuccess: async (conversation, variables) => {
      router.push(`/chat/${conversation.id}?initialMessage=${encodeURIComponent(variables)}`);
    },
    onError: () => {
      toast.error('Failed to initialize conversation session. Please try again.');
      setIsStreaming(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    setIsStreaming(true);
    createChatMutation.mutate(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] relative overflow-hidden bg-gradient-to-b from-[#0A0A0C] via-[#0D0D11] to-[#0A0A0C] text-white">
      {/* Background Radial Glow */}
      <div className="absolute top-[15%] left-[50%] -translate-x-1/2 w-[70%] h-[40%] bg-gradient-to-tr from-violet-600/10 to-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl w-full mx-auto space-y-8 z-10">
        
        {/* Title & Badge */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-950/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles className="h-3 w-3 text-violet-400 animate-pulse" />
            <span>AI Knowledge Engine</span>
          </div>
          
          <h2 className="text-4xl font-black tracking-tight bg-gradient-to-b from-white via-neutral-100 to-neutral-500 bg-clip-text text-transparent">
            What would you like to build?
          </h2>
          <p className="text-sm text-neutral-400 max-w-md leading-relaxed">
            Query your organizational knowledge base using custom hybrid vector embeddings and secure semantic reasoning.
          </p>
        </div>

        {/* Input Box Card with Glassmorphism */}
        <Card className="w-full bg-[#121217]/50 border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-violet-500/25">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
          
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about SOPs, financial results, or compliance logs..."
                rows={3}
                className="w-full bg-transparent border-0 resize-none text-neutral-200 placeholder:text-neutral-600 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-sm leading-relaxed"
              />
            </div>

            {/* Document Selection Section */}
            <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-semibold px-0.5">
                <Files className="h-3.5 w-3.5 text-neutral-500" />
                <span>Limit scope to specific documents</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-0.5 scrollbar-thin">
                {documents.map((doc) => {
                  const isSelected = selectedDocs.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDocSelection(doc.id)}
                      className={`text-[11px] px-3 py-1 rounded-full border transition-all cursor-pointer font-medium ${
                        isSelected
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-300 shadow-sm shadow-violet-500/5'
                          : 'bg-neutral-950/40 border-neutral-900 text-neutral-400 hover:border-neutral-800 hover:text-neutral-300'
                      }`}
                    >
                      {doc.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Form Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <Info className="h-3.5 w-3.5 text-neutral-600" />
                <span>Press Enter to send, Shift+Enter for newline</span>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={!input.trim() || isStreaming}
                className="bg-violet-600 hover:bg-violet-500 text-white font-medium shadow-md shadow-violet-600/15 cursor-pointer px-4 py-2 h-9 rounded-lg transition-all"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-1.5">
                    Send Query <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* Suggestion Chips */}
        <div className="grid grid-cols-3 gap-3.5 w-full">
          {[
            {
              title: 'Summarize SOPs',
              prompt: 'Provide a structured summary of our latest standard operating procedures.',
            },
            {
              title: 'Financial Health',
              prompt: 'Compare the net revenue growth and margins between Q2 and Q3 transcripts.',
            },
            {
              title: 'Compliance Rules',
              prompt: 'What are the main compliance guidelines and security baselines required in the handbook?',
            },
          ].map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setInput(item.prompt)}
              className="text-left bg-[#121217]/30 border border-white/5 hover:bg-[#121217]/60 hover:border-violet-500/20 p-4 rounded-xl transition-all duration-300 group cursor-pointer"
            >
              <div className="text-xs font-bold text-neutral-200 group-hover:text-violet-400 mb-1 transition-colors flex items-center justify-between">
                <span>{item.title}</span>
                <MessageSquare className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-violet-400" />
              </div>
              <div className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
                {item.prompt}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
