import { SignedInDevice } from '../../../../core/auth/donor';
import { groupDevices } from './device-groups';

function device(id: string, lastUsedAt: string, current = false): SignedInDevice {
  return {
    id,
    platform: 'IPHONE',
    browser: 'SAFARI',
    session: 'REMEMBERED',
    signedInAt: '2026-09-01T08:00:00Z',
    lastUsedAt,
    current,
  };
}

const ids = (devices: readonly SignedInDevice[]) => devices.map((each) => each.id);

describe('Given the devices signed in to an account', () => {
  it('when they are grouped, then this device comes first and the others follow by their last use, newest first', () => {
    const groups = groupDevices([
      device('older', '2026-11-04T08:00:00Z'),
      device('this', '2026-11-05T09:00:00Z', true),
      device('newer', '2026-11-05T08:00:00Z'),
    ]);

    expect(ids(groups.current)).toEqual(['this']);
    expect(ids(groups.recent)).toEqual(['newer', 'older']);
    expect(groups.older).toEqual([]);
  });

  it('when one was last used more than 30 days before the newest use, then it goes among the older ones, newest first', () => {
    const groups = groupDevices([
      device('this', '2026-11-05T09:00:00Z', true),
      device('long-ago', '2026-09-10T08:00:00Z'),
      device('just-over', '2026-10-06T08:59:59Z'),
      device('last-week', '2026-10-29T08:00:00Z'),
    ]);

    expect(ids(groups.recent)).toEqual(['last-week']);
    expect(ids(groups.older)).toEqual(['just-over', 'long-ago']);
  });

  it('when one was last used exactly 30 days before the newest use, then it still counts as recent', () => {
    const groups = groupDevices([
      device('this', '2026-11-05T09:00:00Z', true),
      device('thirty-days', '2026-10-06T09:00:00Z'),
    ]);

    expect(ids(groups.recent)).toEqual(['thirty-days']);
    expect(groups.older).toEqual([]);
  });

  it('when this device was itself last used long ago, then it still comes first and is never among the older ones', () => {
    const groups = groupDevices([
      device('other', '2026-11-05T09:00:00Z'),
      device('this', '2026-08-01T09:00:00Z', true),
    ]);

    expect(ids(groups.current)).toEqual(['this']);
    expect(ids(groups.recent)).toEqual(['other']);
    expect(groups.older).toEqual([]);
  });

  it('when two were last used at the same moment, then they keep the order the server gave', () => {
    const groups = groupDevices([
      device('this', '2026-11-05T09:00:00Z', true),
      device('first', '2026-11-04T08:00:00Z'),
      device('second', '2026-11-04T08:00:00Z'),
    ]);

    expect(ids(groups.recent)).toEqual(['first', 'second']);
  });

  it('when no device is signed in, then every group is empty', () => {
    expect(groupDevices([])).toEqual({ current: [], recent: [], older: [] });
  });
});
