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
  AboutApi,
  AboutPhotoResponse,
  AboutRequest,
  MAX_ABOUT_CAPTION_LENGTH,
  MAX_ABOUT_PHOTO_ALT_LENGTH,
} from '../../content/about-api';
import { MAX_IMAGE_BYTES, NewsApi } from '../../content/news-api';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';

type LoadState = 'loading' | 'ready' | 'error';

interface ChosenPhoto {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly focalPoint: FocalPoint | null;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SAVED = $localize`:@@admin.about.saved:Uloženo. Fotka je na webu v sekci O nás.`;
const SAVE_FAILED = $localize`:@@admin.about.save.failed:Fotku se nepodařilo uložit. Zkuste to prosím znovu.`;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-about',
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
  templateUrl: './admin-about.html',
  styleUrl: './admin-about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAbout {
  private readonly api = inject(AboutApi);
  private readonly media = inject(NewsApi);
  private readonly photos = inject(PhotosApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly aboutForm = viewChild<NgForm>('aboutForm');
  private readonly removeButton = viewChild<ElementRef<HTMLButtonElement>>('removeButton');
  private readonly removeCancel = viewChild<ElementRef<HTMLButtonElement>>('removeCancel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly maxAltLength = MAX_ABOUT_PHOTO_ALT_LENGTH;
  protected readonly maxCaptionLength = MAX_ABOUT_CAPTION_LENGTH;

  protected readonly state = signal<LoadState>('loading');
  protected readonly saved = signal<AboutPhotoResponse | null>(null);
  protected readonly chosen = signal<ChosenPhoto | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly removeNotice = signal<Notice | null>(null);

  protected photoAlt = '';
  protected caption = '';

  protected readonly altMessages = {
    maxlength: $localize`:@@admin.about.alt.tooLong:Popis pro čtečky může mít nejvíc ${MAX_ABOUT_PHOTO_ALT_LENGTH}:max: znaků.`,
  };
  protected readonly captionMessages = {
    maxlength: $localize`:@@admin.about.caption.tooLong:Popisek může mít nejvíc ${MAX_ABOUT_CAPTION_LENGTH}:max: znaků.`,
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
  protected readonly focalPointHint = $localize`:@@admin.about.focalPoint.hint:Web dnes ukazuje celou fotku, takže bod zatím nic neořízne; použije se, až sekce O nás začne fotku ořezávat.`;
  protected readonly busy = computed(() => this.saving() || this.removing() || this.uploading());

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (about) => {
          this.show(about.photo);
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
        $localize`:@@admin.about.photo.wrongType:Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.`,
      );
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.uploadError.set(
        $localize`:@@admin.about.photo.tooLarge:Fotka je větší než 10 MB. Zmenšete ji prosím a zkuste to znovu.`,
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
              $localize`:@@admin.about.photo.failed:Fotku se nepodařilo nahrát. Zkuste to prosím znovu.`,
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
    this.send({ photoId: photo.id, photoAlt: text(this.photoAlt), caption: text(this.caption) });
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
      .save({ photoId: null, photoAlt: null, caption: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (about) => {
          this.removing.set(false);
          this.confirmingRemoval.set(false);
          this.show(about.photo);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.about.removed:Fotku jsme z webu odebrali a smazali. Sekce O nás ukazuje zase ilustrační fotku.`,
          });
          afterNextRender(
            () => this.host.nativeElement.querySelector<HTMLInputElement>('#about-photo')?.focus(),
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
              $localize`:@@admin.about.remove.failed:Fotku se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusRemoveButton();
        },
      });
  }

  private send(request: AboutRequest): void {
    this.placeFocalPoint()
      .pipe(
        switchMap(() => this.api.save(request)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (about) => {
          this.saving.set(false);
          this.show(about.photo);
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

  private show(photo: AboutPhotoResponse | null): void {
    this.saved.set(photo);
    this.chosen.set(
      photo
        ? { id: photo.id, width: photo.width, height: photo.height, focalPoint: photo.focalPoint }
        : null,
    );
    this.photoAlt = photo?.alt ?? '';
    this.caption = photo?.caption ?? '';
    this.aboutForm()?.form.markAsPristine();
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
