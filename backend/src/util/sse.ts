import type { Response } from 'express';

export class EventQueue implements AsyncIterable<string> {
  private queue: string[] = [];
  private resolvers: Array<() => void> = [];
  private closed = false;

  push(event: string): void {
    this.queue.push(event);
    this._flush();
  }

  close(): void {
    this.closed = true;
    this._flush();
  }

  private _flush(): void {
    const resolvers = this.resolvers.splice(0);
    for (const r of resolvers) r();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    while (true) {
      if (this.queue.length) {
        yield this.queue.shift()!;
        continue;
      }
      if (this.closed) break;
      await new Promise<void>((r) => this.resolvers.push(r));
    }
  }
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseSend(res: Response, event: string, data: unknown): void {
  res.write(sseEncode(event, data));
}

export function startSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Bridge a list of serialized SSE lines to the response, flushing as they arrive. */
export async function pumpQueue(res: Response, queue: EventQueue): Promise<void> {
  for await (const line of queue) {
    res.write(line);
  }
}
