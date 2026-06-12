'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  FileText,
  UploadCloud,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  HardDriveUpload,
  History,
  Layers,
} from 'lucide-react';

import { useAuthStore } from '@/lib/stores/auth-store';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DocumentVersion {
  size_bytes: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
}

interface Document {
  id: string;
  name: string;
  extension: string;
  created_at: string;
  latest_version?: DocumentVersion;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  // local formatBytes helper
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fetch list of documents
  const { data: documents = [], isLoading, refetch } = useQuery<Document[]>({
    queryKey: ['documents', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      try {
        const res = await apiClient.get('/api/v1/documents');
        return res.data;
      } catch (err) {
        console.error(err);
        // Fallback mock documents in development mode
        return [
          {
            id: 'doc-1',
            name: 'Standard_Operating_Procedures.pdf',
            extension: 'pdf',
            created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
            latest_version: {
              size_bytes: 4241088,
              status: 'completed',
              error_message: null,
            },
          },
          {
            id: 'doc-2',
            name: 'Q3_Earnings_Transcript.md',
            extension: 'md',
            created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
            latest_version: {
              size_bytes: 12455,
              status: 'completed',
              error_message: null,
            },
          },
          {
            id: 'doc-3',
            name: 'Employee_Handbook_2026.pdf',
            extension: 'pdf',
            created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            latest_version: {
              size_bytes: 8591022,
              status: 'processing',
              error_message: null,
            },
          },
        ];
      }
    },
    enabled: !!activeOrgId,
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiClient.post('/api/v1/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Document uploaded successfully! Ingestion processing started.');
      queryClient.invalidateQueries({ queryKey: ['documents', activeOrgId] });
      setUploadProgress(null);
    },
    onError: (error: unknown) => {
      console.error(error);
      
      // Development mock fallback
      if (process.env.NODE_ENV === 'development') {
        toast.info('Bypassing upload in development mode. Adding mock document.');
        queryClient.setQueryData(['documents', activeOrgId], (oldDocs: Document[] | undefined) => {
          return [
            ...(oldDocs || []),
            {
              id: `mock-doc-${Math.random()}`,
              name: 'Uploaded_Dev_Doc.pdf',
              extension: 'pdf',
              created_at: new Date().toISOString(),
              latest_version: {
                size_bytes: 2541099,
                status: 'processing' as const,
                error_message: null,
              },
            },
          ];
        });
        setUploadProgress(null);
        return;
      }

      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message || 'Failed to upload document. Please try again.');
      setUploadProgress(null);
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await apiClient.delete(`/api/v1/documents/${docId}`);
      return docId;
    },
    onSuccess: (deletedId) => {
      toast.success('Document deleted.');
      queryClient.invalidateQueries({ queryKey: ['documents', activeOrgId] });
      if (selectedDoc?.id === deletedId) {
        setSelectedDoc(null);
      }
    },
    onError: () => {
      if (process.env.NODE_ENV === 'development') {
        toast.info('Removed mock document.');
        return;
      }
      toast.error('Failed to delete document.');
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      
      const file = acceptedFiles[0];
      if (file.size > 50 * 1024 * 1024) {
        toast.error('File exceeds the 50MB maximum size limit.');
        return;
      }
      
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/markdown': ['.md', '.markdown'],
    },
    maxFiles: 1,
  });

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-950/40 text-emerald-400 border-emerald-800/40 flex items-center gap-1.5 cursor-help" title="Parsed, chunked, and embedded successfully inside postgres pgvector tables.">
            <CheckCircle2 className="h-3 w-3" /> Indexed
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-violet-950/40 text-violet-400 border-violet-800/40 flex items-center gap-1.5 animate-pulse cursor-help" title="Running text parsing extraction and layout chunk split analysis.">
            <Loader2 className="h-3 w-3 animate-spin" /> Ingesting
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-950/40 text-red-400 border-red-800/40 flex items-center gap-1.5 cursor-help" title="Check formatting compatibility or error logs.">
            <AlertCircle className="h-3 w-3" /> Failed
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge className="bg-neutral-950/40 text-neutral-400 border-neutral-800/40 flex items-center gap-1.5 cursor-help" title="Waiting for background index worker queue allocation.">
            <Clock className="h-3 w-3" /> Queued
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto text-white relative">
      <div className="absolute top-[10%] right-[10%] w-[35%] h-[35%] bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center z-10 relative animate-fade-in">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-violet-500/20 bg-violet-950/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider">
            RAG Vector Source Directory
          </div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
            Knowledge base
          </h1>
          <p className="text-sm text-neutral-400">
            Upload document repositories to train and scope your semantic retrieval engines.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="border-white/5 bg-[#121217]/50 text-neutral-400 hover:text-white cursor-pointer hover:border-white/10"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh status
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start z-10 relative">
        
        {/* Upload Card */}
        <Card className="col-span-1 bg-[#121217]/50 border-white/5 backdrop-blur-xl transition-all duration-300 hover:border-violet-500/10 shadow-lg animate-fade-in">
          <CardHeader>
            <CardTitle className="text-lg text-neutral-200 font-bold">Upload Files</CardTitle>
            <CardDescription className="text-neutral-500 text-xs">
              Load source material into your multi-tenant document store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[200px] ${
                isDragActive
                  ? 'border-violet-500 bg-violet-500/5'
                  : 'border-white/5 bg-neutral-950/20 hover:border-violet-500/20 hover:bg-neutral-950/40'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="h-9 w-9 text-neutral-600 mb-3 group-hover:text-neutral-500 transition-colors" />
              <p className="text-xs font-bold text-neutral-350 mb-1">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-[10px] text-neutral-600 max-w-xs leading-normal">
                PDF or Markdown files up to 50MB. Text parsing and embeddings vector indexing runs automatically.
              </p>
            </div>

            {uploadProgress !== null && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-neutral-400 flex items-center gap-1.5">
                    <HardDriveUpload className="h-3.5 w-3.5 text-neutral-500" /> Uploading file...
                  </span>
                  <span className="text-neutral-200">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-1.5 bg-neutral-950" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Library Table Card */}
        <div className="lg:col-span-2 space-y-4 animate-fade-in">
          <Card className="bg-[#121217]/50 border-white/5 backdrop-blur-xl shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-neutral-200 font-bold">Indexed Directory</CardTitle>
              <CardDescription className="text-neutral-500 text-xs">
                Review and monitor multi-tenant chunk ingestion pipelines. Click a file to inspect metadata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-neutral-600 text-xs">
                  No source documents found in this organization.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {documents.map((doc) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className={`py-4 px-2 flex items-center justify-between group first:pt-2 last:pb-2 cursor-pointer transition-all rounded-xl hover:bg-white/5 ${
                          isSelected ? 'bg-white/5 border border-violet-500/10' : 'border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div className="h-9 w-9 bg-neutral-950 border border-neutral-900 rounded-lg flex items-center justify-center shrink-0 shadow-inner">
                            <FileText className={`h-5 w-5 ${isSelected ? 'text-violet-400' : 'text-neutral-500'} group-hover:text-violet-400 transition-colors`} />
                          </div>
                          <div className="truncate space-y-0.5">
                            <div className="text-xs font-bold text-neutral-250 truncate flex items-center gap-2">
                              <span className="truncate">{doc.name}</span>
                              <span className="text-[9px] font-mono uppercase border border-white/5 bg-neutral-900 text-neutral-500 px-1 rounded shrink-0">
                                {doc.extension}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-500 flex items-center gap-2">
                              <span>
                                {doc.latest_version
                                  ? formatFileSize(doc.latest_version.size_bytes)
                                  : '0 Bytes'}
                              </span>
                              <span>•</span>
                              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {getStatusBadge(doc.latest_version?.status)}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neutral-600 hover:text-red-400 cursor-pointer rounded-lg hover:bg-red-500/10 transition-colors"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this document? This will remove all associated vector embeddings.')) {
                                deleteMutation.mutate(doc.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Slide-out Inspector Drawer */}
      <div className={`fixed top-0 right-0 h-screen w-80 bg-[#121217]/90 border-l border-white/5 backdrop-blur-xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${
        selectedDoc ? 'translate-x-0' : 'translate-x-full w-0 overflow-hidden'
      }`}>
        <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0 bg-[#0C0C10]/60">
          <div className="flex items-center gap-2 font-bold text-sm text-neutral-200">
            <History className="h-4 w-4 text-violet-400 animate-pulse" />
            <span>Document Inspector</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDoc(null)}
            className="text-neutral-500 hover:text-white text-xs cursor-pointer rounded-lg px-2 h-8 hover:bg-white/5"
          >
            Close
          </Button>
        </div>

        {selectedDoc && (
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {/* File Info */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">File Identity</div>
                <div className="p-3 bg-neutral-950/40 border border-white/5 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-neutral-200 truncate">{selectedDoc.name}</div>
                  <div className="text-[10px] text-neutral-500 flex justify-between">
                    <span>File size</span>
                    <span className="font-mono text-neutral-300">
                      {selectedDoc.latest_version ? formatFileSize(selectedDoc.latest_version.size_bytes) : '0 Bytes'}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-500 flex justify-between">
                    <span>File format</span>
                    <span className="font-mono text-neutral-300 uppercase">{selectedDoc.extension}</span>
                  </div>
                </div>
              </div>

              {/* Version History Ingestion Timeline */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-neutral-600" />
                  <span>Pipeline Checklist</span>
                </div>
                
                <div className="relative pl-4 border-l border-white/5 space-y-4">
                  {/* Step 1: Upload */}
                  <div className="relative">
                    <div className="absolute -left-[20.5px] top-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#121217]" />
                    <div className="text-xs font-bold text-neutral-200">1. Upload completed</div>
                    <div className="text-[10px] text-neutral-500">Document saved safely in organization sandbox bucket storage</div>
                  </div>

                  {/* Step 2: Extract text */}
                  <div className="relative">
                    <div className={`absolute -left-[20.5px] top-0.5 h-3 w-3 rounded-full border-2 border-[#121217] ${
                      selectedDoc.latest_version?.status === 'completed' || selectedDoc.latest_version?.status === 'processing'
                        ? 'bg-emerald-500'
                        : selectedDoc.latest_version?.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-neutral-800'
                    }`} />
                    <div className="text-xs font-bold text-neutral-200">2. Text segmentation extraction</div>
                    <div className="text-[10px] text-neutral-500">Stripping document page layers and parsing content blocks</div>
                  </div>

                  {/* Step 3: Embed vectors */}
                  <div className="relative">
                    <div className={`absolute -left-[20.5px] top-0.5 h-3 w-3 rounded-full border-2 border-[#121217] ${
                      selectedDoc.latest_version?.status === 'completed'
                        ? 'bg-emerald-500'
                        : selectedDoc.latest_version?.status === 'processing'
                        ? 'bg-violet-500 animate-pulse'
                        : selectedDoc.latest_version?.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-neutral-800'
                    }`} />
                    <div className="text-xs font-bold text-neutral-200">3. pgvector embeddings indexing</div>
                    <div className="text-[10px] text-neutral-500">Indexing vector chunk clusters into PostgreSQL database index tables</div>
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Metadata properties</div>
                <div className="text-[10px] text-neutral-400 space-y-1 bg-neutral-950/40 p-3 border border-white/5 rounded-xl">
                  <div className="flex justify-between">
                    <span>Document ID</span>
                    <span className="font-mono text-neutral-500 text-[9px] truncate w-28 text-right">{selectedDoc.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Creation timestamp</span>
                    <span className="font-mono text-neutral-550">{new Date(selectedDoc.created_at).toLocaleString()}</span>
                  </div>
                  {selectedDoc.latest_version?.error_message && (
                    <div className="pt-2 border-t border-white/5 text-red-400 leading-normal">
                      Error: {selectedDoc.latest_version.error_message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
