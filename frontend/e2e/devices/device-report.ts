import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from './layout-checks';
import { DEVICE_PROJECT_PREFIX, POSES } from './poses';

interface Shot {
  pose: string;
  step: string;
  order: number;
  title: string;
  status: TestResult['status'];
  checks: Check[];
  image?: string;
  knownBreak?: string;
}

export const DEVICE_REPORT_DIR = join('test-results', 'device-report');

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function figure(shot: Shot): string {
  const failed = shot.checks.filter((check) => !check.pass);
  const item = (check: Check) =>
    `<li class="${check.known ? 'known' : ''}"><b>${escape(check.name)}</b>${check.known ? ` (known: ${escape(check.known)})` : ''}: ${escape(check.detail)}</li>`;
  const notes = failed.length
    ? `<ul class="failed">${failed.map(item).join('')}</ul>`
    : shot.status === 'skipped'
      ? '<p class="note">not on this device</p>'
      : shot.checks.length
        ? `<p class="note">${shot.checks.length} checks passed</p>`
        : shot.knownBreak
          ? `<p class="known">stopped as known: ${escape(shot.knownBreak)}</p>`
          : `<p class="failed">stopped: ${escape(shot.status)}</p>`;
  const image = shot.image
    ? `<a href="${shot.image}"><img loading="lazy" src="${shot.image}" alt="${escape(shot.step)}"></a>`
    : '';
  const unknown = failed.some((check) => !check.known);
  const stopped = !shot.checks.length && shot.status !== 'skipped';
  const state =
    unknown || (stopped && !shot.knownBreak) ? 'bad' : failed.length || stopped ? 'warn' : '';
  return `<figure class="${state}"><figcaption>${escape(shot.step)}</figcaption>${image}${notes}</figure>`;
}

export function renderReport(shots: Shot[]): string {
  const sections = POSES.map((pose) => {
    const own = shots.filter((shot) => shot.pose === pose.id).sort((a, b) => a.order - b.order);
    if (!own.length) {
      return '';
    }
    const failing = own.filter((shot) => shot.checks.some((check) => !check.pass)).length;
    return `<section><h2>${escape(pose.id)} <small>${escape(String(pose.device))}${pose.textScale ? `, text ${pose.textScale} %` : ''} · ${failing} of ${own.length} screens with findings</small></h2><div class="grid">${own.map(figure).join('')}</div></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Devices</title><style>
body{font:14px system-ui,sans-serif;margin:16px;color:#1f2937}h2 small{font-weight:400;color:#4b5563}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
figure{margin:0;border:1px solid #d1d5db;border-radius:8px;padding:8px}figure.bad{border-color:#b91c1c;border-width:2px}figure.warn{border-color:#d97706;border-width:2px}
figcaption{font-weight:600;margin-bottom:6px}img{width:100%;height:auto;border:1px solid #e5e7eb}
.failed{color:#b91c1c;padding-left:16px}.known{color:#92400e}.note{color:#4b5563}
</style></head><body><h1>Pages on phones and tablets</h1>${sections}</body></html>`;
}

export default class DeviceReport implements Reporter {
  private readonly shots: Shot[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? '';
    if (!project.startsWith(DEVICE_PROJECT_PREFIX)) {
      return;
    }
    const body = (name: string) =>
      result.attachments.find((attachment) => attachment.name === name)?.body;
    const described = body('step');
    const stepInfo = described
      ? (JSON.parse(described.toString()) as { id: string; order: number })
      : { id: test.title, order: Number.MAX_SAFE_INTEGER };
    const layout = body('layout');
    const screen = { body: body('screen') };
    const pose = project.slice(DEVICE_PROJECT_PREFIX.length);
    const step = stepInfo.id;
    const image = screen?.body ? `${pose}/${step}.png` : undefined;
    const existing = this.shots.findIndex(
      (shot) => shot.pose === pose && shot.title === test.title,
    );
    const shot: Shot = {
      pose,
      step,
      order: stepInfo.order,
      title: test.title,
      status: result.status,
      checks: layout ? (JSON.parse(layout.toString()) as Check[]) : [],
      image,
      knownBreak:
        test.expectedStatus === 'failed'
          ? [...test.annotations, ...result.annotations].find((note) => note.type === 'fail')
              ?.description
          : undefined,
    };
    if (screen?.body && image) {
      mkdirSync(join(DEVICE_REPORT_DIR, pose), { recursive: true });
      writeFileSync(join(DEVICE_REPORT_DIR, image), screen.body);
    }
    if (existing >= 0) {
      this.shots[existing] = shot;
    } else {
      this.shots.push(shot);
    }
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    const runsDevices = suite
      .allTests()
      .some((test) => test.parent.project()?.name.startsWith(DEVICE_PROJECT_PREFIX));
    if (runsDevices) {
      rmSync(DEVICE_REPORT_DIR, { recursive: true, force: true });
    }
  }

  onEnd(): void {
    if (!this.shots.length) {
      return;
    }
    mkdirSync(DEVICE_REPORT_DIR, { recursive: true });
    writeFileSync(join(DEVICE_REPORT_DIR, 'index.html'), renderReport(this.shots));
    writeFileSync(join(DEVICE_REPORT_DIR, 'report.json'), JSON.stringify(this.shots, null, 2));
  }

  printsToStdio(): boolean {
    return false;
  }
}
