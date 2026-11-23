// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { istLetztesFeld, tabbareFelder } from './tabFolge';

describe('tabbareFelder', () => {
  it('skips disabled, hidden and tabindex -1 elements', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><button tabindex="-1">x</button><input disabled><input type="hidden"><div hidden><input></div><textarea id="b"></textarea>';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'b']);
    expect(istLetztesFeld(div, div.querySelector('#b')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#a')!)).toBe(false);
  });

  it('counts only the checked radio of a group as a tab stop', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><input type="radio" name="r" id="r1"><input type="radio" name="r" id="r2" checked><input type="radio" name="r" id="r3">';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'r2']);
    // Tab from the checked radio leaves the form, although the last radio is behind it.
    expect(istLetztesFeld(div, div.querySelector('#r2')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#r1')!)).toBe(true);
    expect(istLetztesFeld(div, div.querySelector('#a')!)).toBe(false);
  });

  it('takes the first radio as the stop when none is checked, and ignores an inert part', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<input id="a"><input type="radio" name="r" id="r1"><input type="radio" name="r" id="r2"><div inert><input id="x"></div>';
    expect(tabbareFelder(div).map((e) => e.id)).toEqual(['a', 'r1']);
    expect(istLetztesFeld(div, div.querySelector('#r1')!)).toBe(true);
  });
});
