import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { APP_JAR, BROWSER_JAR, runsInstalled, SESSION_JAR, sessionKindFor } from './session-jar';

function viewWith(standalone: boolean | undefined, displayModeStandalone: boolean): Window {
  return {
    navigator: { standalone },
    matchMedia: (query: string) =>
      ({
        matches: query === '(display-mode: standalone)' && displayModeStandalone,
      }) as MediaQueryList,
  } as unknown as Window;
}

describe('Given the session jar of a page', () => {
  it('when the page runs in a browser tab, then it is not the installed app', () => {
    expect(runsInstalled(viewWith(undefined, false))).toBe(false);
    expect(runsInstalled(null)).toBe(false);
  });

  it('when the page runs from the home screen of an iPhone or in standalone display mode, then it is the installed app', () => {
    expect(runsInstalled(viewWith(true, false))).toBe(true);
    expect(runsInstalled(viewWith(undefined, true))).toBe(true);
  });

  it('when the jar is injected in a browser tab, then the browser names are used', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: viewWith(undefined, false) } }],
    });

    expect(TestBed.inject(SESSION_JAR)).toBe(BROWSER_JAR);
  });

  it('when the jar is injected in the installed app, then the app keeps its own lock, channel and hint', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: viewWith(undefined, true) } }],
    });

    const jar = TestBed.inject(SESSION_JAR);
    expect(jar).toBe(APP_JAR);
    expect(jar.lockName).not.toBe(BROWSER_JAR.lockName);
    expect(jar.channelName).not.toBe(BROWSER_JAR.channelName);
    expect(jar.hintKey).not.toBe(BROWSER_JAR.hintKey);
  });

  it('when a kind is chosen, then the installed app always signs in as the app and a browser keeps the choice', () => {
    expect(sessionKindFor(APP_JAR, 'PUBLIC')).toBe('APP');
    expect(sessionKindFor(BROWSER_JAR, 'PUBLIC')).toBe('PUBLIC');
    expect(sessionKindFor(BROWSER_JAR, 'REMEMBERED')).toBe('REMEMBERED');
  });
});
