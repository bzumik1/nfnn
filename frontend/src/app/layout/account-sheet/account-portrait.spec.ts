import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth-store';
import { Donor } from '../../core/auth/donor';
import { sampleDonor } from '../../core/auth/testing/donor-fixtures';
import { AccountPortrait } from './account-portrait';

const MINE = '/api/admin/content/people/me';

function member(id: string) {
  return {
    member: {
      id: '0199f3e0-0000-7000-8000-00000000c001',
      name: 'Jana Nováková',
      portrait: { id, url: `/api/content/media/${id}`, width: 640, height: 640 },
    },
  };
}

describe('Given the portrait of the signed-in administrator', () => {
  const donor = signal<Donor | null>(null);
  const admin = signal(false);
  let http: HttpTestingController;
  let portrait: AccountPortrait;

  beforeEach(() => {
    donor.set(null);
    admin.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthStore,
          useValue: { donor: donor.asReadonly(), isAdmin: admin.asReadonly() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    portrait = TestBed.inject(AccountPortrait);
  });

  afterEach(() => http.verify());

  function signInAdministrator(id: string): void {
    donor.set(sampleDonor({ id }));
    admin.set(true);
    portrait.ask();
  }

  it('when a donor without the role is signed in, then nothing is asked and no portrait shows', () => {
    donor.set(sampleDonor());
    portrait.ask();

    expect(portrait.url()).toBeNull();
  });

  it('when an administrator is signed in, then the portrait is asked once however often the header asks', () => {
    signInAdministrator('0199f3e0-0000-7000-8000-0000000000a1');
    portrait.ask();
    http.expectOne(MINE).flush(member('0199f3e0-0000-7000-8000-00000000c101'));
    portrait.ask();

    expect(portrait.url()).toBe('/api/content/media/0199f3e0-0000-7000-8000-00000000c101?w=480');
  });

  it('when the administrator signs out and another one signs in on the same tab, then the first portrait never shows for the second', () => {
    signInAdministrator('0199f3e0-0000-7000-8000-0000000000a1');
    http.expectOne(MINE).flush(member('0199f3e0-0000-7000-8000-00000000c101'));

    donor.set(null);
    admin.set(false);
    expect(portrait.url()).toBeNull();

    signInAdministrator('0199f3e0-0000-7000-8000-0000000000a2');
    expect(portrait.url()).toBeNull();
    http.expectOne(MINE).flush({ member: null });

    expect(portrait.url()).toBeNull();
  });

  it('when the first administrator signs out before their portrait arrives and another signs in, then the late answer never takes the place of the second one', () => {
    signInAdministrator('0199f3e0-0000-7000-8000-0000000000a1');
    const first = http.expectOne(MINE);
    donor.set(null);
    admin.set(false);
    signInAdministrator('0199f3e0-0000-7000-8000-0000000000a2');
    const second = http.expectOne(MINE);

    second.flush(member('0199f3e0-0000-7000-8000-00000000c102'));
    first.flush(member('0199f3e0-0000-7000-8000-00000000c101'));

    expect(portrait.url()).toBe('/api/content/media/0199f3e0-0000-7000-8000-00000000c102?w=480');
  });
});
