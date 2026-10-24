import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eraser, Plus, RefreshCw, Send, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, Dropdown, DropdownItem, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { copyToClipboard, formatRelative, scrollIntoContainer } from '@/lib/utils';
import { aiApi } from '@/services/api';
import type { ChatResult, Message } from '@/types';
import { AiUnavailable, GeneratedBy, Markdown, errorText, useWorkspace } from './common';

export function ChatPanel() {
  const { doc, ai, goToPage } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversations = useQuery({ queryKey: ['conversations', doc.id], queryFn: () => aiApi.conversations(doc.id) });
  const suggestions = useQuery({ queryKey: ['suggested-questions', doc.id], queryFn: () => aiApi.suggestedQuestions(doc.id), enabled: !!ai?.configured, staleTime: Infinity, retry: false });

  useEffect(() => {
    if (conversationId !== null || !conversations.data) return;
    const first = conversations.data.conversations[0];
    if (first) setConversationId(first.id);
  }, [conversations.data, conversationId]);

  const thread = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => aiApi.conversation(conversationId!), enabled: !!conversationId });
  useEffect(() => {
    if (thread.data) setMessages(thread.data.messages);
  }, [thread.data]);
  useEffect(() => scrollIntoContainer(bottomRef.current, 'nearest', true), [messages, pending]);

  const send = async (text: string, regenerateMessageId?: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setPending(message);
    setProgress(0);
    setInput('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let result: ChatResult | null = null;
      const body = { conversationId: conversationId ?? undefined, message, regenerateMessageId };
      if (ai?.supportsStreaming) {
        await aiApi.chatStream(doc.id, body, (event, data) => {
          if (event === 'progress') setProgress((data as { chars: number }).chars);
          if (event === 'done') result = data as ChatResult;
          if (event === 'error') throw new Error((data as { message: string }).message);
        }, controller.signal);
      } else {
        result = await aiApi.chat(doc.id, body);
      }
      if (!result) throw new Error('No answer was returned.');
      const r: ChatResult = result;
      if (!conversationId) setConversationId(r.conversation.id);
      setMessages((m) => [...m.filter((x) => x.id !== regenerateMessageId), r.userMessage, r.assistantMessage]);
      void qc.invalidateQueries({ queryKey: ['conversations', doc.id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error && !('status' in err) ? err.message : errorText(err));
      setInput(message);
    } finally {
      setPending(null);
      abortRef.current = null;
    }
  };

  const regenerate = (assistantMsg: Message) => {
    const idx = messages.findIndex((m) => m.id === assistantMsg.id);
    const prevUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    if (prevUser) {
      setMessages((m) => m.filter((x) => x.id !== prevUser.id));
      void send(prevUser.content, assistantMsg.id);
    }
  };

  const feedback = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'up' | 'down' | null }) => aiApi.messageFeedback(id, value),
    onSuccess: (data) => setMessages((m) => m.map((x) => (x.id === data.message.id ? data.message : x))),
  });
  const clear = useMutation({
    mutationFn: () => aiApi.clearConversation(conversationId!),
    onSuccess: () => {
      setMessages([]);
      void qc.invalidateQueries({ queryKey: ['conversations', doc.id] });
    },
  });
  const removeConv = useMutation({
    mutationFn: (id: string) => aiApi.deleteConversation(id),
    onSuccess: () => {
      setConversationId(null);
      setMessages([]);
      void qc.invalidateQueries({ queryKey: ['conversations', doc.id] });
    },
  });
  const newConversation = useMutation({
    mutationFn: () => aiApi.createConversation(doc.id),
    onSuccess: (data) => {
      setConversationId(data.conversation.id);
      setMessages([]);
      void qc.invalidateQueries({ queryKey: ['conversations', doc.id] });
    },
  });

  const convList = conversations.data?.conversations ?? [];
  const currentConv = convList.find((c) => c.id === conversationId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Dropdown
          align="left"
          trigger={
            <button className="max-w-56 truncate rounded-md px-2 py-1 text-left text-sm font-medium hover:bg-line/50" aria-label="Choose conversation">
              {currentConv?.title ?? 'New conversation'} <span className="text-ink-muted">▾</span>
            </button>
          }
        >
          <DropdownItem icon={<Plus className="h-4 w-4" />} onClick={() => newConversation.mutate()}>New conversation</DropdownItem>
          {convList.map((c) => (
            <DropdownItem key={c.id} onClick={() => setConversationId(c.id)}>
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-xs text-ink-muted">{c.messageCount}</span>
            </DropdownItem>
          ))}
        </Dropdown>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => clear.mutate()} disabled={!conversationId || !messages.length} leftIcon={<Eraser className="h-3.5 w-3.5" />}>Clear</Button>
          <Button variant="ghost" size="icon" onClick={() => conversationId && removeConv.mutate(conversationId)} disabled={!conversationId} aria-label="Delete conversation"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
        <AiUnavailable ai={ai} />
        {thread.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!thread.isLoading && messages.length === 0 && !pending && (
          <div className="py-4 text-sm">
            <p className="text-ink-muted">Ask anything about this document. Answers are built only from its extracted text and come with page references you can click.</p>
            {suggestions.data?.questions.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.data.questions.map((q) => (
                  <button key={q} onClick={() => void send(q)} className="rounded-full border border-line bg-surface px-3 py-1 text-left text-xs text-ink-soft hover:border-accent hover:text-accent-ink">{q}</button>
                ))}
              </div>
            ) : suggestions.isLoading ? <p className="mt-3 text-xs text-ink-muted">Preparing suggested questions…</p> : null}
          </div>
        )}
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white">{m.content}</div>
              ) : (
                <div className="group max-w-full rounded-lg border border-line bg-surface p-3 text-sm">
                  {m.foundInDocument === false && <Badge tone="warning" className="mb-2">Not found in the document</Badge>}
                  <Markdown>{m.content}</Markdown>
                  {m.sourceReferences.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-ink-muted">Sources</span>
                      {m.sourceReferences.map((r, i) => (
                        <button key={i} onClick={() => goToPage(r.pageNumber)} title={r.excerpt} className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink hover:bg-accent/20">p.{r.pageNumber}</button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                    <GeneratedBy meta={m.modelMeta} />
                    <div className="flex items-center gap-0.5">
                      <button onClick={async () => toast[(await copyToClipboard(m.content)) ? 'success' : 'error']('Copied')} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Copy answer"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => regenerate(m)} disabled={!!pending} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Regenerate answer"><RefreshCw className="h-3.5 w-3.5" /></button>
                      <button onClick={() => feedback.mutate({ id: m.id, value: m.feedback === 'up' ? null : 'up' })} className={`rounded p-1 hover:text-ink ${m.feedback === 'up' ? 'text-success' : 'text-ink-muted'}`} aria-label="Good answer" aria-pressed={m.feedback === 'up'}><ThumbsUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => feedback.mutate({ id: m.id, value: m.feedback === 'down' ? null : 'down' })} className={`rounded p-1 hover:text-ink ${m.feedback === 'down' ? 'text-danger' : 'text-ink-muted'}`} aria-label="Poor answer" aria-pressed={m.feedback === 'down'}><ThumbsDown className="h-3.5 w-3.5" /></button>
                      <span className="ml-1 text-[11px] text-ink-muted">{formatRelative(m.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
          {pending && (
            <>
              <li className="flex justify-end"><div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white">{pending}</div></li>
              <li><div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm text-ink-muted"><Spinner className="h-4 w-4" /> {progress ? `Writing the answer… (${progress} characters)` : 'Finding the relevant pages…'}</div></li>
            </>
          )}
        </ul>
        {error && <Alert tone="danger" className="mt-3" title="The question could not be answered">{error}</Alert>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} rows={2} placeholder={ai?.configured ? 'Ask a question about this document…' : 'AI is not configured'} disabled={!ai?.configured || !!pending} className="flex-1 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60" aria-label="Your question" maxLength={4000} />
          {pending ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || !ai?.configured} aria-label="Send"><Send className="h-4 w-4" /></Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">Enter to send, Shift+Enter for a new line. Answers can be wrong; check the cited pages.</p>
      </form>
    </div>
  );
}

