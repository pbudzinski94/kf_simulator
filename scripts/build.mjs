import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(projectRoot, 'dist');
const clientRoot = join(distRoot, 'client');
const serverRoot = join(distRoot, 'server');

await rm(distRoot, { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
await mkdir(serverRoot, { recursive: true });

await Promise.all([
  cp(join(projectRoot, 'index.html'), join(clientRoot, 'index.html')),
  cp(join(projectRoot, 'app.config.json'), join(clientRoot, 'app.config.json')),
  cp(join(projectRoot, 'styles.css'), join(clientRoot, 'styles.css')),
  cp(join(projectRoot, 'js'), join(clientRoot, 'js'), { recursive: true }),
  cp(join(projectRoot, 'worker', 'index.js'), join(serverRoot, 'index.js'))
]);

console.log(`Static build created in ${distRoot}`);
