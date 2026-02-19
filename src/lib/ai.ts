import { z } from 'zod';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function openaiChatJson<T>(opts: {
  apiKey?: string;
  model?: string;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0,
      messages: opts.messages,
      response_format: { type: 'json_object' },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI error: ${json?.error?.message ?? res.statusText}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${content}`);
  }
  return opts.schema.parse(parsed);
}

export async function perplexitySearch(opts: {
  apiKey?: string;
  model?: string;
  query: string;
}): Promise<{ text: string; raw: unknown }> {
  const apiKey = opts.apiKey ?? process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('Missing PERPLEXITY_API_KEY');

  const model = opts.model ?? process.env.PERPLEXITY_MODEL ?? 'sonar';

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Provide concise, factual answers. Include company website/domain if confidently found.',
        },
        { role: 'user', content: opts.query },
      ],
      temperature: 0.2,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Perplexity error: ${json?.error?.message ?? res.statusText}`);
  }

  const text = json?.choices?.[0]?.message?.content ?? '';
  return { text, raw: json };
}
