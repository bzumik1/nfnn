/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FieldMessages, FormField } from '../../../shared/ui/form-field/form-field';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { proofFragmentInPdf } from './pdf-proof-link';
import { proofFragment } from './proof-link';
import { ProofLinkValidator } from './proof-link-validator';
import type { QrImage } from './qr-image';
import { QrReader } from './qr-reader';
import { PictureTooLarge, SCAN_DEVICE } from './scan-device';

export const SCAN_INTERVAL_MS = 250;
export const SCAN_TIME_LIMIT_MS = 120_000;
export const LARGEST_FILE_BYTES = 20 * 1024 * 1024;

type Scan = 'idle' | 'starting' | 'scanning';

type Way = 'camera' | 'file';

interface Problem {
  readonly way: Way;
  readonly text: string;
}

const PDF_TYPE = 'application/pdf';
const PDF_NAME = /\.pdf$/i;

const FOREIGN_CODE = $localize`:@@donor.verify.input.foreignCode:Tento QR kód nepatří k potvrzení fondu Nová naděje. Načtěte kód z potvrzení o daru.`;
const CAMERA_REFUSED = $localize`:@@donor.verify.input.cameraRefused:Prohlížeč nedovolil použít fotoaparát. Povolte ho v nastavení prohlížeče, nebo nahrajte PDF či fotku kódu.`;
const CAMERA_MISSING = $localize`:@@donor.verify.input.cameraMissing:Fotoaparát jsme v zařízení nenašli. Nahrajte PDF potvrzení nebo fotku jeho QR kódu.`;
const CAMERA_FAILED = $localize`:@@donor.verify.input.cameraFailed:Fotoaparát se nepodařilo spustit. Zkuste to znovu, nebo nahrajte PDF či fotku kódu.`;
const SCAN_GAVE_UP = $localize`:@@donor.verify.input.scanGaveUp:QR kód se nepodařilo přečíst. Zkuste to znovu s kódem zblízka a na světle, nebo nahrajte PDF či fotku kódu.`;
const FILE_TOO_LARGE = $localize`:@@donor.verify.input.fileTooLarge:Soubor je příliš velký. Nahrajte PDF potvrzení nebo fotku kódu menší než 20 MB.`;
const PDF_WITHOUT_LINK = $localize`:@@donor.verify.input.pdfWithoutLink:V tomto PDF jsme ověřovací kód nenašli. Nahrajte PDF potvrzení tak, jak jste ho stáhli z webu fondu, nebo načtěte jeho QR kód.`;
const PICTURE_WITHOUT_CODE = $localize`:@@donor.verify.input.pictureWithoutCode:Na obrázku jsme QR kód nenašli. Vyfoťte kód zblízka a ostře, nebo nahrajte PDF potvrzení.`;
const PICTURE_TOO_LARGE = $localize`:@@donor.verify.input.pictureTooLarge:Obrázek je příliš velký. Nahrajte fotku nebo snímek obrazovky QR kódu do 50 megapixelů.`;
const FILE_UNREADABLE = $localize`:@@donor.verify.input.fileUnreadable:Soubor se nepodařilo otevřít. Nahrajte PDF potvrzení nebo fotku kódu ve formátu JPEG či PNG.`;
const CAMERA_REFUSALS = ['NotAllowedError', 'SecurityError'];
const CAMERA_ABSENCES = ['NotFoundError', 'OverconstrainedError'];

@Component({
  selector: 'app-proof-input',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    FileButton,
    ProofLinkValidator,
  ],
  templateUrl: './proof-input.html',
  styleUrl: './proof-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProofInput {
  private readonly device = inject(SCAN_DEVICE);
  private readonly reader = inject(QrReader);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly scanButton = viewChild<ElementRef<HTMLButtonElement>>('scanButton');
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton');
  private stream: MediaStream | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private scanRun = 0;

  readonly found = output<string>();

  protected readonly hasCamera = this.device.hasCamera();
  protected readonly scan = signal<Scan>('idle');
  protected readonly reading = signal(false);
  protected readonly problem = signal<Problem | null>(null);
  protected link = '';
  protected readonly linkMessages: FieldMessages = {
    required: $localize`:@@donor.verify.input.linkRequired:Vložte odkaz z QR kódu potvrzení.`,
    proofLink: $localize`:@@donor.verify.input.linkInvalid:Tohle není odkaz z QR kódu potvrzení. Musí začínat https://nfnn.cz/overit# a pokračovat číslicemi.`,
  };

  constructor() {
    const hidden = (): void => {
      if (this.document.visibilityState === 'hidden' && this.scan() !== 'idle') {
        this.stopCamera();
        afterNextRender(() => this.focusIfLost(this.scanButton()), { injector: this.injector });
      }
    };
    this.document.addEventListener('visibilitychange', hidden);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', hidden);
      this.stopCamera();
      this.reader.release();
    });
  }

  protected async startScan(): Promise<void> {
    if (this.scan() !== 'idle') {
      return;
    }
    const run = ++this.scanRun;
    this.problem.set(null);
    this.scan.set('starting');
    let stream: MediaStream;
    try {
      stream = await this.device.openCamera();
    } catch (failure: unknown) {
      if (run === this.scanRun) {
        this.scan.set('idle');
        this.problem.set({ way: 'camera', text: cameraProblem(failure) });
      }
      return;
    }
    if (run !== this.scanRun || this.destroyRef.destroyed) {
      stopTracks(stream);
      return;
    }
    this.stream = stream;
    stream
      .getTracks()
      .forEach((track) => track.addEventListener('ended', () => this.cameraFailed(run)));
    this.scan.set('scanning');
    this.limitTimer = setTimeout(() => this.giveUp(run), SCAN_TIME_LIMIT_MS);
    afterNextRender(
      () => {
        const video = this.video()?.nativeElement;
        if (video === undefined || run !== this.scanRun) {
          return;
        }
        this.focusIfLost(this.stopButton());
        this.device.attach(video, stream).catch(() => this.cameraFailed(run));
        this.nextFrame(run);
      },
      { injector: this.injector },
    );
  }

  protected problemOf(way: Way): string | null {
    const problem = this.problem();
    return problem?.way === way ? problem.text : null;
  }

  protected stopScan(): void {
    this.stopCamera();
    this.focusScanButton();
  }

  protected async readFile(file: File): Promise<void> {
    this.problem.set(null);
    if (file.size > LARGEST_FILE_BYTES) {
      this.problem.set({ way: 'file', text: FILE_TOO_LARGE });
      return;
    }
    this.reading.set(true);
    try {
      if (file.type === PDF_TYPE || PDF_NAME.test(file.name)) {
        const fragment = proofFragmentInPdf(new Uint8Array(await file.arrayBuffer()));
        this.handOver(fragment, PDF_WITHOUT_LINK);
        return;
      }
      let image: QrImage;
      try {
        image = await this.device.picture(file);
      } catch (failure: unknown) {
        const text = failure instanceof PictureTooLarge ? PICTURE_TOO_LARGE : FILE_UNREADABLE;
        this.problem.set({ way: 'file', text });
        return;
      }
      this.handOverCodes(await this.reader.read(image), PICTURE_WITHOUT_CODE);
    } catch {
      this.problem.set({ way: 'file', text: FILE_UNREADABLE });
    } finally {
      this.reading.set(false);
    }
  }

  protected verifyLink(form: NgForm): void {
    if (form.invalid) {
      return;
    }
    const fragment = proofFragment(this.link);
    if (fragment !== null) {
      this.handOverFound(fragment);
    }
  }

  private nextFrame(run: number): void {
    this.frameTimer = setTimeout(() => void this.readFrame(run), SCAN_INTERVAL_MS);
  }

  private async readFrame(run: number): Promise<void> {
    const video = this.video()?.nativeElement;
    if (run !== this.scanRun || video === undefined) {
      return;
    }
    let codes: readonly string[];
    try {
      const frame = this.device.frame(video);
      codes = frame === null ? [] : await this.reader.read(frame);
    } catch {
      this.cameraFailed(run);
      return;
    }
    if (run !== this.scanRun) {
      return;
    }
    const fragment = firstProof(codes);
    if (fragment !== null) {
      this.handOverFound(fragment);
      return;
    }
    if (codes.length > 0) {
      this.problem.set({ way: 'camera', text: FOREIGN_CODE });
    }
    this.nextFrame(run);
  }

  private giveUp(run: number): void {
    this.endScan(run, SCAN_GAVE_UP);
  }

  private cameraFailed(run: number): void {
    this.endScan(run, CAMERA_FAILED);
  }

  private endScan(run: number, text: string): void {
    if (run !== this.scanRun) {
      return;
    }
    this.stopCamera();
    this.problem.set({ way: 'camera', text });
    afterNextRender(() => this.focusIfLost(this.scanButton()), { injector: this.injector });
  }

  private handOverCodes(codes: readonly string[], noCode: string): void {
    const fragment = firstProof(codes);
    this.handOver(fragment, codes.length > 0 ? FOREIGN_CODE : noCode);
  }

  private handOver(fragment: string | null, otherwise: string): void {
    if (fragment === null) {
      this.problem.set({ way: 'file', text: otherwise });
      return;
    }
    this.handOverFound(fragment);
  }

  private handOverFound(fragment: string): void {
    if (this.destroyRef.destroyed) {
      return;
    }
    this.stopCamera();
    this.problem.set(null);
    this.found.emit(fragment);
  }

  private stopCamera(): void {
    this.scanRun++;
    for (const timer of [this.frameTimer, this.limitTimer]) {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    this.frameTimer = null;
    this.limitTimer = null;
    if (this.stream !== null) {
      stopTracks(this.stream);
      this.stream = null;
    }
    const video = this.video()?.nativeElement;
    if (video !== undefined) {
      video.srcObject = null;
    }
    this.scan.set('idle');
  }

  private focusScanButton(): void {
    afterNextRender(() => this.scanButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusIfLost(button: ElementRef<HTMLButtonElement> | undefined): void {
    const active = this.document.activeElement;
    if (active === null || active === this.document.body) {
      button?.nativeElement.focus();
    }
  }
}

function firstProof(codes: readonly string[]): string | null {
  for (const code of codes) {
    const fragment = proofFragment(code);
    if (fragment !== null) {
      return fragment;
    }
  }
  return null;
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function cameraProblem(failure: unknown): string {
  const name = failure instanceof DOMException ? failure.name : '';
  if (CAMERA_REFUSALS.includes(name)) {
    return CAMERA_REFUSED;
  }
  return CAMERA_ABSENCES.includes(name) ? CAMERA_MISSING : CAMERA_FAILED;
}
