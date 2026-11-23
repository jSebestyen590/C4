// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mausZiel } from './formular';

function baum(html: string) {
  const wurzel = document.createElement('div');
  wurzel.innerHTML = html;
  document.body.append(wurzel);
  return wurzel;
}

describe('mausZiel', () => {
  const html = `
    <p id="frei">Text</p>
    <div data-baustein="bausteinThema" id="huelle">
      <div class="polster" id="polster">
        <div data-baustein-formular id="formular"><div id="kopf"><span id="leer"></span></div><input id="eingabe" /></div>
        <div data-node-view-content id="notizen"><p id="notiz">Notiz</p></div>
      </div>
    </div>`;
  const el = (w: Element, id: string) => w.querySelector(`#${id}`)!;

  it('tells text, controls and node-view chrome apart', () => {
    const w = baum(html);
    expect(mausZiel(el(w, 'frei'), w)).toBe('text');
    expect(mausZiel(el(w, 'notiz'), w)).toBe('text');
    expect(mausZiel(el(w, 'eingabe'), w)).toBe('bedienbar');
    expect(mausZiel(el(w, 'kopf'), w)).toBe('chrome');
    expect(mausZiel(el(w, 'leer'), w)).toBe('chrome');
    expect(mausZiel(el(w, 'polster'), w)).toBe('chrome');
    expect(mausZiel(el(w, 'huelle'), w)).toBe('chrome');
  });

  it('is not fooled by a tabindex above the editor', () => {
    const aussen = baum('<div tabindex="-1"><div id="w">' + html + '</div></div>');
    const w = el(aussen, 'w');
    expect(mausZiel(el(w, 'kopf'), w)).toBe('chrome');
  });

  it('treats the chrome of a nested Baustein as chrome', () => {
    const w = baum(`<div data-baustein="a"><div data-node-view-content>
      <div data-baustein="b" id="innen"><div data-baustein-formular><i id="k"></i></div></div></div></div>`);
    expect(mausZiel(el(w, 'innen'), w)).toBe('chrome');
    expect(mausZiel(el(w, 'k'), w)).toBe('chrome');
  });
});
