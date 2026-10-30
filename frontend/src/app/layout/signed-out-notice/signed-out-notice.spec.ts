import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { SignedOutNotice as SignedOutNoticeState } from '../../core/auth/signed-out-notice';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { SignedOutNotice } from './signed-out-notice';

@Component({ template: '' })
class Page {}

describe('Given the notice shown after signing out', () => {
  let fixture: ComponentFixture<SignedOutNotice>;
  let state: SignedOutNoticeState;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SignedOutNotice],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Page },
          { path: 'projekty', component: Page },
        ]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(SignedOutNoticeState);
    fixture = TestBed.createComponent(SignedOutNotice);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    http.verify();
  });

  function status(): HTMLElement {
    return fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when nobody signed out, then its status region is there and stays quiet', () => {
    expect(status()).not.toBeNull();
    expect(status().textContent?.trim()).toBe('');
    expect(document.documentElement.classList).not.toContain('has-floating-notice');
  });

  describe('when the donor has signed out', () => {
    beforeEach(async () => {
      state.show();
      await settle();
    });

    it('then the status region says so in a bar at the bottom of the screen', () => {
      expect(status().textContent?.replace(/\s+/g, ' ')).toContain('Odhlásili jste se.');
      expect(status().querySelector('.ui-notice--floating.ui-notice--status')).not.toBeNull();
      expect(document.documentElement.classList).toContain('has-floating-notice');
    });

    it('and they close it, then it is gone and the page keeps no room for it', async () => {
      (status().querySelector('button') as HTMLButtonElement).click();
      await settle();

      expect(status().textContent?.trim()).toBe('');
      expect(document.documentElement.classList).not.toContain('has-floating-notice');
    });

    it('and they open another page, then it is gone', async () => {
      await TestBed.inject(Router).navigateByUrl('/projekty');
      await settle();

      expect(state.shown()).toBe(false);
      expect(status().textContent?.trim()).toBe('');
    });

    it('and they sign in again, then it is gone', async () => {
      TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
      http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
      await settle();

      expect(state.shown()).toBe(false);
    });
  });
});
