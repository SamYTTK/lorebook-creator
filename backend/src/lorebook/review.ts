import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { REVIEW_DIR, writeJson, readJson } from '../config.js';
import type { StagedChange } from '../types.js';

const STAGED_FILE = path.join(REVIEW_DIR, 'staged.json');

let cache: StagedChange[] | null = null;

function load(): StagedChange[] {
  if (cache) return cache;
  cache = readJson<StagedChange[]>(STAGED_FILE, []);
  return cache!;
}

function persist(): void {
  writeJson(STAGED_FILE, cache || []);
}

export function listPending(): StagedChange[] {
  return load().filter((c) => c.status === 'pending');
}

export function listAll(): StagedChange[] {
  return load();
}

export function addStaged(change: Omit<StagedChange, 'id' | 'createdAt' | 'status'>): StagedChange {
  const staged: StagedChange = {
    ...change,
    id: uuidv4(),
    createdAt: Date.now(),
    status: 'pending',
  };
  const list = load();
  list.push(staged);
  cache = list;
  persist();
  return staged;
}

export function getStaged(id: string): StagedChange | undefined {
  return load().find((c) => c.id === id);
}

export function markApplied(id: string, appliedAt = Date.now()): StagedChange | undefined {
  const list = load();
  const found = list.find((c) => c.id === id);
  if (found) {
    found.status = 'applied';
    found.appliedAt = appliedAt;
    cache = list;
    persist();
  }
  return found;
}

export function markRejected(id: string): StagedChange | undefined {
  const list = load();
  const found = list.find((c) => c.id === id);
  if (found) {
    found.status = 'rejected';
    found.rejectedAt = Date.now();
    cache = list;
    persist();
  }
  return found;
}

export function clearHistory(keepPending = false): void {
  const list = load();
  if (keepPending) {
    cache = list.filter((c) => c.status === 'pending');
  } else {
    cache = [];
  }
  persist();
}
