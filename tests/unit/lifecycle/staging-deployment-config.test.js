'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('staging Caddy receives only its required public domain', () => {
  const compose = read('deploy/staging/docker-compose.yml');
  const caddy = compose.slice(
    compose.indexOf('  caddy:'),
    compose.indexOf('\n# ── Networks'),
  );

  assert.match(
    caddy,
    /STAGING_API_DOMAIN: "\$\{STAGING_API_DOMAIN:\?[^"]+\}"/,
  );
  assert.doesNotMatch(caddy, /\n\s+env_file:/);
});

test('staging Caddyfile uses the supplied domain', () => {
  const caddyfile = read('deploy/staging/Caddyfile');

  assert.match(caddyfile, /\{\$STAGING_API_DOMAIN\}\s*\{/);
});

test('deployment validates the proxy and syncs versioned files before SSH', () => {
  const workflow = read('.github/workflows/deploy-staging.yml');
  const syncPosition = workflow.indexOf(
    'Sync versioned deployment files to Oracle VM',
  );
  const deployPosition = workflow.indexOf(
    'SSH — invoke deploy script with immutable SHA image',
  );

  assert.match(workflow, /Validate staging proxy configuration/);
  assert.match(
    workflow,
    /cp deploy\/staging\/\.env\.example deploy\/staging\/\.env/,
  );
  assert.match(workflow, /appleboy\/scp-action@v1/);
  assert.match(workflow, /deploy\/staging\/docker-compose\.yml/);
  assert.match(workflow, /deploy\/staging\/Caddyfile/);
  assert.match(workflow, /deploy\/staging\/deploy\.sh/);
  assert.ok(syncPosition > -1);
  assert.ok(deployPosition > syncPosition);
});
