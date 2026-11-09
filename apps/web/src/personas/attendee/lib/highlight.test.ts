import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHighlight, stripHighlight } from './highlight';

test('parseHighlight splits <em> markers into hit parts', () => {
  const parts = parseHighlight('Securing <em>eBPF</em> programs in <em>production</em>');
  assert.deepEqual(parts, [
    { text: 'Securing ', hit: false },
    { text: 'eBPF', hit: true },
    { text: ' programs in ', hit: false },
    { text: 'production', hit: true },
  ]);
});

test('parseHighlight never passes other HTML through', () => {
  const parts = parseHighlight('<script>x</script> plain <em>hit</em>');
  assert.ok(parts.every((p) => !p.text.includes('<')));
  assert.equal(stripHighlight('a <em>b</em> c'), 'a b c');
});
