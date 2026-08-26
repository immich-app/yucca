import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { env } from './env.js';

const messageSchema = z.object({
  From: z.string(),
  To: z.string(),
  Subject: z.string(),
  HtmlBody: z.string().optional(),
  TextBody: z.string().optional(),
  Tag: z.string().optional(),
  MessageStream: z.string().optional(),
});

type PostmarkMessage = z.infer<typeof messageSchema>;

const parseAddress = (address: string) => {
  const match = address.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { Name: match[1], Email: match[2] } : { Name: '', Email: address.trim() };
};

const deliverToMailpit = async (message: PostmarkMessage) => {
  const response = await fetch(new URL('/api/v1/send', env.MAILPIT_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: parseAddress(message.From),
      To: message.To.split(',').map((address) => parseAddress(address)),
      Subject: message.Subject,
      HTML: message.HtmlBody ?? '',
      Text: message.TextBody ?? '',
      Tags: message.Tag ? [message.Tag] : [],
      Headers: { 'X-Message-Stream': message.MessageStream ?? 'outbound' },
    }),
  });
  if (!response.ok) {
    throw new Error(`Mailpit send failed: ${response.status} ${response.statusText} — ${await response.text()}`);
  }
  const { ID } = (await response.json()) as { ID: string };
  return ID;
};

const sendOne = async (message: unknown) => {
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) {
    return { ErrorCode: 300, Message: `Invalid request: ${parsed.error.message}` };
  }

  try {
    const id = await deliverToMailpit(parsed.data);
    return {
      To: parsed.data.To,
      SubmittedAt: new Date().toISOString(),
      MessageID: id,
      ErrorCode: 0,
      Message: 'OK',
    };
  } catch (error) {
    return { To: parsed.data.To, ErrorCode: 300, Message: `${error}` };
  }
};

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => (data += chunk));
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });

const respond = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    respond(response, 500, { ErrorCode: 500, Message: `${error}` });
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (request.method === 'GET' && path === '/health') {
    respond(response, 200, { status: 'ok' });
    return;
  }

  if (request.method !== 'POST' || (path !== '/email' && path !== '/email/batch')) {
    respond(response, 404, { ErrorCode: 404, Message: `No such endpoint: ${request.method} ${path}` });
    return;
  }

  if (!request.headers['x-postmark-server-token']) {
    respond(response, 401, { ErrorCode: 10, Message: 'No Account or Server API tokens were supplied.' });
    return;
  }

  const body: unknown = JSON.parse(await readBody(request));

  if (path === '/email') {
    const result = await sendOne(body);
    respond(response, result.ErrorCode === 0 ? 200 : 422, result);
    return;
  }

  if (!Array.isArray(body)) {
    respond(response, 422, { ErrorCode: 300, Message: 'Batch payload must be an array' });
    return;
  }
  const results = [];
  for (const message of body) {
    results.push(await sendOne(message));
  }
  respond(response, 200, results);
}

server.listen(env.PORT, () => {
  console.log(`mock-postmark-provider listening on :${env.PORT}, delivering to ${env.MAILPIT_URL}`);
});
