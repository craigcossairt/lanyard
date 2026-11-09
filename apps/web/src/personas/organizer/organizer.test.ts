import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpsSnapshot } from '@lanyard/contracts';
import { RoomCard, roomHealth } from './RoomCard';
import { DEFAULT_LINKS, readOpsLinks, safeOpsLink } from './links';
import { SimulationNotice } from './SimulationControls';

test('organizer room exposes health, occupancy and stale state without relying on color', () => {
  const status: OpsSnapshot['rooms'][number] = {
    room: {
      id: 'main',
      eventId: 'demo',
      name: 'Main Stage',
      capacity: 30,
      floor: 1,
      x: 0,
      y: 0,
      accessibility: { stepFree: true, hearingLoop: false, quiet: false },
    },
    occupancy: 27,
    ratio: 0.9,
    signals: { lost: 5 },
    questionCount: 4,
  };
  const html = renderToStaticMarkup(
    createElement(RoomCard, { status, timezone: 'America/Denver', stale: true }),
  );
  assert.match(html, /Last known: Overflow risk/);
  assert.match(html, /aria-label="Main Stage occupancy"/);
  assert.match(html, /90% occupied/);
  assert.match(html, /Questions/);
  assert.equal(roomHealth({ ...status, ratio: 0.5 }).kind, 'warn');
  assert.equal(roomHealth({ ...status, ratio: 0.5, signals: {} }).kind, 'ok');
  assert.equal(safeOpsLink('javascript:alert(1)'), '');
  assert.equal(safeOpsLink('https://name:password@example.com'), '');
  assert.equal(
    safeOpsLink('https://app.dash0.com/dashboards/conference'),
    'https://app.dash0.com/dashboards/conference',
  );
  const simulation = renderToStaticMarkup(createElement(SimulationNotice, {
    status: { simulated: true, mode: 'demo', running: true, stopping: false, attendees: 40, endsAt: '2026-11-09T21:00:00Z' },
    timezone: 'America/Denver',
  }));
  assert.match(simulation, /SIMULATED/);
  assert.match(simulation, /Demo scenario/);
  assert.match(simulation, /40 virtual attendees/);
  assert.match(simulation, /auto-stop 2:00 PM/);
  assert.match(simulation, /Virtual activity is included/);
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => JSON.stringify({ dashboard: '', slo: 'https://example.com/custom-slo', agent0: '   ' }),
    } });
    assert.deepEqual(readOpsLinks(), { ...DEFAULT_LINKS, slo: 'https://example.com/custom-slo' });
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
