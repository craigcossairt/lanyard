import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Meter } from './Meter';

test('Meter clamps aria-valuenow when occupancy is over capacity', () => {
  const html = renderToStaticMarkup(
    createElement(Meter, { label: 'Occupancy', value: 34, max: 30, valueText: '34 / 30' }),
  );
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="30"/);
  assert.match(html, /aria-valuenow="30"/);
  assert.doesNotMatch(html, /aria-valuenow="34"/);
  assert.match(html, /aria-valuetext="34 \/ 30, over capacity"/);
  assert.match(html, />34 \/ 30, over capacity</);
});

test('Meter leaves an in-range value and its text alone', () => {
  const html = renderToStaticMarkup(
    createElement(Meter, { label: 'Occupancy', value: 12, max: 30, valueText: '12 / 30' }),
  );
  assert.match(html, /aria-valuenow="12"/);
  assert.match(html, /aria-valuetext="12 \/ 30"/);
  assert.doesNotMatch(html, /over capacity/);
});

test('Meter clamps aria-valuenow up to the minimum', () => {
  const html = renderToStaticMarkup(
    createElement(Meter, { label: 'Occupancy', value: -4, max: 30, valueText: '-4 / 30' }),
  );
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /aria-valuetext="-4 \/ 30"/);
  assert.doesNotMatch(html, /over capacity/);
});
