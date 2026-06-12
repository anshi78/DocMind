import { createParser } from 'eventsource-parser';

interface StreamOptions {
  onMessage: (content: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  token?: string | null;
  orgId?: string | null;
}

export async function streamChat(
  conversationId: string,
  messageContent: string,
  options: StreamOptions
) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.orgId) {
    headers['X-Org-ID'] = options.orgId;
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/conversations/${conversationId}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: messageContent }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to start stream');
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const parser = createParser({
      onEvent: (event) => {
        if (event.data === '[DONE]') {
          options.onClose?.();
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          // Standard SSE might return just text or structured JSON
          if (parsed.content) {
            options.onMessage(parsed.content);
          } else if (typeof parsed === 'string') {
            options.onMessage(parsed);
          }
        } catch (e) {
          // If JSON parse fails, check if the data itself is raw text
          options.onMessage(event.data);
        }
      }
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value);
      parser.feed(chunk);
    }
  } catch (error: any) {
    if (options.onError) {
      options.onError(error);
    } else {
      console.error('Streaming error', error);
    }
  }
}
