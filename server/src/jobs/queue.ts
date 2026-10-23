import { logger } from '../config/logger.js';

/**
 * Minimal in-process job queue with bounded concurrency.
 *
 * Limits (documented in README): jobs are lost if the server process dies mid-run;
 * documents left in a non-terminal state are re-queued on boot (see processingService).
 * For multi-instance or production deployments, replace this with BullMQ + Redis by
 * implementing the same `enqueue` signature.
 */
export class JobQueue {
  private running = 0;
  private readonly pending: Array<{ id: string; run: () => Promise<void> }> = [];
  private readonly active = new Set<string>();

  constructor(private readonly concurrency: number, private readonly name: string) {}

  enqueue(id: string, run: () => Promise<void>): boolean {
    if (this.active.has(id) || this.pending.some((p) => p.id === id)) return false;
    this.pending.push({ id, run });
    queueMicrotask(() => this.drain());
    return true;
  }

  isQueuedOrRunning(id: string) {
    return this.active.has(id) || this.pending.some((p) => p.id === id);
  }

  get stats() {
    return { running: this.running, pending: this.pending.length };
  }

  private drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running++;
      this.active.add(job.id);
      job
        .run()
        .catch((err) => logger.error({ err, job: job.id, queue: this.name }, 'Job failed'))
        .finally(() => {
          this.running--;
          this.active.delete(job.id);
          this.drain();
        });
    }
  }
}
