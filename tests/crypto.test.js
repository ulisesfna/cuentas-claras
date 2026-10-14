import { describe, test, assert } from './harness.js';
import { hashPin, isEnvelope, newVault, openEnvelope, seal } from '../js/core/crypto.js';

describe('Cifrado', () => {
  test('cifrar y descifrar con la contraseña correcta', async () => {
    const v = await newVault('una contraseña larga', 'password', 10000);
    const env = await seal(v, { hola: 'mundo', n: 1 });
    assert.ok(isEnvelope(env));
    assert.ok(!env.data.includes('mundo'));
    const r = await openEnvelope(env, 'una contraseña larga');
    assert.deepEqual(r.obj, { hola: 'mundo', n: 1 });
    assert.equal(r.vault.lock, 'password');
  });
  test('cada cifrado usa un IV distinto', async () => {
    const v = await newVault('x', 'pin', 10000);
    const a = await seal(v, { a: 1 }), b = await seal(v, { a: 1 });
    assert.ok(a.iv !== b.iv && a.data !== b.data);
  });
  test('la contraseña incorrecta o los datos alterados se rechazan', async () => {
    const v = await newVault('1234', 'pin', 10000);
    const env = await seal(v, { a: 1 });
    await assert.rejects(() => openEnvelope(env, '1235'));
    const tampered = { ...env, data: env.data.slice(0, -4) + (env.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await assert.rejects(() => openEnvelope(tampered, '1234'));
  });
  test('parámetros de derivación absurdos se rechazan', async () => {
    const v = await newVault('1234', 'pin', 10000);
    const env = await seal(v, {});
    await assert.rejects(() => openEnvelope({ ...env, kdf: { ...env.kdf, iter: 1 } }, '1234'));
  });
  test('el hash del bloqueo sin cifrado es estable', () => {
    assert.equal(hashPin('1234'), hashPin('1234'));
    assert.ok(hashPin('1234') !== hashPin('1235'));
  });
});
