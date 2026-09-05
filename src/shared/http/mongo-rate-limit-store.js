'use strict';
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String, namespace: { type: String, index: true },
  totalHits: Number, resetTime: { type: Date, index: { expires: 0 } },
}, { versionKey: false });
const Counter = mongoose.models.ApiRateLimit || mongoose.model('ApiRateLimit', schema);

class MongoRateLimitStore {
  constructor(namespace, { model = Counter, now = () => new Date() } = {}) {
    this.namespace = namespace;
    this.prefix = namespace;
    this.model = model;
    this.now = now;
    this.localKeys = false;
  }
  init({ windowMs }) { this.windowMs = windowMs; }
  id(key) { return `${this.namespace}:${crypto.createHash('sha256').update(String(key)).digest('hex')}`; }
  async increment(key) {
    const now = this.now();
    const active = { $gt: ['$resetTime', now] };
    const update = [{ $set: { namespace: this.namespace,
      totalHits: { $cond: [active, { $add: ['$totalHits', 1] }, 1] },
      resetTime: { $cond: [active, '$resetTime', new Date(now.getTime() + this.windowMs)] },
    } }];
    const filter = { _id: this.id(key) };
    let record;
    try { record = await this.model.findOneAndUpdate(filter, update, { upsert: true, new: true }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      record = await this.model.findOneAndUpdate(filter, update, { new: true });
    }
    if (!record) throw new Error('Rate-limit counter unavailable');
    return { totalHits: record.totalHits, resetTime: record.resetTime };
  }
  async decrement(key) { await this.model.updateOne({ _id: this.id(key), totalHits: { $gt: 0 } }, { $inc: { totalHits: -1 } }); }
  async resetKey(key) { await this.model.deleteOne({ _id: this.id(key) }); }
  async resetAll() { await this.model.deleteMany({ namespace: this.namespace }); }
}
const createRateLimitStore = namespace => process.env.NODE_ENV === 'test'
  ? new (require('express-rate-limit').MemoryStore)() : new MongoRateLimitStore(namespace);
module.exports = { MongoRateLimitStore, createRateLimitStore, Counter };
