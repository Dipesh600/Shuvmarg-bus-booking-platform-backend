'use strict';
process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const request = require('supertest');
const upload = require('../../middleware/boundedUpload');
const authorize = require('../../middleware/authorizeUpload');
const appFor = parser => {
  const app = express(); app.use(parser);
  app.post('/upload', (req, res) => res.json({ names: Object.keys(req.files || {}), body: req.body }));
  return app;
};
test('file count and field size limits reject the entire upload', async () => {
  const app = appFor(upload);
  let req = request(app).post('/upload');
  for (let i = 0; i < 5; i++) req = req.attach(`file${i}`, Buffer.from('small'), `file${i}.pdf`);
  assert.equal((await req).status, 413);
  assert.equal((await request(app).post('/upload').field('name', 'a'.repeat(17 * 1024))).status, 413);
});
test('multipart operator keys are rejected and ordinary field/file data is retained', async () => {
  const app = appFor(upload);
  assert.equal((await request(app).post('/upload').field('$where', 'attack')).status, 400);
  const response = await request(app).post('/upload').field('name', 'Test Agent').attach('file', Buffer.from('ok'), 'doc.pdf');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { names: ['file'], body: { name: 'Test Agent' } });
});
test('anonymous multipart requests are refused before buffering', async () => {
  const app = express(); let parsed = false;
  app.use(authorize, (req, res) => { parsed = true; res.sendStatus(200); });
  assert.equal((await request(app).post('/api/public/searchTrips').field('a', 'b')).status, 415);
  assert.equal((await request(app).post('/api/login').field('a', 'b')).status, 401);
  assert.equal(parsed, false);
});
async function streamUpload(app, write) {
  let sentStatus;
  const server = http.createServer((req, res) => {
    res.once('finish', () => { sentStatus = res.statusCode; });
    app(req, res);
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method: 'POST', path: '/upload',
        headers: { 'Content-Type': 'multipart/form-data; boundary=limit-test' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', error => {
        // An early rejection may close the socket while queued upload bytes are still being sent.
        // Require evidence that the server actually finished a rejection; a broken pipe alone is not success.
        if (['EPIPE', 'ECONNRESET'].includes(error.code) && [408, 413].includes(sentStatus)) resolve(sentStatus);
        else reject(error);
      });
      req.setTimeout(3000, () => req.destroy(new Error('Test request timed out')));
      write(req);
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('chunked uploads cannot bypass aggregate size limits with individually small files', async () => {
  const status = await streamUpload(appFor(upload), req => {
    for (let i = 0; i < 2; i++) {
      req.write(`--limit-test\r\nContent-Disposition: form-data; name="file${i}"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
      req.write(Buffer.alloc(11 * 1024 * 1024)); req.write('\r\n');
    }
    req.end('--limit-test--\r\n');
  });
  assert.equal(status, 413);
});
test('slow incomplete multipart requests have an absolute deadline', async () => {
  const status = await streamUpload(appFor(upload.createBoundedUpload({ timeoutMs: 30 })), req => {
    req.write('--limit-test\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\nx');
  });
  assert.equal(status, 408);
});
