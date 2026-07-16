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

/**
 * Count lines in a compatible way with the wc-style baseline.
 * wc -l counts newline characters, so a file with no trailing newline
 * reports one fewer line than the physical line count.
 * The baseline was captured with wc -l, so we match that: count '\n' chars.
 * A file that has content on the last line but no trailing '\n' still has
 * that physical line — it is NOT counted by wc -l.  We preserve that
 * behaviour here so counts stay compatible with the baseline JSON.
 */
function countLines(content) {
  return (content.match(/\n/g) || []).length;
}

/**
 * Normalise an OS path to forward slashes so baseline keys are
 * platform-independent (the baseline was recorded on POSIX).
 */
function toForwardSlashes(p) {
  return path.sep === '\\' ? p.split(path.sep).join('/') : p;
}

let violations = 0;
const projectRoot = path.join(__dirname, '..');
const allFiles = getFiles(projectRoot);

for (const file of allFiles) {
  const relativePath = toForwardSlashes(path.relative(projectRoot, file));
  const content = fs.readFileSync(file, 'utf8');
  const lineCount = countLines(content);

  const allowedLimit = baseline[relativePath] !== undefined
    ? baseline[relativePath]
    : DEFAULT_LIMIT;

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
