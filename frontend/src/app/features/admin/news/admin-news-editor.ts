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
import { FormsModule, NgForm } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
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
  mediaUrl,
  NewsApi,
  NewsArticleRequest,
  NewsArticleResponse,
  SLUG_PATTERN,
  slugFromText,
} from '../../content/news-api';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { ContentPreview, PreviewContent } from '../content-preview/content-preview';
import { GuardsUnsavedChanges } from '../unsaved-changes/unsaved-changes-guard';
import { UnsavedChangesDialog } from '../unsaved-changes/unsaved-changes-dialog';

type LoadState = 'loading' | 'ready' | 'error';
type EditorMode = 'edit' | 'preview';
type Saving = 'save' | 'publish';
type PublishState = 'draft' | 'scheduled' | 'live';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = 'content/news-not-found';
const SLUG_TAKEN = 'content/slug-taken';
const EDIT_TITLE = $localize`:@@admin.newsEditor.pageTitle.edit:Úprava aktuality | Správa | Nová naděje – nadační fond`;
const PREVIEW_WIDTH = 480;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-news-editor',
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
    ContentPreview,
    ActionBar,
  ],
  templateUrl: './admin-news-editor.html',
  styleUrl: './admin-news-editor.scss',
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNewsEditor implements GuardsUnsavedChanges {
  private readonly api = inject(NewsApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly pageTitle = inject(Title);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly articleForm = viewChild<NgForm>('articleForm');
  private readonly articleFormElement =
    viewChild<ElementRef<HTMLFormElement>>('articleFormElement');
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

  protected readonly state = signal<LoadState>('loading');
  protected readonly article = signal<NewsArticleResponse | null>(null);
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
    required: $localize`:@@admin.newsEditor.title.required:Vyplňte prosím titulek.`,
    maxlength: $localize`:@@admin.newsEditor.title.tooLong:Titulek může mít nejvíc ${MAX_TITLE_LENGTH}:max: znaků.`,
  };
  protected readonly slugMessages = {
    pattern: $localize`:@@admin.newsEditor.slug.pattern:Adresa smí mít jen malá písmena bez diakritiky, číslice a pomlčky mezi slovy.`,
    maxlength: $localize`:@@admin.newsEditor.slug.tooLong:Adresa může mít nejvíc ${MAX_SLUG_LENGTH}:max: znaků.`,
    taken: $localize`:@@admin.newsEditor.slug.taken:Tuto adresu už má jiná aktualita nebo projekt. Zvolte prosím jinou.`,
  };
  protected readonly tagMessages = {
    maxlength: $localize`:@@admin.newsEditor.tag.tooLong:Štítek může mít nejvíc ${MAX_TAG_LENGTH}:max: znaků.`,
  };
  protected readonly perexMessages = {
    required: $localize`:@@admin.newsEditor.perex.required:Napište prosím krátký souhrn.`,
    maxlength: $localize`:@@admin.newsEditor.perex.tooLong:Krátký souhrn může mít nejvíc ${MAX_PEREX_LENGTH}:max: znaků.`,
  };
  protected readonly bodyMessages = {
    required: $localize`:@@admin.newsEditor.body.required:Napište prosím text aktuality.`,
    maxlength: $localize`:@@admin.newsEditor.body.tooLong:Text může mít nejvíc ${MAX_BODY_LENGTH}:max: znaků.`,
  };
  protected readonly publishDateMessages = {
    required: $localize`:@@admin.newsEditor.publishDate.required:Vyberte prosím datum zveřejnění.`,
  };
  protected readonly altMessages = {
    maxlength: $localize`:@@admin.newsEditor.imageAlt.tooLong:Popis fotky může mít nejvíc ${MAX_COVER_IMAGE_ALT_LENGTH}:max: znaků.`,
  };

  protected articleTitle = '';
  protected slug = '';
  protected tag = '';
  protected perex = '';
  protected body = '';
  protected coverImageAlt = '';
  protected publishDate = todayIso();
  private slugEdited = false;

  protected readonly isNew = computed(() => this.article() === null);
  protected readonly isPublished = computed(() => this.article()?.publishedOn != null);
  protected readonly previewing = computed(() => this.mode() === 'preview');
  protected readonly busy = computed(() => this.saving() !== null || this.unpublishing());
  protected readonly publishState = computed<PublishState>(() => {
    const article = this.article();
    if (article?.publishedOn == null) {
      return 'draft';
    }
    return article.live ? 'live' : 'scheduled';
  });
  protected readonly publishedOn = computed(() => {
    const date = this.article()?.publishedOn;
    return date ? formatDonationDate(date) : null;
  });
  protected readonly updatedAt = computed(() => {
    const at = this.article()?.updatedAt;
    return at ? formatBankTime(at) : null;
  });
  protected readonly coverUnsaved = computed(
    () => (this.coverImage()?.id ?? null) !== (this.article()?.coverImage?.id ?? null),
  );
  protected readonly unsaved = computed(() => this.edited() || this.coverUnsaved());
  protected readonly publicUrl = computed(() => {
    const article = this.article();
    return article?.live ? `/aktuality/${article.slug}` : null;
  });
  protected readonly publishDateHint = computed(() => {
    switch (this.publishState()) {
      case 'live':
        return $localize`:@@admin.newsEditor.publishDate.hint.live:Aktualita je na webu, změny se ukážou hned. Web řadí aktuality podle data zveřejnění.`;
      case 'scheduled':
        return $localize`:@@admin.newsEditor.publishDate.hint.scheduled:Na web se aktualita dostane ${this.publishedOn()}:date:, do té doby ji vidíte jen vy. Web řadí aktuality podle data zveřejnění.`;
      default:
        return $localize`:@@admin.newsEditor.publishDate.hint.draft:Aktualitu zatím vidíte jen vy. Tlačítko Uložit a zveřejnit ji pustí na web s tímto datem, s pozdějším datem až ten den.`;
    }
  });
  protected readonly previewUrl = computed(() => {
    const image = this.coverImage();
    return image ? mediaUrl(image.id, PREVIEW_WIDTH) : null;
  });
  private readonly slugOrDraft = signal('');
  protected readonly publicAddressHint = computed(() => {
    const slug = this.slugOrDraft().trim();
    const address =
      slug === ''
        ? $localize`:@@admin.newsEditor.slug.hint.empty:Doplní se z titulku; malá písmena bez diakritiky a pomlčky.`
        : $localize`:@@admin.newsEditor.slug.hint:Aktualita bude na nfnn.cz/aktuality/${slug}:slug:. Můžete upravit.`;
    const saved = this.article();
    if (saved?.publishedOn == null || slug === saved.slug) {
      return address;
    }
    return `${address} ${$localize`:@@admin.newsEditor.slug.hint.oldLink:Pozor: dosavadní odkaz nfnn.cz/aktuality/${saved.slug}:oldSlug: po uložení přestane fungovat.`}`;
  });
  protected readonly altMissing = computed(() => {
    const cover = this.article()?.coverImage;
    return cover != null && cover.alt === null && !this.coverUnsaved();
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      this.state.set('ready');
    } else {
      this.load(id);
    }
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    effect((onCleanup) => {
      const form = this.articleForm();
      if (form) {
        const edits = form.form.events.subscribe(() => this.edited.set(form.dirty === true));
        onCleanup(() => edits.unsubscribe());
      }
    });
  }

  protected load(id: string): void {
    this.state.set('loading');
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (article) => {
          this.show(article);
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
            this.router.navigateByUrl('/sprava/aktuality');
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

  protected leaveWithoutSaving(): void {
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
        const form = this.articleFormElement()?.nativeElement;
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
    this.articleTitle = value;
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
    this.preview.set({ kind: 'news', item: this.previewArticle() });
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
    const existing = this.article();
    const needsPublish = publish && existing?.publishedOn !== date;
    this.saving.set(publish ? 'publish' : 'save');
    if (existing && needsPublish && !this.unsaved()) {
      this.sendPublish(existing.id, date);
      return;
    }
    const call = existing
      ? this.api.update(existing.id, this.request())
      : this.api.create(this.request());
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (article) => {
        this.saved(article, existing === null);
        if (needsPublish) {
          this.publishDate = date;
          this.sendPublish(article.id, date);
          return;
        }
        this.saving.set(null);
        this.notice.set({ kind: 'status', text: this.savedText(article, existing === null) });
      },
      error: (failure: unknown) => {
        this.saving.set(null);
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
        $localize`:@@admin.newsEditor.image.wrongType:Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.`,
      );
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.uploadError.set(
        $localize`:@@admin.newsEditor.image.tooLarge:Fotka je větší než 10 MB. Zmenšete ji prosím a zkuste to znovu.`,
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
          this.coverImage.set({ id: uploaded.id, url: uploaded.url, alt: null });
        },
        error: (failure: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(
            describeProblem(
              failure,
              $localize`:@@admin.newsEditor.image.failed:Fotku se nepodařilo nahrát. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected removeImage(): void {
    this.coverImage.set(null);
    this.coverImageAlt = '';
    this.uploadError.set(null);
  }

  private sendPublish(id: string, date: string): void {
    this.api
      .publish(id, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (article) => {
          this.saving.set(null);
          this.article.set(article);
          const on = formatDonationDate(article.publishedOn ?? date);
          this.notice.set({
            kind: 'status',
            text: article.live
              ? $localize`:@@admin.newsEditor.published:Aktualita je na webu s datem ${on}:date:.`
              : $localize`:@@admin.newsEditor.scheduled:Aktualita se na webu ukáže ${on}:date:.`,
          });
        },
        error: (failure: unknown) => {
          this.saving.set(null);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.newsEditor.publish.failed:Aktualitu se nepodařilo zveřejnit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected unpublish(): void {
    const existing = this.article();
    if (!existing || this.busy()) {
      return;
    }
    this.notice.set(null);
    this.unpublishing.set(true);
    this.api
      .unpublish(existing.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (article) => {
          this.unpublishing.set(false);
          this.article.set(article);
          this.publishDate = todayIso();
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.newsEditor.unpublished:Aktualitu jsme z webu stáhli. Zůstává tu jako koncept.`,
          });
        },
        error: (failure: unknown) => {
          this.unpublishing.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.newsEditor.unpublish.failed:Aktualitu se nepodařilo stáhnout z webu. Zkuste to prosím znovu.`,
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
    const existing = this.article();
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
          this.discarded = true;
          this.router.navigateByUrl('/sprava/aktuality', { state: { deleted: existing.title } });
        },
        error: (failure: unknown) => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          this.deleteNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.newsEditor.delete.failed:Aktualitu se nepodařilo smazat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusDeleteButton();
        },
      });
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

  private saved(article: NewsArticleResponse, created: boolean): void {
    this.show(article);
    this.articleForm()?.form.markAsPristine();
    this.edited.set(false);
    if (created) {
      this.location.replaceState(`/sprava/aktuality/${article.id}`);
      this.pageTitle.setTitle(EDIT_TITLE);
    }
  }

  private saveFailed(failure: unknown): void {
    if (problemTypeEndsWith(failure, SLUG_TAKEN)) {
      const control = this.articleForm()?.controls['slug'];
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
        $localize`:@@admin.newsEditor.saved.failed:Aktualitu se nepodařilo uložit. Zkuste to prosím znovu.`,
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

  private savedText(article: NewsArticleResponse, created: boolean): string {
    if (created) {
      return $localize`:@@admin.newsEditor.saved.created:Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Uložit a zveřejnit.`;
    }
    if (article.publishedOn === null) {
      return $localize`:@@admin.newsEditor.saved.updated:Změny jsme uložili.`;
    }
    return article.live
      ? $localize`:@@admin.newsEditor.saved.live:Změny jsme uložili a na webu už jsou.`
      : $localize`:@@admin.newsEditor.saved.scheduled:Změny jsme uložili. Aktualita se na webu ukáže ${formatDonationDate(article.publishedOn)}:date:.`;
  }

  private previewArticle(): NewsArticleResponse {
    const saved = this.article();
    const request = this.request();
    const cover = this.coverImage();
    return {
      id: saved?.id ?? '',
      slug: request.slug ?? slugFromText(request.title),
      title: request.title,
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

  private show(article: NewsArticleResponse): void {
    this.article.set(article);
    this.articleTitle = article.title;
    this.slug = article.slug;
    this.slugEdited = true;
    this.slugOrDraft.set(article.slug);
    this.tag = article.tag ?? '';
    this.perex = article.perex;
    this.body = article.body;
    this.coverImage.set(article.coverImage);
    this.coverImageAlt = article.coverImage?.alt ?? '';
    this.publishDate = article.publishedOn ?? (this.publishDate || todayIso());
  }

  private request(): NewsArticleRequest {
    const slug = this.slug.trim();
    const tag = this.tag.trim();
    const alt = this.coverImageAlt.trim();
    return {
      title: this.articleTitle.trim(),
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
