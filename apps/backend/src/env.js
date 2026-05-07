import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(repoRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });
