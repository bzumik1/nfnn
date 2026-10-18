import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsBar } from './stats-bar';

describe('Given the stats bar', () => {
  afterEach(() => vi.useRealTimers());

  async function renderOn(day: string): Promise<ComponentFixture<StatsBar>> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(day));
    await TestBed.configureTestingModule({ imports: [StatsBar] }).compileComponents();
    const fixture = TestBed.createComponent(StatsBar);
    fixture.detectChanges();
    return fixture;
  }

  function years(fixture: ComponentFixture<StatsBar>): string | undefined {
    return (fixture.nativeElement as HTMLElement).querySelector('.stat-value')?.textContent?.trim();
  }

  it('when it is shown before the anniversary of 28 October 2005, then it counts the full years only', async () => {
    expect(years(await renderOn('2026-10-18T12:00:00Z'))).toBe('20');
  });

  it('when it is shown on the anniversary, then the new year counts', async () => {
    expect(years(await renderOn('2026-10-28T12:00:00Z'))).toBe('21');
  });
});
