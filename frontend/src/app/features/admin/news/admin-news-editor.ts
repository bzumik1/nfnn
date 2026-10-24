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
import { MarkdownPreview } from '../../../shared/ui/markdown/markdown-preview';
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

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_FOUND = 'content/news-not-found';
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
    MarkdownPreview,
  ],
  templateUrl: './admin-news-editor.html',
  styleUrl: './admin-news-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNewsEditor {
  private readonly api = inject(NewsApi);
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
  protected readonly maxAltLength = MAX_COVER_IMAGE_ALT_LENGTH;
  protected readonly slugPattern = SLUG_PATTERN;

  protected readonly state = signal<LoadState>('loading');
  protected readonly article = signal<NewsArticleResponse | null>(null);
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
    required: $localize`:@@admin.newsEditor.title.required:Vyplňte prosím titulek.`,
    maxlength: $localize`:@@admin.newsEditor.title.tooLong:Titulek může mít nejvíc ${MAX_TITLE_LENGTH}:max: znaků.`,
  };
  protected readonly slugMessages = {
    pattern: $localize`:@@admin.newsEditor.slug.pattern:Adresa smí mít jen malá písmena bez diakritiky, číslice a pomlčky mezi slovy.`,
    maxlength: $localize`:@@admin.newsEditor.slug.tooLong:Adresa může mít nejvíc ${MAX_SLUG_LENGTH}:max: znaků.`,
  };
  protected readonly tagMessages = {
    maxlength: $localize`:@@admin.newsEditor.tag.tooLong:Štítek může mít nejvíc ${MAX_TAG_LENGTH}:max: znaků.`,
  };
  protected readonly perexMessages = {
    required: $localize`:@@admin.newsEditor.perex.required:Vyplňte prosím perex, krátký souhrn pro seznam aktualit.`,
    maxlength: $localize`:@@admin.newsEditor.perex.tooLong:Perex může mít nejvíc ${MAX_PEREX_LENGTH}:max: znaků.`,
  };
  protected readonly bodyMessages = {
    required: $localize`:@@admin.newsEditor.body.required:Napište prosím text aktuality.`,
    maxlength: $localize`:@@admin.newsEditor.body.tooLong:Text může mít nejvíc ${MAX_BODY_LENGTH}:max: znaků.`,
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
  protected readonly publishedOn = computed(() => {
    const date = this.article()?.publishedOn;
    return date ? formatDonationDate(date) : null;
  });
  protected readonly updatedAt = computed(() => {
    const at = this.article()?.updatedAt;
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
      ? $localize`:@@admin.newsEditor.slug.hint.empty:Doplní se z titulku; malá písmena bez diakritiky a pomlčky.`
      : $localize`:@@admin.newsEditor.slug.hint:Aktualita bude na nfnn.cz/aktuality/${slug}:slug:. Můžete upravit.`;
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
    const existing = this.article();
    const call = existing
      ? this.api.update(existing.id, this.request())
      : this.api.create(this.request());
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (article) => {
        this.saving.set(false);
        const created = existing === null;
        this.show(article);
        if (created) {
          this.location.replaceState(`/sprava/aktuality/${article.id}`);
        }
        this.notice.set({
          kind: 'status',
          text: created
            ? $localize`:@@admin.newsEditor.saved.created:Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Zveřejnit.`
            : $localize`:@@admin.newsEditor.saved.updated:Změny jsme uložili.`,
        });
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        this.formError.set(
          describeProblem(
            failure,
            $localize`:@@admin.newsEditor.saved.failed:Aktualitu se nepodařilo uložit. Zkuste to prosím znovu.`,
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

  protected publish(): void {
    const existing = this.article();
    if (!existing || this.publishing() || !this.publishDate) {
      return;
    }
    this.notice.set(null);
    this.publishing.set(true);
    this.api
      .publish(existing.id, this.publishDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (article) => {
          this.publishing.set(false);
          this.article.set(article);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.newsEditor.published:Aktualita je na webu s datem ${formatDonationDate(article.publishedOn ?? this.publishDate)}:date:.`,
          });
        },
        error: (failure: unknown) => {
          this.publishing.set(false);
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
    if (!existing || this.unpublishing()) {
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
    this.notice.set(null);
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
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
          this.router.navigateByUrl('/sprava/aktuality');
        },
        error: (failure: unknown) => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.newsEditor.delete.failed:Aktualitu se nepodařilo smazat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
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
    this.publishDate = article.publishedOn ?? todayIso();
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
