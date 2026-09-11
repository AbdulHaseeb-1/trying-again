import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * A tiny durable JSON document, used wherever Postgres is optional.
 *
 * The service already treats its archive as optional — a laptop or a first
 * clone runs without `DATABASE_URL` — and agent state must not be the one thing
 * that silently degrades to "lost on restart". So every store below has a file
 * backing: same data, same lifetime across restarts, just no queries.
 *
 * Writes go to a temporary file and are renamed into place, so a crash mid-write
 * leaves the previous document intact rather than a truncated one.
 */
export class JsonFileStore<T> {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly fallback: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      const text = await readFile(this.path, 'utf8');
      return JSON.parse(text) as T;
    } catch {
      return this.fallback();
    }
  }

  /** Serialised against itself: concurrent writers never interleave. */
  async write(value: T): Promise<void> {
    const next = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async update(mutate: (current: T) => T): Promise<T> {
    const current = await this.read();
    const next = mutate(current);
    await this.write(next);
    return next;
  }
}
