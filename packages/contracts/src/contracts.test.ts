import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  channelKind,
  channels,
  eventDate,
  formatTime,
  METRICS,
  RealtimeMessage,
  realtime,
  Session,
} from './index';

test('realtime messages round-trip through the schema', () => {
  const m = realtime('attendance.updated', {
    sessionId: 's1',
    roomId: 'r1',
    count: 31,
    capacity: 30,
  });
  assert.equal(RealtimeMessage.parse(JSON.parse(JSON.stringify(m))).type, 'attendance.updated');
  assert.equal(channelKind(channels.user('a1')), 'user');
});

test('session schema uses camelCase fields', () => {
  const ok = Session.safeParse({
    id: 's1',
    eventId: 'cnh-demos',
    roomId: 'main-stage',
    title: 't',
    abstract: '',
    track: 'GitOps',
    level: 'beginner',
    tags: [],
    speakerIds: [],
    speakerNames: [],
    startsAt: '2026-11-09T23:30:00Z',
    endsAt: '2026-11-10T00:00:00Z',
    status: 'scheduled',
  });
  assert.ok(ok.success);
});

test('time helper renders in the event timezone', () => {
  // 23:30 UTC on Nov 9 is 4:30 PM in Denver (MST, UTC-7).
  assert.equal(formatTime('2026-11-09T23:30:00Z', 'America/Denver'), '4:30 PM');
  assert.equal(eventDate('2026-11-10T02:00:00Z', 'America/Denver'), '2026-11-09');
  assert.equal(METRICS.roomOccupancy, 'conf.room.occupancy');
});
