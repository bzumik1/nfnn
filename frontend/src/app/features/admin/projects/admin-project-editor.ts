import { Location } from '@angular/common';
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
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import {
  CoverImageResponse,
  MAX_BODY_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_PEREX_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_YEAR,
  mediaUrl,
  MIN_YEAR,
  ProjectsApi,
  ProjectRequest,
  ProjectResponse,
  SLUG_PATTERN,
  slugFromText,
} from '../../content/projects-api';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = 'content/project-not-found';
const PREVIEW_WIDTH = 480;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-project-editor',
  imports: [
    LiveNotice,
    RouterLink,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
  ],
  templateUrl: './admin-project-editor.html',
  styleUrl: './admin-project-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProjectEditor {
  private readonly api = inject(ProjectsApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly maxSlugLength = MAX_SLUG_LENGTH;
  protected readonly maxTagLength = MAX_TAG_LENGTH;
  protected readonly maxPerexLength = MAX_PEREX_LENGTH;
  protected readonly maxBodyLength = MAX_BODY_LENGTH;
  protected readonly slugPattern = SLUG_PATTERN;
  protected readonly minYear = MIN_YEAR;
  protected readonly maxYear = MAX_YEAR;

  protected readonly state = signal<LoadState>('loading');
  protected readonly project = signal<ProjectResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly unpublishing = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly coverImage = signal<CoverImageResponse | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly titleMessages = {
    required: $localize`:@@admin.projectEditor.title.required:Vyplňte prosím titulek.`,
    maxlength: $localize`:@@admin.projectEditor.title.tooLong:Titulek může mít nejvíc ${MAX_TITLE_LENGTH}:max: znaků.`,
  };
  protected readonly yearMessages = {
    required: $localize`:@@admin.projectEditor.year.required:Vyplňte prosím rok projektu.`,
    min: $localize`:@@admin.projectEditor.year.min:Rok nemůže být před založením fondu, tedy před ${MIN_YEAR}:min:.`,
    max: $localize`:@@admin.projectEditor.year.max:Zadejte prosím rok nejvýše ${MAX_YEAR}:max:.`,
  };
  protected readonly slugMessages = {
    pattern: $localize`:@@admin.projectEditor.slug.pattern:Adresa smí mít jen malá písmena bez diakritiky, číslice a pomlčky mezi slovy.`,
    maxlength: $localize`:@@admin.projectEditor.slug.tooLong:Adresa může mít nejvíc ${MAX_SLUG_LENGTH}:max: znaků.`,
  };
  protected readonly tagMessages = {
    maxlength: $localize`:@@admin.projectEditor.tag.tooLong:Štítek může mít nejvíc ${MAX_TAG_LENGTH}:max: znaků.`,
  };
  protected readonly perexMessages = {
    required: $localize`:@@admin.projectEditor.perex.required:Vyplňte prosím perex, krátký souhrn pro kartu projektu.`,
    maxlength: $localize`:@@admin.projectEditor.perex.tooLong:Perex může mít nejvíc ${MAX_PEREX_LENGTH}:max: znaků.`,
  };
  protected readonly bodyMessages = {
    required: $localize`:@@admin.projectEditor.body.required:Napište prosím text projektu.`,
    maxlength: $localize`:@@admin.projectEditor.body.tooLong:Text může mít nejvíc ${MAX_BODY_LENGTH}:max: znaků.`,
  };

  protected projectTitle = '';
  protected year: number | null = new Date().getFullYear();
  protected slug = '';
  protected tag = '';
  protected perex = '';
  protected body = '';
  protected publishDate = todayIso();
  private slugEdited = false;

  protected readonly isNew = computed(() => this.project() === null);
  protected readonly isPublished = computed(() => this.project()?.publishedOn != null);
  protected readonly publishedOn = computed(() => {
    const date = this.project()?.publishedOn;
    return date ? formatDonationDate(date) : null;
  });
  protected readonly updatedAt = computed(() => {
    const at = this.project()?.updatedAt;
    return at ? formatBankTime(at) : null;
  });
  protected readonly previewUrl = computed(() => {
    const image = this.coverImage();
    return image ? mediaUrl(image.id, PREVIEW_WIDTH) : null;
  });
  private readonly slugOrDraft = signal('');
  protected readonly publicAddressHint = computed(() => {
    const slug = this.slugOrDraft().trim();
    return slug === ''
      ? $localize`:@@admin.projectEditor.slug.hint.empty:Doplní se z titulku; malá písmena bez diakritiky a pomlčky.`
      : $localize`:@@admin.projectEditor.slug.hint:Projekt bude na nfnn.cz/projekty/${slug}:slug:. Můžete upravit.`;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      this.state.set('ready');
    } else {
      this.load(id);
    }
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(id: string): void {
    this.state.set('loading');
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.show(project);
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
          if (problemTypeEndsWith(failure, NOT_FOUND)) {
            this.router.navigateByUrl('/sprava/projekty');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected retry(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id !== null) {
      this.load(id);
    }
  }

  protected titleChanged(value: string): void {
    this.projectTitle = value;
    if (!this.slugEdited) {
      this.slug = slugFromText(value);
      this.slugOrDraft.set(this.slug);
    }
  }

  protected slugChanged(value: string): void {
    this.slug = value;
    this.slugEdited = value.trim() !== '';
    this.slugOrDraft.set(value);
  }

  protected save(form: NgForm): void {
    if (this.saving()) {
      return;
    }
    this.formError.set(null);
    this.notice.set(null);
    if (form.invalid) {
      return;
    }
    this.saving.set(true);
    const existing = this.project();
    const call = existing
      ? this.api.update(existing.id, this.request())
      : this.api.create(this.request());
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (project) => {
        this.saving.set(false);
        const created = existing === null;
        this.show(project);
        if (created) {
          this.location.replaceState(`/sprava/projekty/${project.id}`);
        }
        this.notice.set({
          kind: 'status',
          text: created
            ? $localize`:@@admin.projectEditor.saved.created:Projekt jsme uložili jako koncept. Na web ho dostanete tlačítkem Zveřejnit.`
            : $localize`:@@admin.projectEditor.saved.updated:Změny jsme uložili.`,
        });
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        this.formError.set(
          describeProblem(
            failure,
            $localize`:@@admin.projectEditor.saved.failed:Projekt se nepodařilo uložit. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploading()) {
      return;
    }
    this.uploadError.set(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.uploadError.set(
        $localize`:@@admin.projectEditor.image.wrongType:Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.`,
      );
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.uploadError.set(
        $localize`:@@admin.projectEditor.image.tooLarge:Fotka je větší než 10 MB. Zmenšete ji prosím a zkuste to znovu.`,
      );
      return;
    }
    this.uploading.set(true);
    this.api
      .uploadImage(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (uploaded) => {
          this.uploading.set(false);
          this.coverImage.set({ id: uploaded.id, url: uploaded.url });
        },
        error: (failure: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(
            describeProblem(
              failure,
              $localize`:@@admin.projectEditor.image.failed:Fotku se nepodařilo nahrát. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected removeImage(): void {
    this.coverImage.set(null);
    this.uploadError.set(null);
  }

  protected publish(): void {
    const existing = this.project();
    if (!existing || this.publishing() || !this.publishDate) {
      return;
    }
    this.notice.set(null);
    this.publishing.set(true);
    this.api
      .publish(existing.id, this.publishDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.publishing.set(false);
          this.project.set(project);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.projectEditor.published:Projekt je na webu s datem ${formatDonationDate(project.publishedOn ?? this.publishDate)}:date:.`,
          });
        },
        error: (failure: unknown) => {
          this.publishing.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.projectEditor.publish.failed:Projekt se nepodařilo zveřejnit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected unpublish(): void {
    const existing = this.project();
    if (!existing || this.unpublishing()) {
      return;
    }
    this.notice.set(null);
    this.unpublishing.set(true);
    this.api
      .unpublish(existing.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.unpublishing.set(false);
          this.project.set(project);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.projectEditor.unpublished:Projekt jsme z webu stáhli. Zůstává tu jako koncept.`,
          });
        },
        error: (failure: unknown) => {
          this.unpublishing.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.projectEditor.unpublish.failed:Projekt se nepodařilo stáhnout z webu. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected askDelete(): void {
    this.notice.set(null);
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  protected delete(): void {
    const existing = this.project();
    if (!existing || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api
      .delete(existing.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.router.navigateByUrl('/sprava/projekty');
        },
        error: (failure: unknown) => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.projectEditor.delete.failed:Projekt se nepodařilo smazat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private show(project: ProjectResponse): void {
    this.project.set(project);
    this.projectTitle = project.title;
    this.year = project.year;
    this.slug = project.slug;
    this.slugEdited = true;
    this.slugOrDraft.set(project.slug);
    this.tag = project.tag ?? '';
    this.perex = project.perex;
    this.body = project.body;
    this.coverImage.set(project.coverImage);
    this.publishDate = project.publishedOn ?? todayIso();
  }

  private request(): ProjectRequest {
    const slug = this.slug.trim();
    const tag = this.tag.trim();
    return {
      title: this.projectTitle.trim(),
      year: this.year ?? 0,
      slug: slug === '' ? null : slug,
      tag: tag === '' ? null : tag,
      perex: this.perex.trim(),
      body: this.body.trim(),
      coverImageId: this.coverImage()?.id ?? null,
    };
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
