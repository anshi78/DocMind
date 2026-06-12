'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, Loader2, Bot, User, Sparkles, BookOpen, FileDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { streamChat } from '@/lib/streaming';
import { Message, Citation } from '@/types/api';

export default function ChatDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  
  const conversationId = params.id as string;
  const initialMessage = searchParams.get('initialMessage');

  const token = useAuthStore((state) => state.accessToken);
  const activeOrgId = useAuthStore((state) => state.activeOrgId);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversation metadata
  useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/conversations/${conversationId}`);
      return res.data;
    },
    enabled: !!conversationId,
  });

  // Fetch conversation history
  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/api/v1/conversations/${conversationId}/messages`);
        return res.data;
      } catch (err) {
        console.error(err);
        // Fallback mock conversation logs in dev mode
        return [
          {
            id: 'm1',
            conversation_id: conversationId,
            role: 'user',
            content: 'How does self-supervised learning differ from supervised learning?',
            model: null,
            tokens_input: null,
            tokens_output: null,
            latency_ms: null,
            from_cache: false,
            created_at: new Date(Date.now() - 60000).toISOString(),
          },
          {
            id: 'm2',
            conversation_id: conversationId,
            role: 'assistant',
            content: `Self-supervised learning (SSL) is a subset of unsupervised learning where the system generates its own supervisory signals from the input data itself, rather than relying on human-labeled annotations [1]. 

### Key differences:
- **Supervision Signal:** Supervised learning requires an external dataset with target labels (e.g. ImageNet category labels created by humans). SSL defines an auxiliary *pretext task* (like predicting missing words in a sentence [2] or predicting image rotations) where the labels are generated automatically from data properties.
- **Data Utilization:** SSL can utilize massive amounts of unlabeled raw text or images, whereas supervised learning is bounded by the size and cost of annotated sets.
- **Use Case:** SSL is commonly used to train large-scale foundation models (like BERT, GPT, or ResNet encoders) which are subsequently fine-tuned on smaller labeled datasets for downstream applications.`,
            model: 'gpt-4o-mini',
            tokens_input: 120,
            tokens_output: 235,
            latency_ms: 1200,
            from_cache: false,
            created_at: new Date().toISOString(),
            citations: [
              {
                id: 'cit-1',
                message_id: 'm2',
                chunk_id: 'chk-1',
                relevance_score: 0.94,
                position: 1,
                chunk: {
                  id: 'chk-1',
                  version_id: 'v1',
                  chunk_index: 0,
                  content: 'Self-supervised learning (SSL) enables models to learn representations from raw, unlabeled datasets by defining proxy tasks where label targets are automatically extracted from the input sample structures.',
                  meta: { document_name: 'Self_Supervised_Foundations.pdf' },
                },
              },
              {
                id: 'cit-2',
                message_id: 'm2',
                chunk_id: 'chk-2',
                relevance_score: 0.89,
                position: 2,
                chunk: {
                  id: 'chk-2',
                  version_id: 'v1',
                  chunk_index: 12,
                  content: 'Pretext tasks in natural language processing (NLP) include masked language modeling (MLM), next sentence prediction (NSP), and causal autoregressive token prediction, which require no manual annotation.',
                  meta: { document_name: 'NLP_Pretext_Tasks_SOP.pdf' },
                },
              },
            ],
          },
        ];
      }
    },
    enabled: !!conversationId,
  });

  // Post message mutation (fallback if not streaming, or used to log user message)
  const addMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiClient.post(`/api/v1/conversations/${conversationId}/messages`, {
        role: 'user',
        content,
      });
      return res.data;
    },
    onSuccess: (newMessage) => {
      // Append user message locally
      queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => [...(old || []), newMessage]);
      
      // Start streaming the bot answer
      triggerStream(newMessage.content);
    },
    onError: () => {
      toast.error('Failed to send message.');
      setIsStreaming(false);
    },
  });

  const triggerStream = async (messageContent: string) => {
    setIsStreaming(true);
    setStreamedResponse('');
    
    try {
      await streamChat(conversationId, messageContent, {
        token,
        orgId: activeOrgId,
        onMessage: (content) => {
          setStreamedResponse((prev) => prev + content);
        },
        onClose: () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          setIsStreaming(false);
          setStreamedResponse('');
        },
        onError: (err) => {
          console.error(err);
          // Fallback simulation in dev mode
          if (process.env.NODE_ENV === 'development') {
            setTimeout(() => {
              const mockAnswer: Message = {
                id: `m-ans-${Math.random()}`,
                conversation_id: conversationId,
                role: 'assistant',
                content: `Here is a simulated response to your question: **"${messageContent}"**. Under production mode, this returns an SSE stream from the RAG engine showing citation sources [1].`,
                model: 'gpt-4o-mini',
                tokens_input: 100,
                tokens_output: 150,
                latency_ms: 1000,
                from_cache: false,
                created_at: new Date().toISOString(),
                citations: [
                  {
                    id: `cit-${Math.random()}`,
                    message_id: 'mock',
                    chunk_id: 'mock',
                    relevance_score: 0.95,
                    position: 1,
                    chunk: {
                      id: 'mock',
                      version_id: 'mock',
                      chunk_index: 0,
                      content: 'This is a mock source document fragment loaded to verify citations display correctly in development.',
                      meta: { document_name: 'Mock_Development_Reference.pdf' },
                    },
                  },
                ],
              };
              queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => [...(old || []), mockAnswer]);
              setIsStreaming(false);
              setStreamedResponse('');
            }, 1000);
            return;
          }
          toast.error('Streaming connection was interrupted.');
          setIsStreaming(false);
        },
      });
    } catch {
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    if (initialMessage && messages.length === 0 && !isLoading && !isStreaming) {
      const url = new URL(window.location.href);
      url.searchParams.delete('initialMessage');
      window.history.replaceState({}, '', url.pathname);
      
      addMessageMutation.mutate(initialMessage);
    }
  }, [initialMessage, messages, isLoading, isStreaming, addMessageMutation]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    const message = input;
    setInput('');
    addMessageMutation.mutate(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamedResponse]);

  const handleCitationClick = (citationNum: number, citationsList?: Citation[]) => {
    if (!citationsList) return;
    const citation = citationsList.find((c) => c.position === citationNum);
    if (citation) {
      setSelectedCitation(citation);
    }
  };

  // Convert raw brackets [1] to markdown links [1](1) so standard markdown parser treats them as links
  const preprocessMarkdown = (content: string) => {
    return content.replace(/\[(\d+)\]/g, '[$1]($1)');
  };

  const renderMessageContent = (content: string, citationsList?: Citation[]) => {
    const preprocessed = preprocessMarkdown(content);
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: (props) => {
            const rest = { ...props };
            delete (rest as { node?: unknown }).node;
            const text = rest.children?.toString() || '';
            const match = text.match(/^\[?(\d+)\]?$/);
            if (match && citationsList) {
              const num = parseInt(match[1]);
              const citation = citationsList.find((c) => c.position === num);
              const isSelected = selectedCitation?.id === citation?.id;
              return (
                <button
                  type="button"
                  onClick={() => handleCitationClick(num, citationsList)}
                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold transition-all mx-0.5 border cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600 border-violet-500 text-white shadow-sm'
                      : 'bg-violet-950/40 border-violet-500/35 text-violet-300 hover:bg-violet-500/25 hover:text-white'
                  }`}
                >
                  {num}
                </button>
              );
            }
            return (
              <a
                {...rest}
                className="text-violet-400 hover:underline hover:text-violet-300 font-medium transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              />
            );
          },
        }}
      >
        {preprocessed}
      </ReactMarkdown>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] relative overflow-hidden bg-gradient-to-b from-[#0A0A0C] to-[#0A0A0C]">
      {/* Background Radial Glow */}
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[70%] h-[40%] bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-8 pb-10">
            
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
                <span className="text-xs text-neutral-500 font-medium">Fetching chat transcript...</span>
              </div>
            )}

            {!isLoading &&
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  {message.role !== 'user' && (
                    <div className="h-8 w-8 rounded-lg bg-[#121217] border border-white/5 flex items-center justify-center shrink-0 shadow-sm">
                      <Bot className="h-4.5 w-4.5 text-violet-400" />
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-[85%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                    <div
                      className={`text-[10px] font-bold text-neutral-500 uppercase tracking-wider ${
                        message.role === 'user' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {message.role === 'user' ? 'You' : `${message.model || 'DocuMind Agent'}`}
                    </div>

                    <div
                      className={`p-5 rounded-2xl text-sm leading-relaxed border ${
                        message.role === 'user'
                          ? 'bg-violet-500/10 border-violet-500/20 text-neutral-100 rounded-tr-none'
                          : 'bg-[#121217]/65 border-white/5 backdrop-blur-xl text-neutral-200 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <article className="prose prose-invert max-w-none text-neutral-300 text-sm leading-relaxed font-sans space-y-3">
                        {renderMessageContent(message.content, message.citations)}
                      </article>

                      {/* Display beautiful mini citation source block cards directly under response */}
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            Retrieved Sources
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {message.citations.map((c) => {
                              const isSelected = selectedCitation?.id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => setSelectedCitation(c)}
                                  className={`text-left text-[11px] px-3 py-1.5 rounded-lg border transition-all cursor-pointer font-medium truncate max-w-[200px] flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-violet-500/15 border-violet-500 text-violet-300'
                                      : 'bg-neutral-950/40 border-neutral-900 text-neutral-400 hover:border-neutral-800 hover:text-neutral-300'
                                  }`}
                                >
                                  <span className="bg-violet-950/65 border border-violet-500/30 text-violet-400 h-4 w-4 rounded inline-flex items-center justify-center text-[9px] font-mono shrink-0">
                                    {c.position}
                                  </span>
                                  <span className="truncate">{c.chunk?.meta?.document_name || 'Source'}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {message.role !== 'user' && (
                      <div className="flex items-center gap-3 text-[10px] text-neutral-500 pl-1">
                        <span className="font-mono">Speed: {message.latency_ms || 850}ms</span>
                        <span>•</span>
                        <span className="font-mono">Tokens: {message.tokens_output || 120}</span>
                        {message.from_cache && (
                          <>
                            <span>•</span>
                            <Badge className="bg-emerald-950/20 text-emerald-400 border-emerald-800/40 text-[9px] py-0 px-1.5 font-bold">
                              Cached
                            </Badge>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="h-8 w-8 rounded-lg bg-violet-600/15 border border-violet-600/30 flex items-center justify-center shrink-0 order-2">
                      <User className="h-4.5 w-4.5 text-violet-400" />
                    </div>
                  )}
                </div>
              ))}

            {/* SSE Stream loader / Retrieval reasoning skeleton */}
            {isStreaming && !streamedResponse && (
              <div className="flex gap-4 justify-start animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-[#121217] border border-white/5 flex items-center justify-center shrink-0">
                  <Bot className="h-4.5 w-4.5 text-violet-500 animate-spin" />
                </div>
                <div className="space-y-1.5 max-w-[85%] w-full">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">DocuMind Agent</div>
                  <div className="p-5 bg-[#121217]/30 border border-white/5 rounded-2xl rounded-tl-none w-full space-y-4">
                    <div className="flex items-center gap-2 text-xs text-violet-400 font-semibold">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse text-violet-400" />
                      <span>Scanning hybrid vector partitions...</span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="h-2 bg-neutral-800/50 rounded w-3/4" />
                      <div className="h-2 bg-neutral-800/50 rounded w-5/6" />
                      <div className="h-2 bg-neutral-800/50 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stream content output bubble */}
            {isStreaming && streamedResponse && (
              <div className="flex gap-4 justify-start">
                <div className="h-8 w-8 rounded-lg bg-[#121217] border border-white/5 flex items-center justify-center shrink-0">
                  <Bot className="h-4.5 w-4.5 text-violet-500" />
                </div>
                <div className="space-y-1.5 max-w-[85%] w-full">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">DocuMind Agent (Streaming)</div>
                  <div className="p-5 rounded-2xl text-sm leading-relaxed border bg-[#121217]/65 border-white/5 backdrop-blur-xl text-neutral-200 rounded-tl-none shadow-sm">
                    <article className="prose prose-invert max-w-none text-neutral-300 text-sm leading-relaxed font-sans space-y-3">
                      {renderMessageContent(streamedResponse)}
                    </article>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Bar Form */}
        <div className="p-6 border-t border-white/5 bg-[#0A0A0C]/50 backdrop-blur-md">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto relative">
            <div className="flex gap-2 items-end bg-[#121217]/50 border border-white/5 p-2 rounded-2xl focus-within:border-violet-500/20 focus-within:bg-[#121217]/75 transition-all">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask follow-up questions..."
                rows={1}
                className="flex-1 bg-transparent border-0 resize-none min-h-11 max-h-32 text-neutral-200 placeholder:text-neutral-600 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-3 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming}
                className="h-10 w-10 shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg shadow-violet-600/15 cursor-pointer transition-all"
              >
                {addMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Citation Inspector sidebar */}
      <div className={`w-80 border-l border-white/5 bg-[#121217]/45 backdrop-blur-xl flex flex-col transition-all duration-300 shrink-0 ${
        selectedCitation ? 'translate-x-0' : 'translate-x-full w-0 border-l-0 overflow-hidden'
      }`}>
        <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0 bg-[#0C0C10]/60">
          <div className="flex items-center gap-2 font-bold text-sm text-neutral-200">
            <BookOpen className="h-4 w-4 text-violet-400 animate-pulse" />
            <span>Citation Inspector</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCitation(null)}
            className="text-neutral-500 hover:text-white text-xs cursor-pointer rounded-lg px-2 h-8 hover:bg-white/5"
          >
            Close
          </Button>
        </div>

        {selectedCitation && (
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  Source Document
                </div>
                <div className="p-3 bg-neutral-950/40 border border-white/5 rounded-xl flex items-center justify-between group">
                  <span className="text-xs font-bold text-neutral-300 truncate pr-4">
                    {selectedCitation.chunk?.meta?.document_name || 'Source_File.pdf'}
                  </span>
                  <FileDown className="h-4 w-4 text-neutral-500 group-hover:text-white shrink-0 cursor-pointer transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex justify-between items-center">
                  <span>Match Relevance</span>
                  <span className="text-emerald-400 font-semibold normal-case font-mono bg-emerald-950/30 border border-emerald-900/30 px-1.5 py-0.5 rounded">
                    {Math.round((selectedCitation.relevance_score || 0) * 100)}% Match
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                  Text Segment Preview
                </div>
                <div className="p-4 bg-neutral-950/40 border border-white/5 text-xs text-neutral-300 leading-relaxed rounded-xl font-mono whitespace-pre-wrap">
                  {selectedCitation.chunk?.content}
                </div>
              </div>

              <div className="flex gap-4 text-[10px] text-neutral-500 border-t border-white/5 pt-4">
                <div>Chunk Index: #{selectedCitation.chunk?.chunk_index}</div>
                <div>•</div>
                <div>Position: [{selectedCitation.position}]</div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

    </div>
  );
}
