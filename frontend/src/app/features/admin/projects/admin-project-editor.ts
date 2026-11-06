import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap, tap } from 'rxjs';
import { FormsModule, NgForm } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { DirtyForms } from '../../../core/updates/dirty-forms';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { FileButton } from '../../../shared/ui/file-button/file-button';
import { ActionBar } from '../../../shared/ui/action-bar/action-bar';
import { MarkdownToolbar } from '../../../shared/ui/markdown/markdown-toolbar';
import {
  CoverImageResponse,
  MAX_BODY_LENGTH,
  MAX_COVER_IMAGE_ALT_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_PEREX_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  PROJECT_CATEGORIES,
  ProjectCategory,
  ProjectsApi,
  ProjectRequest,
  ProjectResponse,
  SLUG_PATTERN,
  slugFromText,
} from '../../content/projects-api';
import { projectCategoryLabel } from '../../content/project-category';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { FocalPoint } from '../../../shared/ui/focal-point/focal-point';
import { PhotoResponse, PhotosApi } from '../../content/photos-api';
import { FocalPointPicker, PreviewShape } from '../focal-point-picker/focal-point-picker';
import { ContentPreview, PreviewContent } from '../content-preview/content-preview';
import { GuardsUnsavedChanges } from '../unsaved-changes/unsaved-changes-guard';
import { UnsavedChangesDialog } from '../unsaved-changes/unsaved-changes-dialog';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import {
  isChangedMeanwhile,
  savedAtInRefusal,
  versionInRefusal,
} from '../../../core/version/row-version';
import {
  ChangedMeanwhileDialog,
  ChangedMeanwhileState,
} from '../changed-meanwhile/changed-meanwhile-dialog';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { formDraft } from '../../../core/drafts/form-draft';
import {
  DRAFT_DISCARDED_TEXT,
  DRAFT_RESUMED_TEXT,
  DraftOffer,
} from '../../../shared/ui/draft-offer/draft-offer';

type LoadState = 'loading' | 'ready' | 'error';
type EditorMode = 'edit' | 'preview';
type Saving = 'save' | 'publish';
type PublishState = 'draft' | 'scheduled' | 'live';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = 'content/project-not-found';
const SLUG_TAKEN = 'content/slug-taken';
const EDIT_TITLE = $localize`:@@admin.projectEditor.pageTitle.edit:Úprava projektu | Správa | Nová naděje – nadační fond`;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NEW_PROJECT_BASE = 'new';

interface ProjectDraftValues {
  readonly title: string;
  readonly year: number | null;
  readonly category: ProjectCategory;
  readonly slug: string;
  readonly tag: string;
  readonly perex: string;
  readonly body: string;
  readonly coverImageAlt: string;
  readonly coverImageId: string | null;
  readonly publishDate: string;
}

const PUBLISH_DATE_MOVED_TEXT = $localize`:@@admin.projectEditor.draft.dateMoved:Datum zveřejnění z rozepsaných úprav už minulo, proto jsme ho posunuli na dnešek.`;

@Component({
  selector: 'app-admin-project-editor',
  imports: [
    LiveNotice,
    RouterLink,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    MarkdownToolbar,
    FileButton,
    UnsavedChangesDialog,
    ChangedMeanwhileDialog,
    ContentPreview,
    ActionBar,
    FocalPointPicker,
    NeedsConnection,
    DraftOffer,
  ],
  templateUrl: './admin-project-editor.html',
  styleUrl: './admin-project-editor.scss',
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProjectEditor implements GuardsUnsavedChanges {
  protected readonly compact = inject(CompactLayout).isCompact;
  private readonly api = inject(ProjectsApi);
  private readonly photos = inject(PhotosApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly pageTitle = inject(Title);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly projectForm = viewChild<NgForm>('projectForm');
  private readonly projectFormElement =
    viewChild<ElementRef<HTMLFormElement>>('projectFormElement');
  private readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveButton');
  private readonly slugInput = viewChild<ElementRef<HTMLInputElement>>('slugInput');
  private readonly editFields = viewChild<ElementRef<HTMLElement>>('editFields');
  private readonly deleteButton = viewChild<ElementRef<HTMLButtonElement>>('deleteButton');
  private readonly deleteCancel = viewChild<ElementRef<HTMLButtonElement>>('deleteCancel');

  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly maxSlugLength = MAX_SLUG_LENGTH;
  protected readonly maxTagLength = MAX_TAG_LENGTH;
  protected readonly maxPerexLength = MAX_PEREX_LENGTH;
  protected readonly maxBodyLength = MAX_BODY_LENGTH;
  protected readonly maxAltLength = MAX_COVER_IMAGE_ALT_LENGTH;
  protected readonly slugPattern = SLUG_PATTERN;
  protected readonly minYear = MIN_YEAR;
  protected readonly maxYear = MAX_YEAR;
  protected readonly categories = PROJECT_CATEGORIES;
  protected readonly categoryLabel = projectCategoryLabel;

  protected readonly state = signal<LoadState>('loading');
  protected readonly changedMeanwhile = signal<ChangedMeanwhileState | null>(null);
  private refusedDelete = false;
  protected readonly project = signal<ProjectResponse | null>(null);
  protected readonly mode = signal<EditorMode>('edit');
  protected readonly preview = signal<PreviewContent | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly deleteNotice = signal<Notice | null>(null);
  protected readonly saving = signal<Saving | null>(null);
  protected readonly unpublishing = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly coverImage = signal<CoverImageResponse | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly askingToLeave = signal(false);
  private readonly edited = signal(false);
  private answerLeave: ((leave: boolean) => void) | null = null;
  private discarded = false;
  private publishRequested = false;

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
    taken: $localize`:@@admin.projectEditor.slug.taken:Tuto adresu už má jiný projekt nebo aktualita. Zvolte prosím jinou.`,
  };
  protected readonly tagMessages = {
    maxlength: $localize`:@@admin.projectEditor.tag.tooLong:Štítek může mít nejvíc ${MAX_TAG_LENGTH}:max: znaků.`,
  };
  protected readonly perexMessages = {
    required: $localize`:@@admin.projectEditor.perex.required:Napište prosím krátký souhrn.`,
    maxlength: $localize`:@@admin.projectEditor.perex.tooLong:Krátký souhrn může mít nejvíc ${MAX_PEREX_LENGTH}:max: znaků.`,
  };
  protected readonly bodyMessages = {
    required: $localize`:@@admin.projectEditor.body.required:Napište prosím text projektu.`,
    maxlength: $localize`:@@admin.projectEditor.body.tooLong:Text může mít nejvíc ${MAX_BODY_LENGTH}:max: znaků.`,
  };
  protected readonly publishDateMessages = {
    required: $localize`:@@admin.projectEditor.publishDate.required:Vyberte prosím datum zveřejnění.`,
  };
  protected readonly altMessages = {
    maxlength: $localize`:@@admin.projectEditor.imageAlt.tooLong:Popis fotky může mít nejvíc ${MAX_COVER_IMAGE_ALT_LENGTH}:max: znaků.`,
  };

  protected projectTitle = '';
  protected year: number | null = new Date().getFullYear();
  protected category: ProjectCategory = 'CHILDREN';
  protected slug = '';
  protected tag = '';
  protected perex = '';
  protected body = '';
  protected coverImageAlt = '';
  protected publishDate = todayIso();
  private readonly routeId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly draft = formDraft<ProjectDraftValues>({
    copy: 'administration',
    key: () => `projects/${this.project()?.id ?? this.routeId ?? 'new'}`,
    values: () => ({
      title: this.projectTitle,
      year: this.year,
      category: this.category,
      slug: this.slug,
      tag: this.tag,
      perex: this.perex,
      body: this.body,
      coverImageAlt: this.coverImageAlt,
      coverImageId: this.coverImage()?.id ?? null,
      publishDate: this.publishDate,
    }),
    apply: (values) => this.applyDraft(values),
  });
  private slugEdited = false;
  private publishDateMoved = false;

  protected readonly isNew = computed(() => this.project() === null);
  protected readonly isPublished = computed(() => this.project()?.publishedOn != null);
  protected readonly previewing = computed(() => this.mode() === 'preview');
  protected readonly busy = computed(() => this.saving() !== null || this.unpublishing());
  protected readonly publishState = computed<PublishState>(() => {
    const project = this.project();
    if (project?.publishedOn == null) {
      return 'draft';
    }
    return project.live ? 'live' : 'scheduled';
  });
  protected readonly publishedOn = computed(() => {
    const date = this.project()?.publishedOn;
    return date ? formatDonationDate(date) : null;
  });
  protected readonly updatedAt = computed(() => {
    const at = this.project()?.updatedAt;
    return at ? formatBankTime(at) : null;
  });
  protected readonly coverUnsaved = computed(
    () => (this.coverImage()?.id ?? null) !== (this.project()?.coverImage?.id ?? null),
  );
  protected readonly focalPointUnsaved = computed(() => {
    const cover = this.coverImage();
    if (!cover) {
      return false;
    }
    const saved = this.project()?.coverImage;
    const savedPoint = saved?.id === cover.id ? saved.focalPoint : null;
    return !samePoint(cover.focalPoint, savedPoint);
  });
  protected readonly unsaved = computed(
    () => this.edited() || this.coverUnsaved() || this.focalPointUnsaved(),
  );
  protected readonly focalShapes: readonly PreviewShape[] = [
    {
      shape: 'projectCard',
      label: $localize`:@@admin.projectEditor.focalPoint.card:Karta v Projektech`,
    },
    {
      shape: 'storyTile',
      label: $localize`:@@admin.projectEditor.focalPoint.story:Příběh roku v Aktualitách`,
    },
    {
      shape: 'articleTop',
      label: $localize`:@@admin.projectEditor.focalPoint.top:Nahoře v článku`,
    },
  ];
  protected readonly publicUrl = computed(() => {
    const project = this.project();
    return project?.live ? `/projekty/${project.slug}` : null;
  });
  protected readonly publishDateHint = computed(() => {
    switch (this.publishState()) {
      case 'live':
        return $localize`:@@admin.projectEditor.publishDate.hint.live:Projekt je na webu, změny se ukážou hned. Projekty na stejném místě řazení ukazuje web od naposledy zveřejněného.`;
      case 'scheduled':
        return $localize`:@@admin.projectEditor.publishDate.hint.scheduled:Na web se projekt dostane ${this.publishedOn()}:date:, do té doby ho vidíte jen vy. Projekty na stejném místě řazení ukazuje web od naposledy zveřejněného.`;
      default:
        return $localize`:@@admin.projectEditor.publishDate.hint.draft:Projekt zatím vidíte jen vy. Tlačítko Uložit a zveřejnit ho pustí na web s tímto datem, s pozdějším datem až ten den.`;
    }
  });
  private readonly slugOrDraft = signal('');
  protected readonly publicAddressHint = computed(() => {
    const slug = this.slugOrDraft().trim();
    const address =
      slug === ''
        ? $localize`:@@admin.projectEditor.slug.hint.empty:Doplní se z titulku; malá písmena bez diakritiky a pomlčky.`
        : $localize`:@@admin.projectEditor.slug.hint:Projekt bude na nfnn.cz/projekty/${slug}:slug:. Můžete upravit.`;
    const saved = this.project();
    if (saved?.publishedOn == null || slug === saved.slug) {
      return address;
    }
    return `${address} ${$localize`:@@admin.projectEditor.slug.hint.oldLink:Pozor: dosavadní odkaz nfnn.cz/projekty/${saved.slug}:oldSlug: po uložení přestane fungovat.`}`;
  });
  protected readonly altMissing = computed(() => {
    const cover = this.project()?.coverImage;
    return cover != null && cover.alt === null && !this.coverUnsaved();
  });

  constructor() {
    this.destroyRef.onDestroy(inject(DirtyForms).register(() => !this.discarded && this.unsaved()));
    this.destroyRef.onDestroy(() => this.answerLeave?.(false));
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      this.state.set('ready');
      this.draft.ready(NEW_PROJECT_BASE);
    } else {
      this.load(id);
    }
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    effect((onCleanup) => {
      const form = this.projectForm();
      if (form) {
        const edits = form.form.events.subscribe(() => this.edited.set(form.dirty === true));
        onCleanup(() => edits.unsubscribe());
      }
    });
  }

  protected load(id: string, loaded?: () => void): void {
    this.state.set('loading');
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.show(project);
          this.state.set('ready');
          this.draft.ready(project.version);
          loaded?.();
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

  canLeave(): boolean | Promise<boolean> {
    if (this.discarded || !this.unsaved()) {
      return true;
    }
    this.answerLeave?.(false);
    return new Promise((resolve) => {
      this.answerLeave = resolve;
      this.askingToLeave.set(true);
    });
  }

  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.discarded && this.unsaved()) {
      event.preventDefault();
    }
  }

  protected draftSavedAt(savedAt: string): string {
    return formatBankTime(savedAt);
  }

  protected resumeDraft(): void {
    this.draft.resume();
    const stale = this.draft.staleVersion();
    if (stale !== null) {
      this.project.update((saved) => (saved ? { ...saved, version: stale } : saved));
    }
    this.notice.set({
      kind: 'status',
      text: this.publishDateMoved
        ? `${DRAFT_RESUMED_TEXT} ${PUBLISH_DATE_MOVED_TEXT}`
        : DRAFT_RESUMED_TEXT,
    });
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected discardDraft(): void {
    this.draft.discard();
    this.notice.set({ kind: 'status', text: DRAFT_DISCARDED_TEXT });
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  private applyDraft(values: ProjectDraftValues): void {
    this.projectTitle = values.title;
    this.year = values.year;
    this.category = values.category;
    this.slug = values.slug;
    this.slugEdited = values.slug.trim() !== '';
    this.slugOrDraft.set(values.slug);
    this.tag = values.tag;
    this.perex = values.perex;
    this.body = values.body;
    if (values.coverImageId === (this.coverImage()?.id ?? null)) {
      this.coverImageAlt = values.coverImageAlt;
    }
    const today = todayIso();
    this.publishDateMoved = !this.isPublished() && values.publishDate < today;
    this.publishDate = this.publishDateMoved ? today : values.publishDate;
    this.projectForm()?.form.markAsDirty();
    this.edited.set(true);
  }

  protected leaveWithoutSaving(): void {
    this.draft.left();
    this.closeLeaveQuestion(true);
  }

  protected stay(): void {
    this.closeLeaveQuestion(false);
  }

  protected stayAndSave(): void {
    this.closeLeaveQuestion(false);
    this.publishRequested = false;
    afterNextRender(
      () => {
        const form = this.projectFormElement()?.nativeElement;
        form?.requestSubmit();
        if (form && !form.contains(document.activeElement)) {
          this.saveButton()?.nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
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

  protected edit(): void {
    this.mode.set('edit');
  }

  protected showPreview(): void {
    this.preview.set({ kind: 'project', item: this.previewProject() });
    this.mode.set('preview');
  }

  protected requestPublish(): void {
    this.publishRequested = true;
  }

  protected submit(form: NgForm): void {
    const publish = this.publishRequested || this.isPublished();
    this.publishRequested = false;
    if (this.busy()) {
      return;
    }
    this.notice.set(null);
    const dateControl = form.controls['publishDate'];
    dateControl?.updateValueAndValidity();
    const date = this.publishDate;
    if (publish && !date) {
      dateControl?.setErrors({ required: true });
      dateControl?.markAsTouched();
    }
    if (form.invalid) {
      this.showFirstInvalid();
      return;
    }
    const existing = this.project();
    const needsPublish = publish && existing?.publishedOn !== date;
    this.saving.set(publish ? 'publish' : 'save');
    if (existing && needsPublish && !this.unsaved()) {
      this.sendPublish(existing.id, date, existing.version ?? '');
      return;
    }
    if (existing && !this.edited() && !this.coverUnsaved() && this.focalPointUnsaved()) {
      this.placeFocalPoint()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            if (needsPublish) {
              this.sendPublish(existing.id, date, existing.version ?? '');
              return;
            }
            this.saving.set(null);
            this.notice.set({ kind: 'status', text: this.savedText(existing, false) });
          },
          error: (failure: unknown) => {
            this.saving.set(null);
            this.saveFailed(failure);
          },
        });
      return;
    }
    const request = this.request();
    const call = this.placeFocalPoint().pipe(
      switchMap(() =>
        existing
          ? this.api.update(existing.id, request, existing.version ?? '')
          : this.api.create(request),
      ),
    );
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (project) => {
        this.saved(project, existing === null);
        if (needsPublish) {
          this.publishDate = date;
          this.sendPublish(project.id, date, project.version ?? '');
          return;
        }
        this.saving.set(null);
        this.notice.set({ kind: 'status', text: this.savedText(project, existing === null) });
      },
      error: (failure: unknown) => {
        this.saving.set(null);
        if (existing && isChangedMeanwhile(failure)) {
          this.changedMeanwhile.set({
            version: versionInRefusal(failure),
            draft: true,
            overwrite: true,
            publish,
            savedAt: savedAtInRefusal(failure),
            fromDraft: this.draft.resumedStale(),
          });
          return;
        }
        this.saveFailed(failure);
      },
    });
  }

  protected upload(file: File): void {
    if (this.uploading()) {
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
          this.coverImage.set({ id: uploaded.id, url: uploaded.url, alt: null, focalPoint: null });
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

  protected focalPointChanged(point: FocalPoint | null): void {
    this.coverImage.update((cover) => cover && { ...cover, focalPoint: point });
  }

  private placeFocalPoint(): Observable<unknown> {
    const cover = this.coverImage();
    return cover && this.focalPointUnsaved()
      ? this.photos
          .placeFocalPoint(cover.id, cover.focalPoint)
          .pipe(tap((photo) => this.keepPlacedPoint(photo)))
      : of(null);
  }

  private keepPlacedPoint(photo: PhotoResponse): void {
    this.project.update((saved) =>
      saved?.coverImage?.id === photo.id
        ? { ...saved, coverImage: { ...saved.coverImage, focalPoint: photo.focalPoint } }
        : saved,
    );
  }

  protected removeImage(): void {
    this.coverImage.set(null);
    this.coverImageAlt = '';
    this.uploadError.set(null);
  }

  private sendPublish(id: string, date: string, version: string): void {
    this.api
      .publish(id, date, version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.saving.set(null);
          this.project.set(project);
          this.draft.saved(project.version);
          const on = formatDonationDate(project.publishedOn ?? date);
          this.notice.set({
            kind: 'status',
            text: project.live
              ? $localize`:@@admin.projectEditor.published:Projekt je na webu s datem ${formatDonationDate(project.publishedOn ?? date)}:date:.`
              : $localize`:@@admin.projectEditor.scheduled:Projekt se na webu ukáže ${on}:date:.`,
          });
        },
        error: (failure: unknown) => {
          this.saving.set(null);
          if (isChangedMeanwhile(failure)) {
            this.changedMeanwhile.set(this.actionRefused(failure));
            return;
          }
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
    if (!existing || this.busy()) {
      return;
    }
    this.notice.set(null);
    this.unpublishing.set(true);
    this.api
      .unpublish(existing.id, existing.version ?? '')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.unpublishing.set(false);
          this.project.set(project);
          this.publishDate = todayIso();
          if (this.unsaved()) {
            this.draft.rebased(project.version);
          } else {
            this.draft.saved(project.version);
          }
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.projectEditor.unpublished:Projekt jsme z webu stáhli. Zůstává tu jako koncept.`,
          });
        },
        error: (failure: unknown) => {
          this.unpublishing.set(false);
          if (isChangedMeanwhile(failure)) {
            this.changedMeanwhile.set(this.actionRefused(failure));
            return;
          }
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
    this.deleteNotice.set(null);
    this.confirmingDelete.set(true);
    afterNextRender(() => this.deleteCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    this.focusDeleteButton();
  }

  protected delete(): void {
    const existing = this.project();
    if (!existing || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api
      .delete(existing.id, existing.version ?? '')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.discarded = true;
          this.draft.left();
          this.router.navigateByUrl('/sprava/projekty', { state: { deleted: existing.title } });
        },
        error: (failure: unknown) => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          if (isChangedMeanwhile(failure)) {
            this.refusedDelete = true;
            this.changedMeanwhile.set(this.actionRefused(failure));
            return;
          }
          this.deleteNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.projectEditor.delete.failed:Projekt se nepodařilo smazat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusDeleteButton();
        },
      });
  }

  protected overwriteAfterChange(): void {
    this.refusedDelete = false;
    const changed = this.changedMeanwhile();
    const version = changed?.version;
    const form = this.projectForm();
    this.changedMeanwhile.set(null);
    if (!changed || !version || !form) {
      return;
    }
    this.publishRequested = changed.publish;
    this.project.update((saved) => (saved ? { ...saved, version } : saved));
    this.draft.overwriteConfirmed();
    this.submit(form);
  }

  protected reloadAfterChange(): void {
    this.refusedDelete = false;
    const saved = this.project();
    const discardedEdits = this.changedMeanwhile()?.draft === true;
    this.changedMeanwhile.set(null);
    if (!saved) {
      return;
    }
    if (discardedEdits) {
      this.draft.discard();
    }
    this.projectForm()?.form.markAsPristine();
    this.edited.set(false);
    this.load(saved.id, () => {
      this.notice.set({
        kind: 'status',
        text: discardedEdits
          ? $localize`:@@admin.projectEditor.reloaded.discarded:Vaše úpravy jsme zahodili a načetli novější verzi projektu.`
          : $localize`:@@admin.projectEditor.reloaded:Načetli jsme aktuální stav projektu. Zkontrolujte ho a rozhodněte znovu.`,
      });
      afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    });
  }

  private actionRefused(failure: unknown): ChangedMeanwhileState {
    return {
      version: null,
      draft: this.unsaved(),
      overwrite: false,
      publish: false,
      savedAt: savedAtInRefusal(failure),
    };
  }

  protected keepDraftAfterChange(): void {
    this.changedMeanwhile.set(null);
    if (this.refusedDelete) {
      this.refusedDelete = false;
      this.focusDeleteButton();
    }
  }

  private focusDeleteButton(): void {
    afterNextRender(() => this.deleteButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private closeLeaveQuestion(leave: boolean): void {
    this.askingToLeave.set(false);
    this.discarded ||= leave;
    const answer = this.answerLeave;
    this.answerLeave = null;
    answer?.(leave);
  }

  private saved(project: ProjectResponse, created: boolean): void {
    this.show(project);
    this.projectForm()?.form.markAsPristine();
    this.edited.set(false);
    this.draft.saved(project.version);
    if (created) {
      this.location.replaceState(`/sprava/projekty/${project.id}`);
      this.pageTitle.setTitle(EDIT_TITLE);
    }
  }

  private saveFailed(failure: unknown): void {
    if (problemTypeEndsWith(failure, SLUG_TAKEN)) {
      const control = this.projectForm()?.controls['slug'];
      control?.setErrors({ taken: true });
      control?.markAsTouched();
      this.mode.set('edit');
      afterNextRender(() => this.slugInput()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    this.notice.set({
      kind: 'alert',
      text: describeProblem(
        failure,
        $localize`:@@admin.projectEditor.saved.failed:Projekt se nepodařilo uložit. Zkuste to prosím znovu.`,
      ),
    });
  }

  private showFirstInvalid(): void {
    this.mode.set('edit');
    afterNextRender(
      () =>
        this.editFields()
          ?.nativeElement.querySelector<HTMLElement>('.form-control.ng-invalid')
          ?.focus(),
      { injector: this.injector },
    );
  }

  private savedText(project: ProjectResponse, created: boolean): string {
    if (created) {
      return $localize`:@@admin.projectEditor.saved.created:Projekt jsme uložili jako koncept. Na web ho dostanete tlačítkem Uložit a zveřejnit.`;
    }
    if (project.publishedOn === null) {
      return $localize`:@@admin.projectEditor.saved.updated:Změny jsme uložili.`;
    }
    return project.live
      ? $localize`:@@admin.projectEditor.saved.live:Změny jsme uložili a na webu už jsou.`
      : $localize`:@@admin.projectEditor.saved.scheduled:Změny jsme uložili. Projekt se na webu ukáže ${formatDonationDate(project.publishedOn)}:date:.`;
  }

  private previewProject(): ProjectResponse {
    const saved = this.project();
    const request = this.request();
    const cover = this.coverImage();
    return {
      id: saved?.id ?? '',
      slug: request.slug ?? slugFromText(request.title),
      title: request.title,
      year: request.year,
      category: request.category,
      tag: request.tag,
      perex: request.perex,
      body: request.body,
      coverImage: cover ? { ...cover, alt: request.coverImageAlt } : null,
      publishedOn: this.publishDate || todayIso(),
      live: true,
      createdAt: saved?.createdAt ?? '',
      updatedAt: saved?.updatedAt ?? '',
    };
  }

  private show(project: ProjectResponse): void {
    this.project.set(project);
    this.projectTitle = project.title;
    this.year = project.year;
    this.category = project.category;
    this.slug = project.slug;
    this.slugEdited = true;
    this.slugOrDraft.set(project.slug);
    this.tag = project.tag ?? '';
    this.perex = project.perex;
    this.body = project.body;
    this.coverImage.set(project.coverImage);
    this.coverImageAlt = project.coverImage?.alt ?? '';
    this.publishDate = project.publishedOn ?? (this.publishDate || todayIso());
  }

  private request(): ProjectRequest {
    const slug = this.slug.trim();
    const tag = this.tag.trim();
    const alt = this.coverImageAlt.trim();
    return {
      title: this.projectTitle.trim(),
      year: this.year ?? 0,
      category: this.category,
      slug: slug === '' ? null : slug,
      tag: tag === '' ? null : tag,
      perex: this.perex.trim(),
      body: this.body.trim(),
      coverImageId: this.coverImage()?.id ?? null,
      coverImageAlt: this.coverImage() && alt !== '' ? alt : null,
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

function samePoint(a: FocalPoint | null, b: FocalPoint | null): boolean {
  return a?.x === b?.x && a?.y === b?.y;
}
