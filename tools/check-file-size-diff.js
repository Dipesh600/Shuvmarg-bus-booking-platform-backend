'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_LIMIT = 150;
const EXCLUDED_DIRS = ['node_modules', 'coverage', 'dist', 'build', '.git'];
const JS_EXTENSIONS = ['.js', '.cjs', '.mjs'];

const countLines = (content) => (content.match(/\n/g) || []).length;
const toForwardSlashes = (p) => (path.sep === '\\' ? p.split(path.sep).join('/') : p);

function isSupportedJsFile(filePath) {
  const norm = toForwardSlashes(filePath);
  return !norm.split('/').some((part) => EXCLUDED_DIRS.includes(part)) && JS_EXTENSIONS.includes(path.extname(norm));
}

function parseDiffEntries(rawDiff) {
  const tokens = rawDiff.split('\0');
  if (tokens.length > 0 && tokens[tokens.length - 1] === '') tokens.pop();

  const entries = [];
  let idx = 0;

  while (idx < tokens.length) {
    const status = tokens[idx++];
    if (!status || typeof status !== 'string' || status.length === 0) {
      console.error('Error: Malformed diff output.');
      process.exit(1);
    }

    const isRename = status === 'R100' || (/^R0*([0-9]{1,2})$/.test(status) && parseInt(status.slice(1), 10) <= 99);
    const isNormal = status === 'A' || status === 'M' || status === 'D';

    if (!isNormal && !isRename) {
      console.error(`Error: Unknown diff status "${status}".`);
      process.exit(1);
    }

    if (isRename) {
      if (idx + 1 >= tokens.length) { console.error(`Error: Malformed diff output for status "${status}".`); process.exit(1); }
      const oldPath = tokens[idx++];
      const newPath = tokens[idx++];
      if (!oldPath || !newPath) { console.error(`Error: Malformed diff output for status "${status}".`); process.exit(1); }
      entries.push({ status: 'R', oldPath, newPath });
    } else {
      if (idx >= tokens.length) { console.error(`Error: Malformed diff output for status "${status}".`); process.exit(1); }
      const newPath = tokens[idx++];
      if (!newPath) { console.error(`Error: Malformed diff output for status "${status}".`); process.exit(1); }
      entries.push({ status, newPath });
    }
  }

  return entries;
}

function checkIncrementalFileSizes() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('Error: Base Git reference argument is required.');
    process.exit(1);
  }

  const projectRoot = process.cwd();

  try {
    execFileSync('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (err) {
    console.error(`Error: Base Git reference "${baseRef}" could not be resolved.`);
    process.exit(1);
  }

  let rawDiff;
  try {
    rawDiff = execFileSync('git', ['diff', '--name-status', '-z', '-M', `${baseRef}...HEAD`], { cwd: projectRoot, encoding: 'utf8' });
  } catch (err) {
    console.error(`Error: Failed to inspect changes from "${baseRef}" to HEAD.`);
    process.exit(1);
  }

  const entries = parseDiffEntries(rawDiff);
  let violations = 0;

  for (const entry of entries) {
    if (entry.status === 'D' || !isSupportedJsFile(entry.newPath)) continue;

    const normNewPath = toForwardSlashes(entry.newPath);
    const diskPath = path.join(projectRoot, normNewPath);

    let stat;
    try {
      stat = fs.lstatSync(diskPath);
    } catch (err) {
      console.error(`Error: Changed file "${normNewPath}" is missing from the working tree.`);
      process.exit(1);
    }

    if (!stat.isFile()) {
      console.error(`Error: Changed file "${normNewPath}" is not a regular file in the working tree.`);
      process.exit(1);
    }

    const headLines = countLines(fs.readFileSync(diskPath, 'utf8'));

    if (entry.status === 'A') {
      if (headLines > DEFAULT_LIMIT) {
        console.error(`FAIL: ${normNewPath} — ${headLines} lines (new file allowed: 150)`);
        violations++;
      }
    } else {
      const normBasePath = toForwardSlashes(entry.oldPath || entry.newPath);
      let baseContent;
      try {
        baseContent = execFileSync('git', ['show', `${baseRef}:${normBasePath}`], { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      } catch (err) {
        console.error(`Error: Could not read base content for "${normBasePath}" from "${baseRef}".`);
        process.exit(1);
      }

      const baseLines = countLines(baseContent);
      const allowedLimit = Math.max(DEFAULT_LIMIT, baseLines);

      if (headLines > allowedLimit) {
        console.error(`FAIL: ${normNewPath} — ${headLines} lines (base: ${baseLines}, allowed: ${allowedLimit})`);
        violations++;
      }
    }
  }

  if (violations > 0) {
    console.error(`\n${violations} incremental file-size regression(s). Fix before merging.`);
    process.exit(1);
  } else {
    console.log('✅ Incremental file size check passed.');
    process.exit(0);
  }
}

if (require.main === module) checkIncrementalFileSizes();

module.exports = { countLines, isSupportedJsFile, parseDiffEntries, checkIncrementalFileSizes };
