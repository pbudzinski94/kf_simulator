const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const built = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'client', 'app.config.json'), 'utf8'));

if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(source.version)) {
  throw new Error(`Invalid deployment version: ${source.version}`);
}
if (built.version !== source.version) {
  throw new Error(`Built version ${built.version} does not match source ${source.version}`);
}

console.log(`Version config test passed: ${source.version}`);
