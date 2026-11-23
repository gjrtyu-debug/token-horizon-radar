// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [, , chrome, outputDirectory] = process.argv;
if (!chrome || !outputDirectory) {
  console.error('Usage: node tests/browser_check.mjs <Chrome executable> <generated output directory>');
  process.exit(2);
}

const board = JSON.parse(await readFile(join(outputDirectory, 'board.json'), 'utf8'));
const url = pathToFileURL(resolve(outputDirectory, 'dashboard', 'index.html')).href;
const profile = await mkdtemp(join(tmpdir(), 'token-horizon-browser-'));
const browser = spawn(chrome, [
  '--headless',
  '--no-first-run',
  '--disable-background-networking',
  '--remote-debugging-port=0',
  '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });
const browserError = new Promise((_, reject) => browser.once('error', reject));
let connection;

async function expectEventually(read, expected) {
  for (let attempts = 0; attempts < 70; attempts++) {
    const actual = await read();
    if (actual === expected) return;
    await pause(100);
  }
  assert.equal(await read(), expected);
}

async function debuggingPort() {
  for (let attempts = 0; attempts < 70; attempts++) {
    try {
      const info = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      return Number(info.split('\n', 1)[0]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await pause(100);
    }
  }
  throw new Error('Chrome did not supply its local debugging port');
}

async function run() {
  const port = await debuggingPort();
  const response = await fetch('http://127.0.0.1:' + port + '/json/list');
  assert(response.ok, 'Could not enumerate Chrome pages');
  const pages = await response.json();
  const page = pages.find(candidate => candidate.type === 'page');
  assert(page, 'Expected a Chrome page');
  connection = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ready, failed) => {
    connection.addEventListener('open', ready, { once: true });
    connection.addEventListener('error', failed, { once: true });
  });

  const requests = new Map();
  const errors = [];
  let messageId = 0;
  connection.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.text);
    }
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.fulfill(message.result);
  });

  function call(method, params = {}) {
    return new Promise((fulfill, reject) => {
      const id = ++messageId;
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(new Error('Chrome command timed out: ' + method));
      }, 5000);
      requests.set(id, { fulfill, reject, timer });
      connection.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
    return result.result.value;
  }

  await call('Runtime.enable');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await call('Page.navigate', { url });
  const readCount = () => evaluate("Number(document.querySelector('#count')?.textContent)");
  await expectEventually(readCount, board.rows.length);
  const firstSlug = () => evaluate("document.querySelector('tr[data-slug]')?.dataset.slug");
  assert.equal(await firstSlug(), board.rows[0].slug);

  await evaluate("document.querySelector('[aria-label=\"Next protocol page\"]').click()");
  assert.equal(await firstSlug(), board.rows[40].slug);
  await evaluate("document.querySelector('[aria-label=\"Previous protocol page\"]').click()");
  assert.equal(await firstSlug(), board.rows[0].slug);

  await evaluate("document.querySelector('tr[data-slug] button').click()");
  const detailIsOpen = () => evaluate("document.querySelector('#detail').classList.contains('open')");
  await expectEventually(detailIsOpen, true);
  assert.equal(await evaluate("document.querySelectorAll('.steps li').length"), board.rows[0].farm_steps.length);
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))");
  assert.equal(await detailIsOpen(), false);
  assert.equal(await evaluate("document.activeElement.closest('tr').dataset.slug"), board.rows[0].slug);

  const knownSlug = board.rows.at(-1).slug;
  await call('Page.navigate', { url: url + '#' + encodeURIComponent(knownSlug) });
  const detailName = () => evaluate("document.querySelector('#detail-body h2')?.textContent");
  await expectEventually(detailName, board.rows.at(-1).name);
  await evaluate("document.querySelector('#close').click()");
  const search = JSON.stringify(knownSlug);
  await evaluate("const search = document.querySelector('#search'); search.value = " + search +
    "; search.dispatchEvent(new Event('input', {bubbles:true}));");
  assert.equal(await firstSlug(), knownSlug);
  assert(await readCount() < board.rows.length, 'Filtering must narrow the board');
  assert.deepEqual(errors, []);
  console.log('Offline board, pagination, focus, direct details and search verified.');
}

try {
  await Promise.race([run(), browserError]);
} finally {
  connection?.close();
  browser.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
