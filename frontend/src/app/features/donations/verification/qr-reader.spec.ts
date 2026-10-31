import { TestBed } from '@angular/core/testing';
import {
  closedReport,
  recordClientErrors,
  SentClientErrors,
} from '../../../core/errors/testing/client-error-reports';
import type { QrImage } from './qr-image';
import {
  type QrDetector,
  QR_READER_ENVIRONMENT,
  QR_WORKER_TIMEOUT_MS,
  QrReader,
  QrReaderOutdated,
  type QrWorker,
  type QrWorkerAnswer,
  type QrWorkerQuestion,
} from './qr-reader';

const IMAGE: QrImage = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };

class FakeWorker implements QrWorker {
  onmessage: ((event: MessageEvent<QrWorkerAnswer>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly questions: QrWorkerQuestion[] = [];
  terminated = false;

  constructor(
    private readonly answer: (question: QrWorkerQuestion) => string | null | 'crash' | 'silent',
  ) {}

  postMessage(question: QrWorkerQuestion): void {
    this.questions.push(question);
    const text = this.answer(question);
    if (text === 'silent') {
      return;
    }
    queueMicrotask(() => {
      if (text === 'crash') {
        this.onerror?.(new ErrorEvent('error'));
        return;
      }
      this.onmessage?.(new MessageEvent('message', { data: { id: question.id, text } }));
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('Given the QR reader of the verification page', () => {
  let workers: FakeWorker[];
  let detector: QrDetector | null;
  let workerAnswer: (question: QrWorkerQuestion) => string | null | 'crash' | 'silent';

  function reader(): QrReader {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: QR_READER_ENVIRONMENT,
          useValue: {
            detector: () => Promise.resolve(detector),
            worker: () => {
              const worker = new FakeWorker((question) => workerAnswer(question));
              workers.push(worker);
              return worker;
            },
          },
        },
      ],
    });
    return TestBed.inject(QrReader);
  }

  let reports: SentClientErrors;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    reports = recordClientErrors();
    workers = [];
    detector = null;
    workerAnswer = () => 'https://nfnn.cz/overit#1';
  });

  describe('when the browser detects QR codes itself', () => {
    it('then it gives every code the browser found and starts no worker', async () => {
      detector = {
        detect: () =>
          Promise.resolve([
            { rawValue: 'https://example.org' },
            { rawValue: 'https://nfnn.cz/overit#1' },
          ]),
      };

      await expect(reader().read(IMAGE)).resolves.toEqual([
        'https://example.org',
        'https://nfnn.cz/overit#1',
      ]);
      expect(workers).toHaveLength(0);
    });

    it('and its detection fails, then it reads the image in the worker instead', async () => {
      detector = { detect: () => Promise.reject(new Error('not supported')) };

      await expect(reader().read(IMAGE)).resolves.toEqual(['https://nfnn.cz/overit#1']);
      expect(workers).toHaveLength(1);
    });

    it('and it finds nothing, then it asks the worker too, since jsQR reads some codes the detector misses', async () => {
      detector = { detect: () => Promise.resolve([]) };
      workerAnswer = () => null;

      await expect(reader().read(IMAGE)).resolves.toEqual([]);
      expect(workers[0].questions).toHaveLength(1);
    });
  });

  describe('when the browser has no QR detector', () => {
    it('then it reads the image in one worker, question by question', async () => {
      const qr = reader();

      await expect(qr.read(IMAGE)).resolves.toEqual(['https://nfnn.cz/overit#1']);
      await expect(qr.read(IMAGE)).resolves.toEqual(['https://nfnn.cz/overit#1']);
      expect(workers).toHaveLength(1);
      expect(workers[0].questions.map((question) => question.id)).toEqual([1, 2]);
      expect(workers[0].questions[0].image.width).toBe(4);
    });

    it('and the worker finds no code, then it gives nothing', async () => {
      workerAnswer = () => null;

      await expect(reader().read(IMAGE)).resolves.toEqual([]);
    });

    it('and the worker crashes, then it gives nothing and the next read starts a new worker', async () => {
      workerAnswer = () => 'crash';
      const qr = reader();

      await expect(qr.read(IMAGE)).resolves.toEqual([]);
      workerAnswer = () => 'https://nfnn.cz/overit#1';
      await expect(qr.read(IMAGE)).resolves.toEqual(['https://nfnn.cz/overit#1']);
      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(reports.bodies()).toEqual([closedReport('qr-encode', 'Other')]);
    });

    it('and every new worker fails before it answers, then after three it stops starting them and the read says the page is out of date', async () => {
      workerAnswer = () => 'crash';
      const qr = reader();

      await expect(qr.read(IMAGE)).resolves.toEqual([]);
      await expect(qr.read(IMAGE)).resolves.toEqual([]);
      await expect(qr.read(IMAGE)).resolves.toEqual([]);
      await expect(qr.read(IMAGE)).rejects.toBeInstanceOf(QrReaderOutdated);
      await expect(qr.read(IMAGE)).rejects.toBeInstanceOf(QrReaderOutdated);
      expect(workers).toHaveLength(3);
    });

    it('and a worker that answered before crashes, then the count of failed starts begins again', async () => {
      const qr = reader();
      workerAnswer = () => 'crash';
      await qr.read(IMAGE);
      await qr.read(IMAGE);
      workerAnswer = () => 'https://nfnn.cz/overit#1';
      await qr.read(IMAGE);
      workerAnswer = () => 'crash';
      await qr.read(IMAGE);
      await qr.read(IMAGE);

      await expect(qr.read(IMAGE)).resolves.toEqual([]);
      expect(workers).toHaveLength(5);
    });

    it('and the worker cannot be started, then it gives nothing', async () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: QR_READER_ENVIRONMENT,
            useValue: {
              detector: () => Promise.resolve(null),
              worker: () => {
                throw new Error('chunk missing');
              },
            },
          },
        ],
      });

      await expect(TestBed.inject(QrReader).read(IMAGE)).resolves.toEqual([]);
      expect(reports.bodies()).toEqual([closedReport('qr-encode', 'Error')]);
    });

    it('and two images are read at once, then each read gets its own answer from the one worker', async () => {
      workerAnswer = (question) => `https://nfnn.cz/overit#${question.id}`;
      const qr = reader();

      const both = await Promise.all([qr.read(IMAGE), qr.read(IMAGE)]);

      expect(both).toEqual([['https://nfnn.cz/overit#1'], ['https://nfnn.cz/overit#2']]);
      expect(workers).toHaveLength(1);
    });

    it('and the worker does not answer in time, then it gives nothing and the next read starts a new worker', async () => {
      vi.useFakeTimers();
      workerAnswer = () => 'silent';
      const qr = reader();

      const late = qr.read(IMAGE);
      await vi.advanceTimersByTimeAsync(QR_WORKER_TIMEOUT_MS);

      await expect(late).resolves.toEqual([]);
      expect(workers[0].terminated).toBe(true);
      workerAnswer = () => 'https://nfnn.cz/overit#1';
      await expect(qr.read(IMAGE)).resolves.toEqual(['https://nfnn.cz/overit#1']);
      expect(workers).toHaveLength(2);
    });

    it('and the worker stops answering while two reads wait, then both give nothing', async () => {
      vi.useFakeTimers();
      workerAnswer = () => 'silent';
      const qr = reader();

      const both = Promise.all([qr.read(IMAGE), qr.read(IMAGE)]);
      await vi.advanceTimersByTimeAsync(QR_WORKER_TIMEOUT_MS);

      await expect(both).resolves.toEqual([[], []]);
    });

    it('and the page is left while a read waits, then the read gives nothing', async () => {
      workerAnswer = () => 'silent';
      const qr = reader();

      const waiting = qr.read(IMAGE);
      await Promise.resolve();
      await Promise.resolve();
      qr.release();

      await expect(waiting).resolves.toEqual([]);
    });

    it('and the page is left, then the worker is ended', async () => {
      const qr = reader();
      await qr.read(IMAGE);

      qr.release();

      expect(workers[0].terminated).toBe(true);
    });
  });
});
