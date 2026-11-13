/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap, tap } from 'rxjs';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { FocalPoint } from '../../../shared/ui/focal-point/focal-point';
import { PhotoResponse, PhotosApi } from '../../content/photos-api';
import { FocalPointPicker } from '../focal-point-picker/focal-point-picker';
import {
  DonateBandApi,
  DonateBandPhotoResponse,
  DonateBandRequest,
  MAX_DONATE_BAND_PHOTO_ALT_LENGTH,
} from '../../content/donate-band-api';
import { PreviewShape } from '../focal-point-picker/focal-point-picker';
import { MAX_IMAGE_BYTES, NewsApi } from '../../content/news-api';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { AdministrationPageReads } from '../device-copy/administration-page-reads';

type LoadState = 'loading' | 'ready' | 'error';

interface ChosenPhoto {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly focalPoint: FocalPoint | null;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SAVED = $localize`:@@admin.donateBand.saved:Uloženo. Fotka je na webu v pruhu Přispět.`;
const SAVE_FAILED = $localize`:@@admin.donateBand.save.failed:Fotku se nepodařilo uložit. Zkuste to prosím znovu.`;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-donate-band',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    FileButton,
    LiveNotice,
    FocalPointPicker,
    NeedsConnection,
  ],
  templateUrl: './admin-donate-band.html',
  styleUrl: './admin-donate-band.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonateBand {
  private readonly api = inject(DonateBandApi);
  private readonly reads = inject(AdministrationPageReads);
  private readonly media = inject(NewsApi);
  private readonly photos = inject(PhotosApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly bandForm = viewChild<NgForm>('bandForm');
  private readonly removeButton = viewChild<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly removeCancel = viewChild<ElementRef<HTMLButtonElement>>('removeCancel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly maxAltLength = MAX_DONATE_BAND_PHOTO_ALT_LENGTH;
  protected readonly previewShapes: readonly PreviewShape[] = [
    { shape: 'band', label: $localize`:@@admin.donateBand.preview.wide:Na počítači` },
    { shape: 'bandPhone', label: $localize`:@@admin.donateBand.preview.phone:Na telefonu` },
  ];

  protected readonly state = signal<LoadState>('loading');
  protected readonly saved = signal<DonateBandPhotoResponse | null>(null);
  protected readonly chosen = signal<ChosenPhoto | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly removeNotice = signal<Notice | null>(null);

  protected photoAlt = '';

  protected readonly altMessages = {
    maxlength: $localize`:@@admin.donateBand.alt.tooLong:Popis pro čtečky může mít nejvíc ${MAX_DONATE_BAND_PHOTO_ALT_LENGTH}:max: znaků.`,
  };

  protected readonly photoUnsaved = computed(
    () => (this.chosen()?.id ?? null) !== (this.saved()?.id ?? null),
  );
  protected readonly focalPointUnsaved = computed(() => {
    const photo = this.chosen();
    if (!photo) {
      return false;
    }
    const saved = this.saved();
    const savedPoint = saved?.id === photo.id ? saved.focalPoint : null;
    return photo.focalPoint?.x !== savedPoint?.x || photo.focalPoint?.y !== savedPoint?.y;
  });
  protected readonly busy = computed(() => this.saving() || this.removing() || this.uploading());

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.reads
      .donateBand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (band) => {
          this.show(band.photo);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected upload(file: File): void {
    if (this.uploading()) {
      return;
    }
    this.uploadError.set(null);
    this.notice.set(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.uploadError.set(
        $localize`:@@admin.donateBand.photo.wrongType:Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.`,
      );
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.uploadError.set(
        $localize`:@@admin.donateBand.photo.tooLarge:Fotka je větší než 10 MB. Zmenšete ji prosím a zkuste to znovu.`,
      );
      return;
    }
    this.uploading.set(true);
    this.media
      .uploadImage(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (uploaded) => {
          this.uploading.set(false);
          this.chosen.set({
            id: uploaded.id,
            width: uploaded.width,
            height: uploaded.height,
            focalPoint: null,
          });
        },
        error: (failure: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(
            describeProblem(
              failure,
              $localize`:@@admin.donateBand.photo.failed:Fotku se nepodařilo nahrát. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected submit(form: NgForm): void {
    const photo = this.chosen();
    if (this.busy() || photo === null) {
      return;
    }
    this.notice.set(null);
    if (form.invalid) {
      return;
    }
    this.saving.set(true);
    if (!this.photoUnsaved() && form.pristine && this.focalPointUnsaved()) {
      this.placeOnlyFocalPoint();
      return;
    }
    this.send({ photoId: photo.id, photoAlt: text(this.photoAlt) });
  }

  protected focalPointChanged(point: FocalPoint | null): void {
    this.chosen.update((photo) => photo && { ...photo, focalPoint: point });
  }

  protected askRemoval(): void {
    this.removeNotice.set(null);
    this.confirmingRemoval.set(true);
    afterNextRender(() => this.removeCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelRemoval(): void {
    this.confirmingRemoval.set(false);
    this.focusRemoveButton();
  }

  protected remove(): void {
    if (this.busy()) {
      return;
    }
    this.notice.set(null);
    this.removing.set(true);
    this.api
      .save({ photoId: null, photoAlt: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (band) => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.show(band.photo);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.donateBand.removed:Fotku jsme z webu odebrali a smazali. Pruh Přispět ukazuje zase ilustrační fotku.`,
          });
          afterNextRender(
            () =>
              this.host.nativeElement
                .querySelector<HTMLInputElement>('#donate-band-photo')
                ?.focus(),
            { injector: this.injector },
          );
        },
        error: (failure: unknown) => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.removeNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.donateBand.remove.failed:Fotku se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusRemoveButton();
        },
      });
  }

  private send(request: DonateBandRequest): void {
    this.placeFocalPoint()
      .pipe(
        switchMap(() => this.api.save(request)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (band) => {
          this.saving.set(false);
          this.show(band.photo);
          this.notice.set({
            kind: 'status',
            text: SAVED,
          });
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(failure, SAVE_FAILED),
          });
        },
      });
  }

  private placeOnlyFocalPoint(): void {
    this.placeFocalPoint()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set({ kind: 'status', text: SAVED });
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.notice.set({ kind: 'alert', text: describeProblem(failure, SAVE_FAILED) });
        },
      });
  }

  private placeFocalPoint(): Observable<unknown> {
    const photo = this.chosen();
    return photo && this.focalPointUnsaved()
      ? this.photos
          .placeFocalPoint(photo.id, photo.focalPoint)
          .pipe(tap((placed) => this.keepPlacedPoint(placed)))
      : of(null);
  }

  private keepPlacedPoint(placed: PhotoResponse): void {
    this.saved.update((saved) =>
      saved?.id === placed.id ? { ...saved, focalPoint: placed.focalPoint } : saved,
    );
  }

  private show(photo: DonateBandPhotoResponse | null): void {
    this.saved.set(photo);
    this.chosen.set(
      photo
        ? { id: photo.id, width: photo.width, height: photo.height, focalPoint: photo.focalPoint }
        : null,
    );
    this.photoAlt = photo?.alt ?? '';
    this.bandForm()?.form.markAsPristine();
  }

  private focusRemoveButton(): void {
    afterNextRender(() => this.removeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
