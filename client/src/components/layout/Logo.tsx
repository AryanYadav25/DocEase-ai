import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-ink)" />
      <path d="M9 8h9l5 5v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="var(--color-canvas)" />
      <path d="M18 8v5h5" fill="#C7CBFF" />
      <path d="M11 16h10M11 19h10M11 22h6" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ to = '/', className, compact }: { to?: string; className?: string; compact?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-md', className)} aria-label="DocuEase AI home">
      <LogoMark />
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-ink">
          DocuEase <span className="text-accent">AI</span>
        </span>
      )}
    </Link>
  );
}
