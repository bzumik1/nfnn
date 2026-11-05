import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { API_GENERATION } from './api-generation';
import { APP_API_GENERATION, ServerVersion } from './server-version';

describe('Given the version the server reports', () => {
  let version: ServerVersion;

  beforeEach(() => {
    version = TestBed.inject(ServerVersion);
  });

  const answer = (headers: Record<string, string>) =>
    version.observe(new HttpHeaders({ 'Cache-Control': 'no-store', ...headers }));

  it('when no answer has come yet, then it knows neither and asks for no update', () => {
    expect(version.revision()).toBeNull();
    expect(version.apiGeneration()).toBeNull();
    expect(version.mustUpdate()).toBe(false);
  });

  it('when an answer names the generation the app is built for, then no update is needed', () => {
    answer({ 'Nfnn-Api': String(API_GENERATION), 'Nfnn-Revision': '0123abc' });

    expect(version.apiGeneration()).toBe(API_GENERATION);
    expect(version.revision()).toBe('0123abc');
    expect(version.mustUpdate()).toBe(false);
  });

  it('when an answer names a newer generation, then the app must update', () => {
    answer({ 'Nfnn-Api': String(API_GENERATION + 1) });

    expect(version.mustUpdate()).toBe(true);
  });

  it('when an answer names an older generation, as after a rollback, then the app must load the version the server runs too', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: APP_API_GENERATION, useValue: 3 }] });
    version = TestBed.inject(ServerVersion);

    answer({ 'Nfnn-Api': '2' });

    expect(version.mustUpdate()).toBe(true);
  });

  it('when a later answer names the app generation again, then the latest answer counts', () => {
    answer({ 'Nfnn-Api': String(API_GENERATION + 1) });
    answer({ 'Nfnn-Api': String(API_GENERATION) });

    expect(version.mustUpdate()).toBe(false);
  });

  it('when an answer carries no version headers, then what an earlier answer said stays', () => {
    answer({ 'Nfnn-Api': String(API_GENERATION + 1), 'Nfnn-Revision': '0123abc' });
    answer({});

    expect(version.mustUpdate()).toBe(true);
    expect(version.revision()).toBe('0123abc');
  });

  for (const value of ['', 'abc', '2.0', '-1', '0', '1e3', ' 2', '2;x', '12345678901']) {
    it(`when the generation header reads ${JSON.stringify(value)}, then it is ignored`, () => {
      answer({ 'Nfnn-Api': value });

      expect(version.apiGeneration()).toBeNull();
      expect(version.mustUpdate()).toBe(false);
    });
  }

  for (const value of ['', 'main', '0123ABC', '012345', 'a'.repeat(41), '0123abc\n']) {
    it(`when the revision header reads ${JSON.stringify(value)}, then it is ignored`, () => {
      answer({ 'Nfnn-Revision': value });

      expect(version.revision()).toBeNull();
    });
  }

  for (const cacheControl of ['private, max-age=300', 'public, max-age=3600', '']) {
    it(`when an answer the browser may keep (${JSON.stringify(cacheControl)}) names another version, then it is ignored, because it may come from the cache`, () => {
      answer({ 'Nfnn-Api': String(API_GENERATION), 'Nfnn-Revision': '0123abc' });

      version.observe(
        new HttpHeaders({
          'Cache-Control': cacheControl,
          'Nfnn-Api': String(API_GENERATION + 1),
          'Nfnn-Revision': '4567def',
        }),
      );

      expect(version.mustUpdate()).toBe(false);
      expect(version.revision()).toBe('0123abc');
    });
  }

  it('when an answer is marked no-store among other directives, then it counts', () => {
    version.observe(
      new HttpHeaders({
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Nfnn-Api': String(API_GENERATION + 1),
      }),
    );

    expect(version.mustUpdate()).toBe(true);
  });

  it('when the revision header reads dev, then the development server is named as such', () => {
    answer({ 'Nfnn-Revision': 'dev' });

    expect(version.revision()).toBe('dev');
  });
});
