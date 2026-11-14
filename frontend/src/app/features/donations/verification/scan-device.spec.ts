import {
  frameCut,
  LARGEST_CENTRE_SIDE,
  LARGEST_FRAME_SIDE,
  openScanCamera,
  SCAN_CAMERA_KEY,
} from './scan-device';

class FakeVideoTrack {
  readonly applied: MediaTrackConstraints[] = [];
  stopped = false;
  focus: () => Promise<void> = () => Promise.resolve();
  capabilities: () => object = () =>
    this.focusModes === undefined ? {} : { focusMode: this.focusModes };

  constructor(
    private readonly deviceId: string,
    private readonly focusModes: readonly string[] | undefined,
    private readonly facingMode?: string,
  ) {}

  getSettings(): MediaTrackSettings {
    return this.facingMode === undefined
      ? { deviceId: this.deviceId }
      : { deviceId: this.deviceId, facingMode: this.facingMode };
  }

  getCapabilities(): object {
    return this.capabilities();
  }

  applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    this.applied.push(constraints);
    return this.focus();
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeMedia {
  readonly asked: MediaTrackConstraints[] = [];

  constructor(
    private readonly answer: (
      video: MediaTrackConstraints,
      attempt: number,
    ) => FakeVideoTrack | DOMException,
  ) {}

  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const video = constraints.video as MediaTrackConstraints;
    this.asked.push(video);
    const answer = this.answer(video, this.asked.length);
    if (answer instanceof DOMException) {
      return Promise.reject(answer);
    }
    return Promise.resolve({
      getVideoTracks: () => [answer],
      getTracks: () => [answer],
    } as unknown as MediaStream);
  }
}

function choiceOf(video: MediaTrackConstraints): object {
  const { width, height, ...choice } = video;
  expect({ width, height }).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 } });
  return choice;
}

function media(answer: ConstructorParameters<typeof FakeMedia>[0]): FakeMedia {
  return new FakeMedia(answer);
}

describe('Given a scan that opens the camera', () => {
  let storage: Storage;

  beforeEach(() => {
    localStorage.clear();
    storage = localStorage;
  });

  it('when no camera worked before, then it asks for the rear camera at full HD, keeps its id and turns on continuous focus', async () => {
    const track = new FakeVideoTrack('rear-1', ['manual', 'continuous']);
    const device = media(() => track);

    await openScanCamera(device as unknown as MediaDevices, storage);

    expect(device.asked.map(choiceOf)).toEqual([{ facingMode: { exact: 'environment' } }]);
    expect(storage.getItem(SCAN_CAMERA_KEY)).toBe('rear-1');
    expect(track.applied).toEqual([
      {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      },
    ]);
  });

  it('when a camera worked before, then it asks for that camera first', async () => {
    storage.setItem(SCAN_CAMERA_KEY, 'saved-1');
    const device = media(() => new FakeVideoTrack('saved-1', undefined));

    await openScanCamera(device as unknown as MediaDevices, storage);

    expect(device.asked.map(choiceOf)).toEqual([{ deviceId: { exact: 'saved-1' } }]);
  });

  it('when the saved camera is gone and there is no rear camera, then it forgets the saved one, takes the front camera and does not keep it', async () => {
    storage.setItem(SCAN_CAMERA_KEY, 'gone');
    const track = new FakeVideoTrack('front-1', ['manual'], 'user');
    const device = media((_video, attempt) =>
      attempt < 3 ? new DOMException('', 'OverconstrainedError') : track,
    );

    await openScanCamera(device as unknown as MediaDevices, storage);

    expect(device.asked.map(choiceOf)).toEqual([
      { deviceId: { exact: 'gone' } },
      { facingMode: { exact: 'environment' } },
      {},
    ]);
    expect(storage.getItem(SCAN_CAMERA_KEY)).toBeNull();
    expect(track.applied).toEqual([]);
  });

  it('when only a camera that tells no facing opens after the rear one is missing, then it keeps that camera', async () => {
    const device = media((_video, attempt) =>
      attempt < 2 ? new DOMException('', 'OverconstrainedError') : new FakeVideoTrack('usb-1', []),
    );

    await openScanCamera(device as unknown as MediaDevices, storage);

    expect(storage.getItem(SCAN_CAMERA_KEY)).toBe('usb-1');
  });

  it('when the saved camera is busy for a moment, then it takes another one for this scan and keeps the saved one', async () => {
    storage.setItem(SCAN_CAMERA_KEY, 'rear-1');
    const device = media((_video, attempt) =>
      attempt === 1
        ? new DOMException('', 'NotReadableError')
        : new FakeVideoTrack('front-1', [], 'user'),
    );

    await openScanCamera(device as unknown as MediaDevices, storage);

    expect(storage.getItem(SCAN_CAMERA_KEY)).toBe('rear-1');
  });

  it('when the saved camera is gone and no other camera opens either, then it forgets the saved one', async () => {
    storage.setItem(SCAN_CAMERA_KEY, 'gone');
    const device = media(() => new DOMException('', 'NotFoundError'));

    await expect(openScanCamera(device as unknown as MediaDevices, storage)).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    expect(storage.getItem(SCAN_CAMERA_KEY)).toBeNull();
  });

  it('when the camera refuses continuous focus, then the scan still gets the open camera', async () => {
    const track = new FakeVideoTrack('rear-1', ['continuous']);
    track.focus = () => Promise.reject(new DOMException('', 'OverconstrainedError'));
    const device = media(() => track);

    await expect(openScanCamera(device as unknown as MediaDevices, storage)).resolves.toBeDefined();
    expect(track.stopped).toBe(false);
  });

  it('when asking the camera for focus never ends, then the scan gets the camera after a second', async () => {
    vi.useFakeTimers();
    try {
      const track = new FakeVideoTrack('rear-1', ['continuous']);
      track.focus = () => new Promise<void>(() => undefined);
      const device = media(() => track);

      const opened = openScanCamera(device as unknown as MediaDevices, storage);
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(opened).resolves.toBeDefined();
      expect(track.stopped).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when the opened camera fails while it is set up, then it turns the camera off and passes the failure on', async () => {
    const track = new FakeVideoTrack('rear-1', ['continuous']);
    track.capabilities = () => {
      throw new Error('gone');
    };
    const device = media(() => track);

    await expect(openScanCamera(device as unknown as MediaDevices, storage)).rejects.toThrow(
      'gone',
    );
    expect(track.stopped).toBe(true);
  });

  it.each(['NotAllowedError', 'SecurityError'])(
    'when the visitor or the browser refuses the camera (%s), then it asks no other camera and passes the refusal on',
    async (name) => {
      storage.setItem(SCAN_CAMERA_KEY, 'saved-1');
      const device = media(() => new DOMException('', name));

      await expect(
        openScanCamera(device as unknown as MediaDevices, storage),
      ).rejects.toMatchObject({
        name,
      });
      expect(device.asked).toHaveLength(1);
      expect(storage.getItem(SCAN_CAMERA_KEY)).toBe('saved-1');
    },
  );

  it('when no camera answers at all, then the last failure is passed on', async () => {
    const device = media(() => new DOMException('', 'NotFoundError'));

    await expect(openScanCamera(device as unknown as MediaDevices, storage)).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    expect(device.asked).toHaveLength(2);
  });

  it('when the browser has no camera interface, then it says no camera was found', async () => {
    await expect(openScanCamera(undefined, storage)).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  it('when the browser storage throws, then the camera still opens', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const device = media(() => new FakeVideoTrack('rear-1', undefined));

    await expect(
      openScanCamera(device as unknown as MediaDevices, throwing),
    ).resolves.toBeDefined();
  });
});

describe('Given a camera picture to read a code from', () => {
  it('when the centre is asked of a full HD picture, then it is the middle square at native resolution', () => {
    expect(frameCut(1920, 1080, 'centre')).toEqual({
      x: 420,
      y: 0,
      side: { width: 1080, height: 1080 },
      size: { width: 1080, height: 1080 },
    });
  });

  it('when the centre is asked of an upright 4K picture, then the square is capped and stays unscaled', () => {
    expect(frameCut(2160, 3840, 'centre')).toEqual({
      x: (2160 - LARGEST_CENTRE_SIDE) / 2,
      y: (3840 - LARGEST_CENTRE_SIDE) / 2,
      side: { width: LARGEST_CENTRE_SIDE, height: LARGEST_CENTRE_SIDE },
      size: { width: LARGEST_CENTRE_SIDE, height: LARGEST_CENTRE_SIDE },
    });
  });

  it('when the whole picture is asked, then it is scaled down to the largest frame side', () => {
    expect(frameCut(1920, 1080, 'whole')).toEqual({
      x: 0,
      y: 0,
      side: { width: 1920, height: 1080 },
      size: { width: LARGEST_FRAME_SIDE, height: 720 },
    });
  });

  it('when the whole of a small picture is asked, then it keeps its size', () => {
    expect(frameCut(640, 480, 'whole').size).toEqual({ width: 640, height: 480 });
  });
});
