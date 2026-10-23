import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Input';
import { Alert, Card, Modal, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { API_BASE, ApiError } from '@/lib/api';
import { aiApi, usersApi } from '@/services/api';
import type { ExplanationLevel, OutputLength, Theme, UserPreferences } from '@/types';

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: aiApi.status });
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [prefs, setPrefs] = useState<UserPreferences>(user!.preferences);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const err = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

  const saveProfile = useMutation({
    mutationFn: () => usersApi.update({ displayName: displayName.trim(), preferences: prefs }),
    onSuccess: (d) => { setUser(d.user); toast.success('Settings saved'); },
    onError: (e) => toast.error('Could not save', err(e)),
  });
  const changePw = useMutation({
    mutationFn: () => usersApi.changePassword(pw.current, pw.next),
    onSuccess: (d) => { toast.success('Password updated', d.message); setPw({ current: '', next: '', confirm: '' }); setPwError(null); },
    onError: (e) => setPwError(err(e)),
  });
  const deleteAccount = useMutation({
    mutationFn: () => usersApi.deleteAccount(deletePassword),
    onSuccess: () => { setUser(null); toast.info('Your account and documents have been deleted.'); navigate('/'); },
    onError: (e) => toast.error('Could not delete account', err(e)),
  });

  const onChangePw = (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return setPwError('The new passwords do not match.');
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) return setPwError('Use at least 8 characters with a letter and a number.');
    changePw.mutate();
  };

  const onTheme = (t: Theme) => { setTheme(t); setPrefs((p) => ({ ...p, theme: t })); };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Your profile, defaults for AI output, and account controls." />
      <div className="grid gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            <Input label="Email" value={user?.email ?? ''} readOnly disabled hint="Email cannot be changed in this version." />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Appearance</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} onClick={() => onTheme(t)} aria-pressed={theme === t} className={`rounded-md border px-3 py-1.5 text-sm capitalize ${theme === t ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:border-line-strong'}`}>{t}</button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">AI defaults</h2>
          <p className="mt-1 text-sm text-ink-muted">Used when you don't choose a level or length in the workspace.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select label="Explanation level" value={prefs.defaultExplanationLevel} onChange={(e) => setPrefs((p) => ({ ...p, defaultExplanationLevel: e.target.value as ExplanationLevel }))} options={[{ value: 'very_simple', label: 'Very simple' }, { value: 'beginner', label: 'Beginner' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed' }]} />
            <Select label="Summary length" value={prefs.defaultSummaryLength} onChange={(e) => setPrefs((p) => ({ ...p, defaultSummaryLength: e.target.value as OutputLength }))} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'detailed', label: 'Detailed' }]} />
            <Select label="Preferred language for translations" value={prefs.preferredLanguage} onChange={(e) => setPrefs((p) => ({ ...p, preferredLanguage: e.target.value }))} options={(ai?.translationLanguages ?? [prefs.preferredLanguage]).map((l) => ({ value: l, label: l }))} />
          </div>
          {ai && (
            <div className="mt-4 rounded-md bg-surface-raised p-3 text-sm">
              <p className="font-medium">AI provider on this server</p>
              <p className="text-ink-soft">{ai.configured ? `${ai.providerLabel} · model ${ai.model}` : `Not configured: ${ai.problem}`}</p>
              <p className="mt-1 text-xs text-ink-muted">Extracted text from your documents is sent to this provider when you use AI features. Limit: {ai.limits.requestsPerHour} AI requests per hour.</p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Document processing</h2>
          <div className="mt-2 divide-y divide-line">
            <Switch label="Run OCR automatically on scanned pages" description="When off, pages without a text layer are left empty until you run OCR yourself." checked={prefs.autoOcrScannedPages} onChange={(v) => setPrefs((p) => ({ ...p, autoOcrScannedPages: v }))} />
            <Switch label="Enhance images before OCR" description="Contrast normalisation, de-noising and sharpening. Usually improves accuracy on photos." checked={prefs.enhanceImagesBeforeOcr} onChange={(v) => setPrefs((p) => ({ ...p, enhanceImagesBeforeOcr: v }))} />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}>Save settings</Button>
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Change password</h2>
          <form onSubmit={onChangePw} className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <Input label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <Input label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            {pwError && <Alert tone="danger" className="sm:col-span-3">{pwError}</Alert>}
            <div className="sm:col-span-3"><Button type="submit" variant="outline" loading={changePw.isPending} disabled={!pw.current || !pw.next}>Update password</Button></div>
          </form>
          <p className="mt-2 text-xs text-ink-muted">Changing your password signs out every other session.</p>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-ink-muted">Download everything DocuEase holds about you as a JSON file: profile, document metadata, summaries, conversations and study materials. Original files can be downloaded from the library.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`${API_BASE}/users/me/export`} download><Button variant="outline" leftIcon={<Download className="h-4 w-4" />}>Export my data</Button></a>
            <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={async () => { await logout(); navigate('/login'); }}>Sign out of this device</Button>
          </div>
        </Card>

        <Card className="border-danger/40 p-5">
          <h2 className="text-base font-semibold text-danger">Delete account</h2>
          <p className="mt-1 text-sm text-ink-muted">Deletes your account, every document (including the trash), all extracted text, AI results, conversations and study materials. This cannot be undone.</p>
          <Button variant="danger" className="mt-3" onClick={() => setDeleteOpen(true)}>Delete my account</Button>
        </Card>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" description="Type DELETE MY ACCOUNT and enter your password to confirm." size="sm" footer={<><Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={deleteConfirm !== 'DELETE MY ACCOUNT' || !deletePassword} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>Delete everything</Button></>}>
        <div className="grid gap-3">
          <Input label="Confirmation" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE MY ACCOUNT" />
          <Input label="Password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
        </div>
      </Modal>
    </div>
  );
}
