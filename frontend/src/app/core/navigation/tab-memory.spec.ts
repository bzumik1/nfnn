import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_TABS, tabOf } from './app-tabs';
import { TabMemory } from './tab-memory';

@Component({ template: '' })
class Blank {}

const [about, news, projects, donate] = APP_TABS;

describe('Given the tabs of the app', () => {
  it('when a page lies under a tab, then it belongs to that tab', () => {
    expect(tabOf('/aktuality/novy-clanek?x=1')?.id).toBe('news');
    expect(tabOf('/projekty#rok')?.id).toBe('projects');
    expect(tabOf('/o-nas')?.id).toBe('about');
    expect(tabOf('/prispet')?.id).toBe('donate');
  });

  it('when a page lies under no tab, then it belongs to none', () => {
    expect(tabOf('/')).toBeNull();
    expect(tabOf('/darce/prehled')).toBeNull();
    expect(tabOf('/aktualityx')).toBeNull();
  });
});

describe('Given the memory of the tabs', () => {
  let router: Router;
  let memory: TabMemory;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    router = TestBed.inject(Router);
    memory = TestBed.inject(TabMemory);
  });

  it('when no page of a tab was seen yet, then the tab opens its root', () => {
    expect(memory.urlFor(news)).toBe('/aktuality');
  });

  it('when a page deeper in a tab was seen, then another tab returns to it', async () => {
    await router.navigateByUrl('/aktuality/novy-clanek');
    await router.navigateByUrl('/prispet');

    expect(memory.urlFor(news)).toBe('/aktuality/novy-clanek');
    expect(memory.currentTab()?.id).toBe('donate');
  });

  it('when the current tab is pressed, then it opens its root', async () => {
    await router.navigateByUrl('/projekty/sofinka');

    expect(memory.urlFor(projects)).toBe('/projekty');
    expect(memory.isAtRoot(projects)).toBe(false);
  });

  it('when the root of the current tab is shown, then it is at its root', async () => {
    await router.navigateByUrl('/o-nas');

    expect(memory.isAtRoot(about)).toBe(true);
    expect(memory.isAtRoot(donate)).toBe(false);
  });

  it('when a page outside the tabs is shown, then no tab is current', async () => {
    await router.navigateByUrl('/o-nas');
    await router.navigateByUrl('/darce/prehled');

    expect(memory.currentTab()).toBeNull();
    expect(memory.urlFor(about)).toBe('/o-nas');
  });
});
