import { HttpBackend, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { appHttpClient } from './app.config';

describe('Given the HTTP client of the app', () => {
  it('when a request is sent, then it goes through XMLHttpRequest, which reports upload progress', () => {
    TestBed.configureTestingModule({ providers: [appHttpClient] });

    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);
  });
});
