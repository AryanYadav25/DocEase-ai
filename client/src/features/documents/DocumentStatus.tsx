import { Badge } from '@/components/ui/primitives';
import { STATUS_LABELS } from '@/lib/utils';
import type { ProcessingStatus } from '@/types';

export function StatusBadge({ status, progress }: { status: ProcessingStatus; progress?: number }) {
  const tone = status === 'completed' ? 'success' : status === 'completed_with_warnings' ? 'warning' : status === 'failed' ? 'danger' : 'info';
  const label = STATUS_LABELS[status] ?? status;
  const active = !['completed', 'completed_with_warnings', 'failed'].includes(status);
  return (
    <Badge tone={tone} dot={active}>
      {label}
      {active && progress !== undefined && progress > 0 ? ` ${progress}%` : ''}
    </Badge>
  );
}
