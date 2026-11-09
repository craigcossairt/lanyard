import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateChunks } from './index';

test('translate smoke validates JSON output shape', async () => {
  const store = new Map<string, string>();
  const kv = {
    pipeline() {
      const cmds: Array<{ op: string; key: string; val?: string; ttl?: number }> = [];
      const p = {
        get(key: string) {
          cmds.push({ op: 'get', key });
          return p;
        },
        setex(key: string, ttl: number, val: string) {
          cmds.push({ op: 'setex', key, val, ttl });
          return p;
        },
        async exec() {
          return cmds.map((c) => {
            if (c.op === 'get') return [null, store.get(c.key) ?? null];
            if (c.op === 'setex') {
              store.set(c.key, c.val!);
              return [null, 'OK'];
            }
            return [null, null];
          });
        },
      };
      return p;
    },
  };
  let called = false;
  const generate = async () => {
    called = true;
    return {
      text: '{"translations":[{"chunkId":"s1:1","text":"Hola"}]}',
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    };
  };
  const res = await translateChunks(
  {
    eventId: 'cnh-demos',
    lang: 'es',
    chunks: [{ chunkId: 's1:1', seq: 1, text: 'Hello' }],
  },
  { kv: kv as never },
  generate,
  );
  assert.equal(called, true);
  assert.equal(res.written, 1);
  assert.equal(store.get('tr:s1:1:es'), 'Hola');
});
