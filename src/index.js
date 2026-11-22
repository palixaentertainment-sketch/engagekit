import { randomUUID } from 'node:crypto';
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export class EngageKit {
  constructor(options = {}) {
    const maxQueue = options.maxQueue ?? 1000;
    if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new TypeError('maxQueue must be a positive integer');
    this.options = { appId: options.appId ?? 'local', maxQueue, clock: options.clock ?? (() => new Date()), adapter: options.adapter ?? null };
    this.anonymousId = 'anon_' + randomUUID(); this.userId = null; this.userTraits = {};
    this.queue = []; this.rules = new Map(); this.listeners = new Map(); this.closed = false;
  }
  identify(userId, traits = {}) {
    this.#assertOpen();
    if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('identify(userId): userId must be a non-empty string');
    if (!isPlainObject(traits)) throw new TypeError('identify(userId, traits): traits must be an object');
    this.userId = userId; this.userTraits = { ...traits }; return this;
  }
  track(eventName, properties = {}) {
    this.#assertOpen();
    if (typeof eventName !== 'string' || !eventName.trim() || RESERVED.has(eventName)) throw new TypeError('track(eventName): provide a valid event name');
    if (!isPlainObject(properties)) throw new TypeError('track(eventName, properties): properties must be an object');
    const event = Object.freeze({ id: randomUUID(), appId: this.options.appId, name: eventName, userId: this.userId, anonymousId: this.userId ? null : this.anonymousId, properties: Object.freeze({ ...properties }), userTraits: Object.freeze({ ...this.userTraits }), timestamp: this.options.clock().toISOString() });
    if (this.queue.length >= this.options.maxQueue) this.queue.shift();
    this.queue.push(event); this.#emit('event', event); this.#evaluate(event); return event;
  }
  on(eventName, listener) {
    this.#assertOpen(); if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set()); this.listeners.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }
  off(eventName, listener) { this.listeners.get(eventName)?.delete(listener); return this; }
  addRule(rule) {
    this.#assertOpen(); if (!rule || typeof rule.id !== 'string' || !rule.id.trim()) throw new TypeError('Rule needs a unique string id');
    if (typeof rule.event !== 'string' || !rule.event.trim()) throw new TypeError('Rule needs an event name');
    if (typeof rule.action !== 'function') throw new TypeTypeError('Rule needs an action callback');
    this.rules.set(rule.id, { ...rule, enabled: rule.enabled !== false }); return this;
  }
  removeRule(id) { this.rules.delete(id); return this; }
  async flush() {
    this.#assertOpen();
    if (!this.options.adapter || typeof this.options.adapter.send !== 'function') return { sent: 0, remaining: this.queue.length, reason: 'No adapter configured' };
    const batch = this.queue.slice(); if (!batch.length) return { sent: 0, remaining: 0 };
    await this.options.adapter.send(batch); this.queue.splice(0, batch.length); return { sent: batch.length, remaining: this.queue.length };
  }
  async #evaluate(event) {
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.event !== event.name) continue;
      try { if (typeof rule.when === 'function' && !(await rule.when(event))) continue; await rule.action(event, this); this.#emit('rule:triggered', { ruleId: rule.id, event }); }
      catch (error) { this.#emit('rule:error', { ruleId: rule.id, event, error }); }
    }
  }
  #emit(name, payload) { for (const cb of this.listeners.get(name) ?? []) { try { cb(payload); } catch {} } }
  #assertOpen() { if (this.closed) throw new Error('EngageKit instance has been shut down'); }
  shutdown() { this.closed = true; this.listeners.clear(); this.rules.clear(); return this; }
}
export function createEngageKit(options) { return new EngageKit(options); }
