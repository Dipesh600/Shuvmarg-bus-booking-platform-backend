'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const scriptPath = path.resolve(__dirname, '../../../tools/check-file-size-diff.js');

const createRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-diff-'));
  const exec = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  exec(['init']);
  exec(['config', 'user.email', 'ci-test@shuvmarg.local']);
  exec(['config', 'user.name', 'Shuvmarg CI Test']);
  return {
    dir,
    exec,
    commit: (msg) => { exec(['add', '.']); exec(['commit', '-m', msg]); return exec(['rev-parse', 'HEAD']).trim(); },
    clean: () => fs.rmSync(dir, { recursive: true, force: true }),
    run: (baseRef) => {
      try {
        const out = execFileSync('node', [scriptPath, baseRef], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
      }
    },
  };
};

test('Incremental File Size Checker Tests', async (t) => {
  const cases = [
    { name: 'Case 1: new compliant file', base: [], head: [['new.js', '\n'.repeat(150)]], code: 0, match: /Incremental file size check passed/ },
    { name: 'Case 2: new oversized file', base: [], head: [['oversized.js', '\n'.repeat(151)]], code: 1, match: /FAIL: oversized\.js — 151 lines \(new file allowed: 150\)/ },
    { name: 'Case 3: compliant legacy file remains compliant', base: [['l.js', '\n'.repeat(100)]], head: [['l.js', '\n'.repeat(150)]], code: 0 },
    { name: 'Case 4: compliant file crosses limit', base: [['l.js', '\n'.repeat(100)]], head: [['l.js', '\n'.repeat(151)]], code: 1, match: /FAIL: l\.js — 151 lines \(base: 100, allowed: 150\)/ },
    { name: 'Case 5: inherited oversized file is reduced', base: [['h.js', '\n'.repeat(300)]], head: [['h.js', '\n'.repeat(250)]], code: 0 },
    { name: 'Case 6: inherited oversized file is unchanged', base: [['h.js', '\n'.repeat(300)]], head: [['h.js', '/* touch */\n' + '\n'.repeat(299)]], code: 0 },
    { name: 'Case 7: inherited oversized file grows', base: [['h.js', '\n'.repeat(300)]], head: [['h.js', '\n'.repeat(301)]], code: 1, match: /FAIL: h\.js — 301 lines \(base: 300, allowed: 300\)/ },
    { name: 'Case 8: deleted oversized file', base: [['h.js', '\n'.repeat(300)]], head: [], del: ['h.js'], code: 0 },
    { name: 'Case 9: renamed oversized legacy file', base: [['legacy.js', '\n'.repeat(300)]], head: [], mv: [['legacy.js', 'renamed.js']], code: 0 },
    { name: 'Case 11: shell-sensitive filename', base: [], head: [['quoted"file.js', '\n'.repeat(151)]], code: 1, match: /FAIL: quoted"file\.js — 151 lines/ },
  ];

  for (const c of cases) {
    await t.test(c.name, () => {
      const r = createRepo();
      try {
        fs.writeFileSync(path.join(r.dir, 'init.js'), 'x\n');
        for (const [f, content] of c.base) fs.writeFileSync(path.join(r.dir, f), content);
        const base = r.commit('init');
        if (c.del) for (const f of c.del) r.exec(['rm', f]);
        if (c.mv) for (const [o, n] of c.mv) r.exec(['mv', o, n]);
        for (const [f, content] of c.head) fs.writeFileSync(path.join(r.dir, f), content);
        r.commit('head');
        const res = r.run(base);
        assert.equal(res.code, c.code);
        if (c.match) assert.match(res.out, c.match);
      } finally { r.clean(); }
    });
  }

  await t.test('Case 10: unresolved base reference', () => {
    const r = createRepo();
    try {
      const res = r.run('does-not-exist');
      assert.equal(res.code, 1);
      assert.match(res.out, /Base Git reference "does-not-exist" could not be resolved/);
    } finally { r.clean(); }
  });

  await t.test('Case 12: reject symlink destination', () => {
    const r = createRepo();
    try {
      fs.writeFileSync(path.join(r.dir, 'target.txt'), 'target');
      const base = r.commit('init');
      fs.symlinkSync('target.txt', path.join(r.dir, 'linked.js'));
      r.commit('add symlink');
      const res = r.run(base);
      assert.equal(res.code, 1);
      assert.match(res.out, /Changed file "linked\.js" is not a regular file/);
    } finally { r.clean(); }
  });

  await t.test('Case 13: diff parser strictness (copy status, bad renames, empty paths)', () => {
    const badCases = [
      { input: 'C100\0old.js\0new.js\0', match: /Unknown diff status "C100"/ },
      { input: 'R\0old.js\0new.js\0', match: /Unknown diff status "R"/ },
      { input: 'Rabc\0old.js\0new.js\0', match: /Unknown diff status "Rabc"/ },
      { input: 'R101\0old.js\0new.js\0', match: /Unknown diff status "R101"/ },
      { input: 'M\0\0', match: /Malformed diff output/ },
    ];
    for (const b of badCases) {
      try {
        execFileSync('node', ['-e', `require(${JSON.stringify(scriptPath)}).parseDiffEntries(${JSON.stringify(b.input)})`], { encoding: 'utf8', stdio: 'pipe' });
        assert.fail(`Should have thrown for ${b.input}`);
      } catch (e) {
        assert.equal(e.status, 1);
        assert.match((e.stderr || '') + (e.stdout || ''), b.match);
      }
    }
  });
});
