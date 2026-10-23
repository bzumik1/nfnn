import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { CanonicalLink } from './canonical-link';

@Component({ template: '' })
class Empty {}

describe('Given the canonical address of the site', () => {
  let document: Document;
  let meta: Meta;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'zasady-ochrany-osobnich-udaju', component: Empty },
          { path: '**', component: Empty },
        ]),
      ],
    });
    document = TestBed.inject(DOCUMENT);
    meta = TestBed.inject(Meta);
    router = TestBed.inject(Router);
    TestBed.inject(CanonicalLink).start();
  });

  afterEach(() => {
    document.querySelector('link[rel="canonical"]')?.remove();
    meta.removeTag('property="og:url"');
  });

  function canonical(): string | undefined {
    return document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  }

  it('when the app starts, then the canonical link and og:url name the home page on nfnn.cz', () => {
    expect(canonical()).toBe('https://nfnn.cz/');
    expect(meta.getTag('property="og:url"')?.content).toBe('https://nfnn.cz/');
  });

  it('when the visitor opens a page with a query and a fragment, then both name the path only', async () => {
    await router.navigateByUrl('/zasady-ochrany-osobnich-udaju?utm_source=x#top');

    expect(canonical()).toBe('https://nfnn.cz/zasady-ochrany-osobnich-udaju');
    expect(meta.getTag('property="og:url"')?.content).toBe(
      'https://nfnn.cz/zasady-ochrany-osobnich-udaju',
    );
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it('when the visitor returns home, then both name the home page again', async () => {
    await router.navigateByUrl('/zasady-ochrany-osobnich-udaju');
    await router.navigateByUrl('/');

    expect(canonical()).toBe('https://nfnn.cz/');
    expect(meta.getTag('property="og:url"')?.content).toBe('https://nfnn.cz/');
  });
});
