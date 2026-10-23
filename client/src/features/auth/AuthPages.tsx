import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/primitives';
import { Logo } from '@/components/layout/Logo';
import { ApiError, request } from '@/lib/api';
import { useAuth } from './AuthContext';

const password = z.string().min(8, 'At least 8 characters').max(128).refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), 'Use at least one letter and one number');

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-6 text-sm text-ink-muted">{footer}</p>}
    </div>
  );
}

function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED') return err.message;
    if (err.status === 0) return err.message;
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/* ---------------- Login ---------------- */
const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back." footer={<>New here? <Link to="/register" className="text-accent underline">Create an account</Link></>}>
      {sessionExpired && <Alert tone="warning" className="mb-4">Your session expired. Please sign in again.</Alert>}
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Button type="submit" size="lg" loading={formState.isSubmitting} className="mt-1">
          Sign in
        </Button>
        <Link to="/forgot-password" className="text-center text-sm text-ink-muted hover:text-ink">
          Forgot your password?
        </Link>
      </form>
    </AuthShell>
  );
}

/* ---------------- Register ---------------- */
const registerSchema = z
  .object({ displayName: z.string().trim().min(1, 'Enter your name').max(80), email: z.string().email('Enter a valid email'), password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { user, register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  if (user) return <Navigate to="/app" replace />;

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    try {
      await registerUser(values.email, values.password, values.displayName);
      navigate('/app', { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Free to use. No card required." footer={<>Already have an account? <Link to="/login" className="text-accent underline">Sign in</Link></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <Input label="Name" autoComplete="name" error={formState.errors.displayName?.message} {...register('displayName')} />
        <Input label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters with a letter and a number." error={formState.errors.password?.message} {...register('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Button type="submit" size="lg" loading={formState.isSubmitting} className="mt-1">
          Create account
        </Button>
        <p className="text-center text-xs text-ink-muted">
          By continuing you agree to the <Link to="/terms" className="underline">terms</Link> and <Link to="/privacy" className="underline">privacy policy</Link>.
        </p>
      </form>
    </AuthShell>
  );
}

/* ---------------- Forgot password ---------------- */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ message: string; devResetUrl?: string; emailConfigured: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await request<{ message: string; devResetUrl?: string; emailConfigured: boolean }>('/auth/forgot-password', { method: 'POST', body: { email } });
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you signed up with." footer={<Link to="/login" className="text-accent underline">Back to sign in</Link>}>
      {result ? (
        <div className="grid gap-3">
          <Alert tone={result.emailConfigured ? 'success' : 'warning'}>{result.message}</Alert>
          {result.devResetUrl && (
            <Alert tone="info" title="Development mode">
              Email delivery is not configured on this server, so the reset link is shown here instead of being sent.{' '}
              <a href={result.devResetUrl} className="font-medium underline">
                Open the reset link
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* ---------------- Reset password ---------------- */
const resetSchema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type ResetForm = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (values: ResetForm) => {
    setServerError(null);
    try {
      await request('/auth/reset-password', { method: 'POST', body: { token, password: values.password } });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <Alert tone="danger">This reset link is missing its token. Request a new one from the sign-in page.</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <Alert tone="success">Password updated. Redirecting you to sign in…</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <Input label="New password" type="password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
          <Input label="Confirm password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
