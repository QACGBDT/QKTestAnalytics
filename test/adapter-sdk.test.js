import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORTER_EVENT_VERSION,
  ReporterEventType,
  ReporterRuntime,
  assertReporterAdapter
} from '../src/index.js';

test('runtime emits versioned ordered events to object and function sinks', async () => {
  const received = [];
  const runtime = new ReporterRuntime({
    source: 'fixture',
    clock: () => '2026-01-01T00:00:00.000Z',
    sinks: [{ handle: event => received.push(['object', event]) }]
  });
  runtime.use(event => received.push(['function', event]));

  const event = await runtime.emit(ReporterEventType.RUN_START, { projectName: 'demo' });

  assert.equal(event.version, REPORTER_EVENT_VERSION);
  assert.equal(event.sequence, 1);
  assert.equal(event.source, 'fixture');
  assert.equal(event.timestamp, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(event.payload, { projectName: 'demo' });
  assert.equal(received.length, 2);
  assert.equal(received[0][1], event);
  assert.equal(received[1][1], event);

  const second = await runtime.emit(ReporterEventType.RUN_END, {});
  assert.equal(second.sequence, 2);
});

test('runtime rejects invalid sinks, types, payloads and clocks', async () => {
  assert.throws(() => new ReporterRuntime({ sinks: [{}] }), /reporter sink/);
  const runtime = new ReporterRuntime();
  assert.throws(() => runtime.use(null), /reporter sink/);
  await assert.rejects(() => runtime.emit('other', {}), /unsupported reporter event/);
  await assert.rejects(() => runtime.emit(ReporterEventType.RUN_START, []), /payload must be an object/);
  const invalidClock = new ReporterRuntime({ clock: () => 'not-a-date' });
  await assert.rejects(() => invalidClock.emit(ReporterEventType.RUN_START), /invalid date/);
});

test('runtime propagates sink failures', async () => {
  const runtime = new ReporterRuntime({ sinks: [() => { throw new Error('sink failed'); }] });
  await assert.rejects(() => runtime.emit(ReporterEventType.RUN_START), /sink failed/);
});

test('adapter assertion documents the minimum public adapter contract', () => {
  const adapter = { name: 'fixture', hooks: {} };
  assert.equal(assertReporterAdapter(adapter), adapter);
  assert.throws(() => assertReporterAdapter(null), /adapter must be an object/);
  assert.throws(() => assertReporterAdapter({ hooks: {} }), /adapter.name/);
  assert.throws(() => assertReporterAdapter({ name: 'x' }), /adapter.hooks/);
});
