import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { z } from 'zod';

const startedSchema = z.object({
  id: z.string(),
});

const jobSchema = z.object({
  id: z.string(),
  status: z.enum(['running', 'done', 'failed']),
  note: z.string().optional(),
  queries: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type ColumboJob = z.infer<typeof jobSchema>;

@Injectable()
export class ColumboRepository {
  get enabled(): boolean {
    return Boolean(env.COLUMBO_URL);
  }

  async startInvestigation(userId: string, prompt: string): Promise<string> {
    const response = await this.request('POST', '/internal/investigations/adhoc', { userId, prompt });
    return startedSchema.parse(await response.json()).id;
  }

  async getInvestigation(id: string): Promise<ColumboJob | null> {
    const response = await this.request(
      'GET',
      `/internal/investigations/adhoc/${encodeURIComponent(id)}`,
      undefined,
      [404],
    );
    if (response.status === 404) {
      return null;
    }
    return jobSchema.parse(await response.json());
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    const response = await fetch(new URL(path, env.COLUMBO_URL), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_SECRET,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(
        `columbo ${method} ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
    return response;
  }
}
