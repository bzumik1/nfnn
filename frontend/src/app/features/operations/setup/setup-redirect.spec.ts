import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SetupRedirect } from './setup-redirect';

@Component({ template: '' })
class Blank {}

describe('Given a visitor opening the public site', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Blank },
          { path: 'prvni-nastaveni', component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await router.navigateByUrl('/');
  });

  afterEach(() => http.verify());

  it('when the site still needs its first setup, then the visitor is taken to the setup page once', async () => {
    const redirect = TestBed.inject(SetupRedirect);

    redirect.checkOnce();
    redirect.checkOnce();
    http.expectOne('/api/operations/setup').flush({ required: true, codeRequired: false });
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.url).toBe('/prvni-nastaveni');
  });

  it('when the site is set up, then the visitor stays where they are', async () => {
    TestBed.inject(SetupRedirect).checkOnce();
    http.expectOne('/api/operations/setup').flush({ required: false, codeRequired: true });
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.url).toBe('/');
  });

  it('when the status cannot be read, then the visitor stays where they are', async () => {
    TestBed.inject(SetupRedirect).checkOnce();
    http.expectOne('/api/operations/setup').flush('', { status: 502, statusText: 'Bad Gateway' });
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.url).toBe('/');
  });
});
