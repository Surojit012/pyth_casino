import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'context', 'lib'];
const patterns = [/dangerouslySetInnerHTML/g, /\binnerHTML\b/g];
const offenders = [];

function walk(currentPath) {
  const stat = fs.statSync(currentPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(currentPath)) {
      walk(path.join(currentPath, entry));
    }
    return;
  }

  if (!/\.(ts|tsx|js|jsx)$/.test(currentPath)) return;
  const content = fs.readFileSync(currentPath, 'utf8');
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      offenders.push(currentPath);
      break;
    }
  }
}

for (const root of roots) {
  const fullPath = path.join(process.cwd(), root);
  if (fs.existsSync(fullPath)) {
    walk(fullPath);
  }
}

if (offenders.length > 0) {
  console.error('Unsafe HTML rendering APIs detected:\n' + offenders.join('\n'));
  process.exit(1);
}

console.log('No unsafe HTML rendering APIs detected.');
