import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { CHATS_DIR, writeJson, readJson } from '../config.js';
import type { ChatSession, HistoryMessage } from '../types.js';

function fileFor(id: string): string {
  return path.join(CHATS_DIR, `${id}.json`);
}

export function listSessions(): Array<{ id: string; title: string; createdAt: number; updatedAt: number; messageCount: number; model: string }> {
  const files = fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((file) => {
    const id = path.basename(file, '.json');
    const session = readJson<ChatSession>(path.join(CHATS_DIR, file), { id, title: 'Untitled', createdAt: 0, updatedAt: 0, model: '', messages: [] });
    return {
      id,
      title: session.title || 'Untitled',
      createdAt: session.createdAt || 0,
      updatedAt: session.updatedAt || 0,
      messageCount: (session.messages || []).length,
      model: session.model || '',
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): ChatSession | null {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  const session = readJson<ChatSession>(file, { id, title: 'Untitled', createdAt: 0, updatedAt: 0, model: '', messages: [] });
  session.messages = session.messages || [];
  return session;
}

export function createSession(title = 'New Chat', model = ''): ChatSession {
  const now = Date.now();
  const session: ChatSession = { id: uuidv4(), title, createdAt: now, updatedAt: now, model, messages: [] };
  writeJson(fileFor(session.id), session);
  return session;
}

export function saveSession(session: ChatSession): ChatSession {
  session.updatedAt = Date.now();
  writeJson(fileFor(session.id), session);
  return session;
}

export function deleteSession(id: string): boolean {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function appendMessage(id: string, message: HistoryMessage): ChatSession {
  const session = getSession(id) || createSession();
  session.messages.push(message);
  return saveSession(session);
}

export function updateMessage(id: string, messageId: string, patch: Partial<HistoryMessage>): ChatSession {
  const session = getSession(id);
  if (!session) throw new Error(`Session ${id} not found`);
  const idx = session.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) throw new Error(`Message ${messageId} not found`);
  session.messages[idx] = { ...session.messages[idx], ...patch };
  return saveSession(session);
}

export function sessionToText(session: ChatSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push(`Model: ${session.model || 'unknown'} | Exported: ${new Date().toISOString()}`);
  lines.push('');
  for (const msg of session.messages) {
    const roleLabel = { user: 'You', assistant: session.model || 'Assistant', system: 'System', tool: 'Tool' }[msg.role] || msg.role;
    lines.push(`--- ${roleLabel} ---`);
    if (msg.reasoning) {
      lines.push(`[reasoning]\n${msg.reasoning}\n[/reasoning]`);
    }
    if (msg.attachments?.length) {
      lines.push(`[attachments: ${msg.attachments.map((a) => a.name).join(', ')}]`);
    }
    lines.push(msg.content);
    lines.push('');
  }
  return lines.join('\n');
}

export function sessionToJson(session: ChatSession): string {
  return JSON.stringify(session, null, 2);
}
