import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, GraduationCap, HardDrive, MessageSquareText, Sparkles, Star, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/AuthContext';
import { StatusBadge } from '@/features/documents/DocumentStatus';
import { UploadDialog } from '@/features/documents/UploadDialog';
import { fileKindLabel, formatBytes, formatRelative, isProcessing } from '@/lib/utils';
import { aiApi, usersApi } from '@/services/api';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: usersApi.dashboard,
    refetchInterval: (q) => (q.state.data?.recentDocuments.some((d) => isProcessing(d.processingStatus)) ? 3000 : false),
  });
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: aiApi.status, staleTime: 60_000 });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greeting}, ${user?.displayName?.split(' ')[0] ?? 'there'}`} description="Here's where your documents stand." actions={<Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>Upload a document</Button>} />

      {ai && !ai.configured && (
        <Alert tone="warning" title="AI features are not configured on this server" className="mb-5">
          {ai.problem} Uploading, reading and OCR still work.
        </Alert>
      )}
      {ai?.isMock && (
        <Alert tone="info" title="Mock AI provider active" className="mb-5">
          The server is using the test-only mock provider. All AI output is placeholder text prefixed with [MOCK].
        </Alert>
      )}

      {isError ? (
        <Alert tone="danger" title="Could not load your dashboard" action={<Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>}>{(error as Error).message}</Alert>
      ) : isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data.stats.totalDocuments === 0 && data.stats.trashed === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Upload your first document"
          description="PDFs, scans, photos of notes, Word and text files. Once processed, you can simplify, summarise, chat and make study materials."
          action={<Button onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>Upload a document</Button>}
          className="py-20"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<FileText className="h-5 w-5" />} label="Documents" value={data.stats.totalDocuments} sub={`${data.stats.processedDocuments} ready${data.stats.processingDocuments ? `, ${data.stats.processingDocuments} processing` : ''}${data.stats.failedDocuments ? `, ${data.stats.failedDocuments} failed` : ''}`} />
            <Stat icon={<Sparkles className="h-5 w-5" />} label="AI results saved" value={data.stats.summaries} sub="summaries, extractions and translations" />
            <Stat icon={<GraduationCap className="h-5 w-5" />} label="Study materials" value={data.stats.studyMaterials} sub={`${data.stats.conversations} chat conversation${data.stats.conversations === 1 ? '' : 's'}`} />
            <Stat icon={<HardDrive className="h-5 w-5" />} label="Storage used" value={formatBytes(data.stats.storageBytes)} sub={`${data.stats.favorites} favorite${data.stats.favorites === 1 ? '' : 's'} · ${data.stats.trashed} in trash`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Recent documents</h2>
                <Link to="/app/documents" className="text-sm text-accent hover:underline">View all</Link>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {data.recentDocuments.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <FileText className="h-5 w-5 shrink-0 text-ink-muted" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/workspace/${d.id}`} className="block truncate text-sm font-medium hover:text-accent">{d.title}</Link>
                      <p className="text-xs text-ink-muted">{fileKindLabel(d.fileKind)} · {d.pageCount || '?'} pages · {formatRelative(d.createdAt)}</p>
                    </div>
                    {d.isFavorite && <Star className="h-4 w-4 fill-warning text-warning" />}
                    <StatusBadge status={d.processingStatus} progress={d.processingProgress} />
                  </li>
                ))}
              </ul>
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Quick actions</h2>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" className="justify-start" onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>Upload a document</Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate('/app/workspace')} leftIcon={<Sparkles className="h-4 w-4" />}>Open the AI workspace</Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate('/app/study')} leftIcon={<GraduationCap className="h-4 w-4" />}>Review study materials</Button>
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-base font-semibold">Recent activity</h2>
                {data.activity.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.activity.map((a, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="mt-0.5 text-ink-muted">{a.type === 'upload' ? <Upload className="h-4 w-4" /> : a.type === 'chat' ? <MessageSquareText className="h-4 w-4" /> : a.type === 'study' ? <GraduationCap className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}</span>
                        <div className="min-w-0">
                          <Link to={`/app/workspace/${a.documentId}`} className="block truncate hover:text-accent">{a.label}</Link>
                          <p className="text-xs text-ink-muted">{a.type !== 'upload' && `${a.documentTitle} · `}{formatRelative(a.at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>
    </Card>
  );
}
