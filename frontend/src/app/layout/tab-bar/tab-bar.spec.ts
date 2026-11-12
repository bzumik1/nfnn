import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  FakeSoftKeyboard,
  provideFakeSoftKeyboard,
} from '../../core/layout/testing/fake-soft-keyboard';
import { TabBar } from './tab-bar';

@Component({ template: '' })
class Blank {}

describe('Given the tab bar', () => {
  let fixture: ComponentFixture<TabBar>;
  let router: Router;
  let keyboard: FakeSoftKeyboard;

  beforeEach(async () => {
    keyboard = new FakeSoftKeyboard();
    await TestBed.configureTestingModule({
      imports: [TabBar],
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideFakeSoftKeyboard(keyboard),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(TabBar);
    fixture.detectChanges();
  });

  function tabs(): HTMLAnchorElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a'));
  }

  function tab(name: string): HTMLAnchorElement {
    return tabs().find((link) => link.textContent?.trim() === name)!;
  }

  async function visit(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function press(link: HTMLAnchorElement, init: MouseEventInit = {}): MouseEvent {
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    link.dispatchEvent(click);
    return click;
  }

  it('when it renders, then four named tabs with their labels lead to the sections in one named navigation', () => {
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.getAttribute('aria-label')).toBe('Hlavní sekce');
    expect(tabs().map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['O nás', '/o-nas'],
      ['Aktuality', '/aktuality'],
      ['Pomáháme', '/projekty'],
      ['Přispět', '/prispet'],
    ]);
  });

  it('when it renders, then every tab shows one decorative filled glyph drawn in the text colour', () => {
    const icons = tabs().map((link) => link.querySelectorAll('svg'));

    expect(icons.map((found) => found.length)).toEqual([1, 1, 1, 1]);
    for (const [icon] of icons.map((found) => Array.from(found))) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('viewBox')).not.toBeNull();
      expect(icon.getAttribute('fill')).toBe('currentColor');
      expect(icon.querySelectorAll('[stroke], [stroke-width]')).toHaveLength(0);
      expect(icon.hasAttribute('stroke')).toBe(false);
    }
  });

  it('when the landing page is open, then no tab is the current page', async () => {
    await visit('/');

    expect(tabs().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('when a page deeper in a tab is open, then that tab is marked current but not as the page itself, which is deeper', async () => {
    await visit('/aktuality');
    expect(tab('Aktuality').getAttribute('aria-current')).toBe('page');

    await visit('/aktuality/novy-clanek');

    expect(tab('Aktuality').getAttribute('aria-current')).toBe('true');
    expect(tab('Aktuality').classList).toContain('tab--current');
  });

  it('when another tab is pressed, then the app opens it and the tab left behind keeps the page seen in it', async () => {
    await visit('/projekty/sofinka');

    press(tab('Přispět'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/prispet');
    expect(tab('Pomáháme').getAttribute('href')).toBe('/projekty/sofinka');
  });

  it('when the current tab is pressed deeper inside it, then it returns to the root of the tab', async () => {
    await visit('/projekty/sofinka');

    press(tab('Pomáháme'));
    await fixture.whenStable();

    expect(router.url).toBe('/projekty');
  });

  it('when the current tab is pressed on a page opened from its root, then the app steps back to that root instead of opening it again on top', async () => {
    router.initialNavigation();
    await visit('/projekty');
    await visit('/projekty/sofinka');
    const location = TestBed.inject(Location);

    press(tab('Pomáháme'));
    await vi.waitFor(() => expect(router.url).toBe('/projekty'));

    location.forward();
    await vi.waitFor(() => expect(router.url).toBe('/projekty/sofinka'));
  });

  it('when the current tab is pressed at its root, then the page scrolls to the top and stays', async () => {
    await visit('/o-nas');
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    const click = press(tab('O nás'));

    expect(click.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(router.url).toBe('/o-nas');
  });

  it('when a tab is pressed with a modifier key, then the browser opens it as a link of its own', async () => {
    await visit('/o-nas');

    const click = press(tab('Aktuality'), { ctrlKey: true });

    expect(click.defaultPrevented).toBe(false);
  });

  describe('when the on-screen keyboard opens for a text field', () => {
    beforeEach(() => {
      document.body.appendChild(fixture.nativeElement);
      keyboard.show();
      fixture.detectChanges();
    });

    afterEach(() => fixture.nativeElement.remove());

    it('then the tab bar steps out of sight and out of the reach of the screen reader, as the keyboard covers it in a native app', () => {
      const bar = (fixture.nativeElement as HTMLElement).querySelector('nav')!;

      expect(getComputedStyle(bar).visibility).toBe('hidden');
    });

    it('and the keyboard goes down, then the tab bar is back', () => {
      keyboard.hide();
      fixture.detectChanges();
      const bar = (fixture.nativeElement as HTMLElement).querySelector('nav')!;

      expect(getComputedStyle(bar).visibility).not.toBe('hidden');
    });
  });
});
