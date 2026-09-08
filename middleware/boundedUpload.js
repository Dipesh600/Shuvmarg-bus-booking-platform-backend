'use strict';
const Busboy = require('busboy');
const crypto = require('crypto');
const MAX_REQUEST_BYTES = 21 * 1024 * 1024;
const limits = { fileSize: 20 * 1024 * 1024, files: 4, fields: 32, parts: 36, fieldSize: 16 * 1024 };
const add = (object, key, value) => {
  if (object[key] === undefined) object[key] = value;
  else object[key] = [].concat(object[key], value);
};
const unsafeKey = key => /[.$]/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key);

function createBoundedUpload({ timeoutMs = 30_000 } = {}) {
  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
      return res.status(413).json({ success: false, message: 'Complete upload must be 21 MB or smaller.' });
    }
    let parser;
    try { parser = Busboy({ headers: req.headers, limits }); }
    catch { return res.status(400).json({ success: false, message: 'Invalid multipart upload.' }); }
    let received = 0;
    let finished = false;
    const body = Object.create(null);
    const files = Object.create(null);
    const clean = () => { clearTimeout(timer); req.removeListener('data', count); };
    const fail = (status = 413, message = 'Upload exceeds the allowed size or part count.') => {
      if (finished) return;
      finished = true; clean(); req.unpipe(parser);
      // Send a controlled response, then stop reading an unbounded request.
      res.once('finish', () => req.destroy());
      if (!res.headersSent) res.status(status).json({ success: false, message });
      parser.destroy();
    };
    const count = chunk => {
      received += chunk.length;
      if (received > MAX_REQUEST_BYTES) fail();
    };
    const timer = setTimeout(() => fail(408, 'Upload timed out.'), timeoutMs);
    timer.unref();
    req.on('data', count);
    req.once('aborted', () => { finished = true; clean(); parser.destroy(); });
    res.once('close', clean);
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => fail());
    parser.on('field', (name, value, info) => {
      if (unsafeKey(name)) return fail(400, 'Invalid upload field.');
      if (info.nameTruncated || info.valueTruncated) return fail();
      add(body, name, value);
    });
    parser.on('file', (name, stream, info) => {
      const chunks = []; let size = 0;
      stream.on('error', () => fail(400, 'Invalid upload file.'));
      if (unsafeKey(name)) { stream.resume(); return fail(400, 'Invalid upload field.'); }
      stream.on('limit', () => fail());
      stream.on('data', chunk => { if (!finished) { chunks.push(chunk); size += chunk.length; } });
      stream.on('end', () => {
        if (finished || !info.filename) return;
        const data = Buffer.concat(chunks);
        add(files, name, { name: info.filename, data, size, encoding: info.encoding,
          mimetype: info.mimeType, truncated: false, tempFilePath: '',
          md5: crypto.createHash('md5').update(data).digest('hex') });
      });
    });
    parser.on('error', () => fail(400, 'Invalid multipart upload.'));
    parser.on('close', () => {
      if (finished) return;
      finished = true; clean(); req.body = body;
      req.files = Object.keys(files).length ? files : null;
      next();
    });
    req.pipe(parser);
  };
}
module.exports = createBoundedUpload();
module.exports.createBoundedUpload = createBoundedUpload;
module.exports.MAX_REQUEST_BYTES = MAX_REQUEST_BYTES;
