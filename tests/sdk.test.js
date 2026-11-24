import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngageKit } from '../src/index.js';

test('track queues event and creates IDs',()=>{const s=createEngageKit();const e=s.track('view');assert.equal(e.name,'view');assert.equal(s.queue.length,1);assert.ok(e.id);});
test('identify associates user and traits',()=>{const s=createEngageKit();s.identify('u1',{plan:'free'});const e=s.track('login');assert.equal(e.userId,'u1');assert.equal(e.userTraits.plan,'free');});
test('flush sends queued batch and clears queue only after success',async()=>{let captured;const s=createEngageKit({adapter:{send:async batch=>{captured=batch;}}});s.track('test');const result=await s.flush();assert.equal(result.sent,1);assert.equal(captured.length,1);assert.equal(s.queue.length,0);});
test('failed flush keeps events queued',async()=>{const s=createEngageKit({adapter:{send:async()=>{throw Error('network');}}});s.track('event');await assert.rejects(s.flush(),/network/);assert.equal(s.queue.length,1);});
test('queue maximum discards oldest event',()=>{const s=createEngageKit({maxQueue:2});s.track('one');s.track('two');s.track('three');assert.deepEqual(s.queue.map(e=>e.name),['two','three']);});
test('event listener receives event and can unsubscribe',()=>{const s=createEngageKit();let count=0;const off=s.on('event',()=>count++);s.track('a');off();s.track('b');assert.equal(count,1);});
test('rule action runs for matching event',async()=>{const s=createEngageKit();let hits=0;s.addRule({id:'r1',event:'click',action:()=>hits++});s.track('other');s.track('click');await new Promise(r=>setImmediate(r));assert.equal(hits,1);});
test('invalid track and identify inputs throw',()=>{const s=createEngageKit();assert.throws(()=>s.track(''),/Invalid event name/);assert.throws(()=>s.identify(''),/userId/);assert.throws(()=>s.track('ok',[]),/properties/);});
test('shutdown prevents tracking',()=>{const s=createEngageKit();s.shutdown();assert.throws(()=>s.track('event'),/shut down/);});
