import assert from 'node:assert/strict';
import { test } from 'node:test';
import { es, en } from './messages';
import {
  formatMessage,
  readLocale,
  readLocaleSnapshot,
  setCaptionTranslator,
  toUiLocale,
  translate,
  translateCaption,
  writeLocale,
} from './locale';

test('spanish covers every english string', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    assert.equal(es[key].length > 0, true);
    assert.equal(en[key].includes('{'), es[key].includes('{'));
  }
});

test('formatMessage fills placeholders and leaves unknown ones empty', () => {
  assert.equal(formatMessage('Hi {name}', { name: 'Ada' }), 'Hi Ada');
  assert.equal(formatMessage('Hi {name}'), 'Hi {name}');
  assert.equal(translate('es', 'here', { count: 3 }), '3 aquí');
});

test('toUiLocale keeps spanish and falls back to english', () => {
  assert.equal(toUiLocale('es-MX'), 'es');
  assert.equal(toUiLocale('pt'), 'en');
  assert.equal(toUiLocale(undefined), 'en');
});

test('writeLocale keeps the choice for this visit when storage throws', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const denied: Storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: denied });
  try {
    writeLocale('es');
    assert.equal(readLocale(), 'es');
    assert.deepEqual(readLocaleSnapshot(), { ui: 'es', caption: 'es' });
    assert.equal(readLocaleSnapshot(), readLocaleSnapshot());
  } finally {
    const memory = new Map<string, string>();
    const writable: Storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: writable });
    writeLocale('en');
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
  }
});

test('translateCaption waits for a registered translator and keeps the original language', () => {
  assert.equal(translateCaption('hola', 'es', 'en'), 'hola');
  setCaptionTranslator(({ text, to }) => `${text} (${to})`);
  assert.equal(translateCaption('hola', 'es', 'en'), 'hola (en)');
  assert.equal(translateCaption('hola', 'es-MX', 'es'), 'hola');
  setCaptionTranslator(() => '   ');
  assert.equal(translateCaption('hola', 'es', 'en'), 'hola');
  setCaptionTranslator(null);
});
