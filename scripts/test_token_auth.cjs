const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

function setup(storedUser) {
  let registered;
  let stored = storedUser && JSON.stringify(storedUser);
  const events = [];
  const backend = {
    async authenticate({token}) {
      this.token = token;
      if (token === 'invalid') throw new Error('Unauthorized');
      return {token, login: 'editor', name: 'Editor'};
    },
    getToken() {return this.token;},
    persistEntry() {return 'commit';}
  };
  const context = vm.createContext({
    window: {
      CMS: {
        getBackend: () => ({init: () => backend}),
        registerBackend: (name, constructor) => {registered = {name, constructor};}
      },
      h: () => null,
      createClass: specification => specification
    },
    localStorage: {
      getItem: () => stored || null,
      removeItem: () => {stored = null;}
    },
    document: {dispatchEvent: event => events.push(event.type)},
    Event
  });
  vm.runInContext(readFileSync(join(__dirname, '../admin/token-auth.js'), 'utf8'), context);
  vm.runInContext('registerTokenBackend()', context);
  return {backend: new registered.constructor(), name: registered.name, stored: () => stored, events};
}

test('token is available to GitHub API but excluded from persisted profile', async () => {
  const {backend, name} = setup();
  assert.equal(name, 'github-token');
  const user = await backend.authenticate({token: 'test-secret'});
  assert.equal(backend.getToken(), 'test-secret');
  assert.equal(JSON.stringify(user).includes('test-secret'), false);
  assert.equal(Object.hasOwn(user, 'token'), false);
  assert.equal(user.login, 'editor');
  assert.equal(backend.persistEntry(), 'commit');
});

test('reload clears token-login metadata, requiring a fresh login', () => {
  const {stored} = setup({backendName: 'github-token', login: 'editor'});
  assert.equal(stored(), null);
});

test('unrelated backend sessions are not removed', () => {
  const {stored} = setup({backendName: 'github', login: 'other'});
  assert.equal(JSON.parse(stored()).backendName, 'github');
});

test('authentication failures notify the login form and remain rejected', async () => {
  const {backend, events} = setup();
  await assert.rejects(() => backend.authenticate({token: 'invalid'}), /Unauthorized/);
  assert.deepEqual(events, ['receptes-auth-error']);
});
