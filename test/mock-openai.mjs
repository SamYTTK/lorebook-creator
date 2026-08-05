// Mock OpenAI-compatible server for integration testing.
// Supports /v1/models and streaming /v1/chat/completions with:
//  - reasoning_content deltas (for reasoning models)
//  - tool_calls (when the user message contains "USE_TOOL" and tools are provided)
//  - a second turn that resolves the tool call with a summary
import express from 'express';
import cors from 'cors';

const PORT = Number(process.env.PORT || 3200);
const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

const MODELS = ['mock-reasoner', 'mock-agent', 'mock-plain'];

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

app.get('/v1/models', (_req, res) => {
  res.json({ object: 'list', data: MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'mock' })) });
});

app.post('/v1/chat/completions', (req, res) => {
  const { messages, stream, tools, model } = req.body;

  // Guard: reasoning_content is an output-only field and must never be re-sent.
  const leakingReasoning = (messages || []).some((m) => Object.prototype.hasOwnProperty.call(m || {}, 'reasoning_content'));
  if (leakingReasoning) {
    res.status(400).json({ error: 'request contained forbidden reasoning_content field' });
    return;
  }
  // Guard: an assistant message must never open the message list.
  if (Array.isArray(messages) && messages[0]?.role === 'assistant') {
    res.status(400).json({ error: 'request opened with an assistant message' });
    return;
  }

  if (stream !== true) {
    // non-streaming path
    const last = messages[messages.length - 1];
    const message = {
      role: 'assistant',
      content: `(non-stream) got ${messages.length} messages, last role=${last?.role}.`,
      reasoning_content: 'non-stream reasoning',
    };
    return res.json({ id: 'cmpl-mock', object: 'chat.completion', model, choices: [{ index: 0, message, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastText = typeof lastUser?.content === 'string' ? lastUser.content : (Array.isArray(lastUser?.content) ? lastUser.content.map((p) => p.text || '[media]').join(' ') : '');
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const isToolResultTurn = messages.some((m) => m.role === 'tool');
  const wantsTool = /USE_TOOL/i.test(lastText) && hasTools && !isToolResultTurn;

  const id = 'cmpl-mock';
  const write = (delta, finishReason) => {
    res.write(sse({
      id, object: 'chat.completion.chunk', model, created: 0,
      choices: [{ index: 0, delta, finish_reason: finishReason || null }],
    }));
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  (async () => {
    // role + reasoning deltas
    write({ role: 'assistant', reasoning_content: '' });
    const reasoning = 'Mock reasoning: analyzing the request step by step.\nSecond line of reasoning.';
    for (const line of reasoning.split('\n')) {
      write({ reasoning_content: line + '\n' });
      await sleep(5);
    }

    if (wantsTool) {
      const toolName = 'lorebook_create_entry';
      const args = JSON.stringify({ keys: ['Testland', 'testland'], content: 'Testland is a small mock nation built for testing.', comment: 'Created by mock provider', order: 100 });
      // emit tool call deltas
      for (const chunk of ['{"keys":', '["Testland","testland"],', '"content":', '"Testland is a small mock nation built for testing.",', '"comment":', '"Created by mock provider",', '"order":100}']) {
        write({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: chunk.startsWith('{"keys"') ? toolName : undefined, arguments: chunk } }] });
        await sleep(5);
      }
      write({}, 'tool_calls');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (isToolResultTurn) {
      const toolMsg = messages.find((m) => m.role === 'tool');
      const got = toolMsg?.content || '';
      const text = `I called the tool and the result was:\n${got}`;
      const words = text.split(' ');
      for (const w of words) { write({ content: w + ' ' }); await sleep(4); }
      write({}, 'stop');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // normal completion
    let text = `Hello from the mock! You sent: "${lastText.slice(0, 60)}". Media parts: ${Array.isArray(lastUser?.content) ? lastUser.content.filter((p) => p.type !== 'text').length : 0}.`;
    const words = text.split(' ');
    for (const w of words) { write({ content: w + ' ' }); await sleep(4); }
    write({}, 'stop');
    res.write('data: [DONE]\n\n');
    res.end();
  })();
});

app.listen(PORT, () => console.log(`[mock-openai] listening on http://localhost:${PORT}`));
