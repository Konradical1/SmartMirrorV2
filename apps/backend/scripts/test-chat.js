#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { appendHistory, runJarvisTurn } from '../src/jarvis/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(repoRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const args = process.argv.slice(2);
const textFlag = readFlag('--text');
const text = textFlag.value || (!textFlag.present && args.length ? args.join(' ') : '');
let history = [];

if (text) {
  const result = await runJarvisTurn(text, { history, broadcast: false });
  printResult(result);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const input = await ask(rl, 'You: ');
  if (!input.trim()) continue;
  if (/^(quit|exit|bye)$/i.test(input.trim())) break;

  const result = await runJarvisTurn(input, { history, broadcast: false });
  if (result.ok) history = appendHistory(history, input, result.speech);
  printResult(result);
}
rl.close();

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return { present: false, value: '' };
  const next = args[index + 1];
  if (!next || next.startsWith('--')) return { present: true, value: '' };
  return { present: true, value: next };
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function printResult(result) {
  console.log(`Intent ${result.intent}${result.fast ? ' fast' : ''}`);
  console.log(`Params ${JSON.stringify(result.params)}`);
  console.log(`Jarvis ${result.speech}`);
}
