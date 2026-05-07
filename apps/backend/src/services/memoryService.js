import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const memoryPath = process.env.MIRROR_MEMORY_PATH || path.resolve(__dirname, '../../../../MEMORY.md');

export async function loadMemory() {
  const memory = await fs.promises.readFile(memoryPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '# MEMORY.md\n\n## Konrad\n';
    throw error;
  });
  return memory;
}

export function loadMemorySync() {
  try {
    return fs.readFileSync(memoryPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '# MEMORY.md\n\n## Konrad\n';
    return null;
  }
}

export async function updateMemory(params = {}) {
  const text = String(params.text || params.memory || params.fact || params.note || '').trim();
  if (!text) {
    const error = new Error('UPDATE_MEMORY requires params.text.');
    error.status = 400;
    throw error;
  }

  const section = String(params.section || 'Konrad').trim().replace(/^#+\s*/, '') || 'Konrad';
  const current = await loadMemory();
  const next = appendMemoryBullet(current, section, text);
  await fs.promises.writeFile(memoryPath, next, 'utf8');
  return {
    path: memoryPath,
    section,
    text,
    updatedAt: new Date().toISOString(),
    content: next,
  };
}

function appendMemoryBullet(markdown, section, text) {
  const bullet = `- ${text.replace(/\s+/g, ' ')}`;
  const escaped = escapeRegExp(bullet.toLowerCase());
  if (new RegExp(`^${escaped}$`, 'im').test(markdown.toLowerCase())) return markdown;

  const heading = `## ${section}`;
  const headingPattern = new RegExp(`(^##\\s+${escapeRegExp(section)}\\s*$)`, 'im');
  const match = markdown.match(headingPattern);

  if (!match || match.index === undefined) {
    const suffix = markdown.endsWith('\n') ? '' : '\n';
    return `${markdown}${suffix}\n${heading}\n\n${bullet}\n`;
  }

  const insertFrom = match.index + match[0].length;
  const nextSectionOffset = markdown.slice(insertFrom).search(/\n##\s+/);
  const insertAt = nextSectionOffset === -1 ? markdown.length : insertFrom + nextSectionOffset;
  const before = markdown.slice(0, insertAt).replace(/\s*$/, '');
  const after = markdown.slice(insertAt);
  return `${before}\n${bullet}\n${after}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
