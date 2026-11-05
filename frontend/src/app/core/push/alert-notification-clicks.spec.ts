import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

import { AlertNotificationClicks } from './alert-notification-clicks';
import { NO_PUSH, PushNotificationClick, SERVICE_WORKER_PUSH } from './service-worker-push';

describe('Given the app open while an alert notification is clicked', () => {
  let clicks: Subject<PushNotificationClick>;
  let navigateByUrl: Mock<(url: string) => Promise<boolean>>;

  beforeEach(() => {
    clicks = new Subject<PushNotificationClick>();
    navigateByUrl = vi.fn<(url: string) => Promise<boolean>>(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: SERVICE_WORKER_PUSH, useValue: { ...NO_PUSH, notificationClicks: clicks } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    TestBed.inject(AlertNotificationClicks).start();
  });

  it('when a backup alert is clicked, then the app opens the backups page by its own route', () => {
    clicks.next({ action: '', data: { kind: 'backups-outage', count: 1 } });

    expect(navigateByUrl).toHaveBeenCalledWith('/sprava/zalohy');
  });

  it('when a notification names a URL of its own, then the app ignores it and opens the route of its kind', () => {
    clicks.next({
      action: '',
      data: {
        kind: 'mail-outage',
        onActionClick: {
          default: { operation: 'focusLastFocusedOrOpen', url: '//elsewhere.example' },
        },
      },
    });

    expect(navigateByUrl).toHaveBeenCalledWith('/sprava/nastaveni');
  });

  it('when a notification of an unknown kind is clicked, then the app opens the alerts page', () => {
    clicks.next({ action: '', data: { kind: 'unknown' } });

    expect(navigateByUrl).toHaveBeenCalledWith('/sprava/upozorneni');
  });

  it('when it is started twice, then a click navigates once', () => {
    TestBed.inject(AlertNotificationClicks).start();

    clicks.next({ action: '', data: { kind: 'test' } });

    expect(navigateByUrl).toHaveBeenCalledTimes(1);
  });
});
