import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist-electron', { recursive: true });
await cp('electron', 'dist-electron/electron', { recursive: true });
