import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpsSnapshot } from '@lanyard/contracts';
import { RoomCard, roomHealth } from './RoomCard';
import { safeOpsLink } from './links';

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
});
