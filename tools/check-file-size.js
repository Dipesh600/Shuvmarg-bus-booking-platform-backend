const fs = require('fs');
const path = require('path');
const baseline = require('../config/refactor-file-size-baseline.json');

const DEFAULT_LIMIT = 150;
const EXCLUDED_DIRS = ['node_modules', 'coverage', 'dist', 'build', '.git'];
const JS_EXTENSIONS = ['.js', '.cjs', '.mjs'];

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!EXCLUDED_DIRS.includes(file)) {
        getFiles(filePath, fileList);
      }
    } else {
      if (JS_EXTENSIONS.includes(path.extname(file))) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

let violations = 0;
const projectRoot = path.join(__dirname, '..');
const allFiles = getFiles(projectRoot);

for (const file of allFiles) {
  // Convert absolute path to relative from project root (e.g. "controllers/foo.js")
  const relativePath = path.relative(projectRoot, file);
  
  // Read file and count lines (match wc -l behavior)
  const content = fs.readFileSync(file, 'utf8');
  const lineCount = (content.match(/\n/g) || []).length;
  
  // Check against baseline
  let allowedLimit = DEFAULT_LIMIT;
  if (baseline[relativePath] !== undefined) {
    allowedLimit = baseline[relativePath];
  }
  
  if (lineCount > allowedLimit) {
    console.error(`FAIL: ${relativePath} — ${lineCount} lines (allowed: ${allowedLimit})`);
    violations++;
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s). Fix before merging.`);
  process.exit(1);
} else {
  console.log('✅ File size check passed.');
  process.exit(0);
}
