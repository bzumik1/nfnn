import { TestBed } from '@angular/core/testing';
import type { QrImage } from './qr-image';
import {
  type QrDetector,
  QR_READER_ENVIRONMENT,
  QrReader,
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

  constructor(private readonly answer: (question: QrWorkerQuestion) => string | null | 'crash') {}

  postMessage(question: QrWorkerQuestion): void {
    this.questions.push(question);
    const text = this.answer(question);
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
  let workerAnswer: (question: QrWorkerQuestion) => string | null | 'crash';

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

  beforeEach(() => {
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
    });

    it('and the page is left, then the worker is ended', async () => {
      const qr = reader();
      await qr.read(IMAGE);

      qr.release();

      expect(workers[0].terminated).toBe(true);
    });
  });
});
