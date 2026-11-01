import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/MeltDown.js';

const link = url => `<a href="${url.replaceAll('&', '&amp;')}">${url.replaceAll('&', '&amp;')}</a>`;

test('HTTP(S) addresses link by default in both HTML modes', () => {
  for (const html of ['escape', 'allow']) {
    for (const url of ['https://example.com', 'http://localhost:5000/path', 'HTTPS://example.com/a_b?q=1&x=2', 'https://example.com/#section']) {
      assert.equal(parse(`Visit ${url}`, { html }), `<p>Visit ${link(url)}</p>`);
    }
  }
});

test('sentence punctuation stays outside links, balanced parentheses stay inside', () => {
  for (const punctuation of ['.', ',', '!', '?', ':', ';', '...', '?!']) {
    assert.equal(parse(`https://example.com${punctuation}`), `<p>${link('https://example.com')}${punctuation}</p>`);
  }
  assert.equal(parse('(https://example.com/wiki/Thing_(example)).'),
    `<p>(${link('https://example.com/wiki/Thing_(example)')}).</p>`);
  assert.equal(parse('https://example.com/path]'), `<p>${link('https://example.com/path')}]</p>`);
});

test('URLs do not produce nested links or activate in code and HTML attributes', () => {
  assert.equal(parse('`https://example.com`'), '<p><code>https://example.com</code></p>');
  assert.equal(parse('```\nhttps://example.com\n```'), '<pre><code>https://example.com</code></pre>');
  assert.equal(parse('[https://example.com](https://target.test)'), '<p><a href="https://target.test">https://example.com</a></p>');
  assert.equal(parse('<span title="https://example.com">text</span>', { html: 'allow' }), '<p><span title="https://example.com">text</span></p>');
  assert.equal(parse('[https://example.com]'), '<p>[https://example.com]</p>');
  assert.equal(parse('![https://example.com](image.png)'), '<p><img src="image.png" alt="https://example.com"></p>');
});

test('formatting and block containers retain ordinary URL links', () => {
  assert.equal(parse('**https://example.com**'), `<p><strong>${link('https://example.com')}</strong></p>`);
  assert.equal(parse('> https://example.com'), `<blockquote><p>${link('https://example.com')}</p></blockquote>`);
  assert.equal(parse('# https://example.com'), `<h1 id="httpsexamplecom">${link('https://example.com')}</h1>`);
});

test('underscore emphasis closes outside URLs without losing literal URL underscores', () => {
  for (const marker of ['_', '__']) {
    const tag = marker.length === 1 ? 'em' : 'strong';
    assert.equal(parse(`${marker}Visit https://example.com${marker}`),
      `<p><${tag}>Visit ${link('https://example.com')}</${tag}></p>`);
    assert.equal(parse(`${marker}https://example.com/a_b${marker}`),
      `<p><${tag}>${link('https://example.com/a_b')}</${tag}></p>`);
  }
  for (const url of ['https://example.com/a_b', 'https://example.com/path_', 'https://example.com/path__']) {
    assert.equal(parse(url), `<p>${link(url)}</p>`);
    assert.equal(parse(`_Earlier_ ${url}`), `<p><em>Earlier</em> ${link(url)}</p>`);
  }
  assert.equal(parse('__Visit https://example.com_ more_'),
    `<p><em><em>Visit ${link('https://example.com')}</em> more</em></p>`);
  assert.equal(parse('word_https://example.com'), '<p>word_https://example.com</p>');
});

test('non-HTTP schemes, embedded words, and incomplete URLs stay literal', () => {
  for (const text of ['javascript:alert(1)', 'file:///tmp/note', 'wordhttps://example.com', 'https://', 'https://?q=1']) {
    assert.equal(parse(text), `<p>${text}</p>`);
  }
});
