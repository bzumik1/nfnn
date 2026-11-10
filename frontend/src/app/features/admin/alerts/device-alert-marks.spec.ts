import { TestBed } from '@angular/core/testing';

import {
  DEVICE_OWNER_KEY,
  DeviceAlertMarks,
  OFFER_HIDDEN_DAYS,
  OFFER_HIDDEN_KEY,
} from './device-alert-marks';

const DAY_MS = 24 * 60 * 60 * 1000;
const JANA = '0b1c2d3e-0000-4000-8000-000000000001';
const PETR = '0b1c2d3e-0000-4000-8000-000000000002';

describe('Given the marks the alerts keep on a device', () => {
  let marks: DeviceAlertMarks;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:00:00Z'));
    marks = TestBed.inject(DeviceAlertMarks);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('when the offer is put off, then it stays hidden for 30 days and comes back after them', () => {
    expect(marks.offerHidden()).toBe(false);

    marks.hideOffer();

    expect(OFFER_HIDDEN_DAYS).toBe(30);
    expect(marks.offerHidden()).toBe(true);
    vi.setSystemTime(Date.now() + 30 * DAY_MS - 1);
    expect(marks.offerHidden()).toBe(true);
    vi.setSystemTime(Date.now() + 2);
    expect(marks.offerHidden()).toBe(false);
    expect(OFFER_HIDDEN_KEY.startsWith('nfnn.')).toBe(true);
  });

  it('when an administrator turned the alerts on here, then only that administrator owns the device and the mark holds no id in the clear', async () => {
    await marks.markOwner(JANA);

    expect(await marks.ownedBy(JANA)).toBe(true);
    expect(await marks.ownedBy(PETR)).toBe(false);
    expect(DEVICE_OWNER_KEY.startsWith('nfnn.')).toBe(true);
    expect(localStorage.getItem(DEVICE_OWNER_KEY)).not.toContain(JANA.replace(/-/g, ''));
    expect(localStorage.getItem(DEVICE_OWNER_KEY)).not.toContain(JANA);
  });

  it('when the alerts were turned off here, then nobody owns the device any more', async () => {
    await marks.markOwner(JANA);

    marks.clearOwner();

    expect(await marks.ownedBy(JANA)).toBe(false);
  });

  it('when the storage refuses to work, then the offer counts as not hidden and the device as owned by nobody', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    marks.hideOffer();
    await marks.markOwner(JANA);

    expect(marks.offerHidden()).toBe(false);
    expect(await marks.ownedBy(JANA)).toBe(false);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
