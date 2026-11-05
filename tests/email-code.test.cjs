const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');
const filename = path.resolve('src/lib/email-code.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = module.paths; mod._compile(compiled, filename);
const { verifyEmailCode, saveCodePassword, authErrorMessage, createCodeClient } = mod.exports;

const user = { id: 'invited-user', email: 'invitee@example.com' };
for (const type of ['invite', 'email', 'recovery']) {
  test(`${type}: verifies the supplied email and code before accepting identity`, async () => {
    const client = { auth: { verifyOtp: async args => {
      assert.deepEqual(args, { email: user.email, token: '012345', type });
      return { data: { user, session: {} }, error: null };
    } } };
    assert.equal(await verifyEmailCode(client, '  INVITEE@EXAMPLE.COM ', ' 012345 ', type), user.id);
  });
}
test('wrong, expired and reused codes cannot proceed to password update', async () => {
  for (const code of ['otp_expired', 'invalid_credentials']) {
    const error = { code };
    await assert.rejects(verifyEmailCode({ auth: { verifyOtp: async () => ({ data: {}, error }) } }, user.email, '000000', 'email'), e => e === error);
  }
});
test('verification rejects a missing session or another email', async () => {
  for (const data of [{ user, session: null }, { user: { ...user, email: 'admin@example.com' }, session: {} }]) {
    await assert.rejects(verifyEmailCode({ auth: { verifyOtp: async () => ({ data, error: null }) } }, user.email, '012345', 'invite'), /invalid_identity/);
  }
});
test('password cannot be changed for a different account or expired session', async () => {
  for (const current of [null, { id: 'admin', email: user.email }, { ...user, email: 'admin@example.com' }]) {
    let writes = 0;
    await assert.rejects(saveCodePassword({ auth: {
      getUser: async () => ({ data: { user: current }, error: null }),
      updateUser: async () => { writes++; return { error: null }; }
    } }, user.id, user.email, 'new-password'), /invalid_identity/);
    assert.equal(writes, 0);
  }
});
test('password update errors propagate, permitting retry without success redirect', async () => {
  const failure = { code: 'weak_password' };
  await assert.rejects(saveCodePassword({ auth: {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async () => ({ error: failure })
  } }, user.id, user.email, 'weak'), e => e === failure);
});
test('verified identity can save password', async () => {
  let writes = 0;
  await saveCodePassword({ auth: {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async args => { assert.deepEqual(args, { password: 'new-password' }); writes++; return { error: null }; }
  } }, user.id, user.email, 'new-password');
  assert.equal(writes, 1);
});
test('unconfirmed accounts, invalid credentials and throttling have distinct messages', () => {
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }, 'login'), /nog niet geactiveerd/);
  assert.match(authErrorMessage({ code: 'invalid_credentials' }, 'login'), /wachtwoord klopt niet/);
  assert.match(authErrorMessage({ status: 429 }, 'verify'), /Te veel pogingen/);
  assert.match(authErrorMessage({}, 'login'), /lukt nu niet/);
});
test('activation client starts without any existing portal session', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
  const client = createCodeClient();
  const { data } = await client.auth.getSession();
  assert.equal(data.session, null);
  assert.equal(client.auth.persistSession, false);
  assert.equal(client.auth.detectSessionInUrl, false);
  assert.equal(client.auth.autoRefreshToken, false);
});
