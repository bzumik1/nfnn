/// <reference lib="webworker" />

import { argon2WorkerAnswer } from './argon2';
import type { PasswordKeyQuestion } from './password-key-protocol';

addEventListener('message', ({ data }: MessageEvent<PasswordKeyQuestion>) => {
  void argon2WorkerAnswer(data).then((answer) =>
    'key' in answer ? postMessage(answer, [answer.key.buffer]) : postMessage(answer),
  );
});
