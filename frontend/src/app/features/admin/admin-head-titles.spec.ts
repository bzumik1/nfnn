import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CompactLayout } from '../../core/layout/compact-layout';
import { RouteChrome } from '../../core/navigation/route-chrome';
import { adminRoutes } from './admin.routes';
import { ADMINISTRATION_LOCK } from './shell/administration-lock';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Frame {}

@Component({ template: '' })
class LockPanel {}

const PAGES: readonly Route[] = adminRoutes[0].children ?? [];
const HEADING_ARRIVES_LATER = ['darci/:id', 'darci/:id/:section'];
const ADDRESSES: Readonly<Record<string, string>> = {
  'darci/:id': 'darci/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e0f',
  'darci/:id/:section': 'darci/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e0f/dary',
  'prehledy/:month': 'prehledy/2026-10',
  'aktuality/:id': 'aktuality/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e01',
  'projekty/:id': 'projekty/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e02',
  'logy/soubor': 'logy/soubor?nazev=backend.2026-11-20.log.gz',
};

function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

describe('Given every page of the administration in the sheet of a phone', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CompactLayout,
          useValue: {
            isCompact: signal(true).asReadonly(),
            listsAsRows: signal(true).asReadonly(),
          },
        },
        provideRouter([
          {
            path: 'sprava',
            component: Frame,
            providers: [
              {
                provide: ADMINISTRATION_LOCK,
                useValue: {
                  locked: signal(false).asReadonly(),
                  panel: signal(LockPanel).asReadonly(),
                  keepsPage: signal(false).asReadonly(),
                  firstDownload: signal(null).asReadonly(),
                  firstDownloadEnd: signal(null).asReadonly(),
                  retryFirstDownload: () => undefined,
                },
              },
            ],
            children: [...PAGES],
          },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  for (const page of PAGES.filter((each) => !HEADING_ARRIVES_LATER.includes(each.path ?? ''))) {
    const address = `/sprava/${ADDRESSES[page.path ?? ''] ?? page.path}`.replace(/\/$/, '');

    it(`when ${address} opens, then the title of its head is its heading from the first pass`, async () => {
      await harness.navigateByUrl(address);
      harness.detectChanges();

      const heading = oneLine(harness.routeNativeElement?.querySelector('h1')?.textContent);
      expect(heading).not.toBe('');
      expect(oneLine(TestBed.inject(RouteChrome).current().headTitle)).toBe(heading);
    });
  }

  for (const path of HEADING_ARRIVES_LATER) {
    it(`when /sprava/${ADDRESSES[path]} opens, then its head starts with the heading the page shows before the donor's name arrives, and follows the heading`, async () => {
      await harness.navigateByUrl(`/sprava/${ADDRESSES[path]}`);
      harness.detectChanges();

      const chrome = TestBed.inject(RouteChrome).current();
      expect(chrome.headTitleFollowsHeading).toBe(true);
      expect(oneLine(chrome.headTitle)).toBe(
        oneLine(harness.routeNativeElement?.querySelector('h1')?.textContent),
      );
    });
  }
});
