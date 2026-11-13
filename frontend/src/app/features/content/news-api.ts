import { HttpClient, HttpContext } from '@angular/common/http';
import { refreshedAfterKeptCopy } from '../../core/connectivity/kept-answer-refresh';
import { ifMatch } from '../../core/version/row-version';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FocalPoint } from '../../shared/ui/focal-point/focal-point';

export interface CoverImageResponse {
  id: string;
  url: string;
  alt: string | null;
  focalPoint: FocalPoint | null;
}

export interface NewsSignerResponse {
  id: string;
  name: string;
  role: string | null;
  portrait: { id: string; url: string; width: number; height: number } | null;
}

export interface NewsArticleResponse {
  id: string;
  slug: string;
  title: string;
  tag: string | null;
  perex: string;
  body: string;
  coverImage: CoverImageResponse | null;
  publishedOn: string | null;
  live: boolean;
  createdAt: string;
  updatedAt: string;
  signer: NewsSignerResponse | null;
  lookBackYear?: number | null;
}

export interface NewsListResponse {
  items: NewsArticleResponse[];
}

export interface AdminNewsArticleResponse extends NewsArticleResponse {
  version: string;
}

export interface AdminNewsListResponse {
  items: AdminNewsArticleResponse[];
}

export interface StoredNewsArticle {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly tag: string | null;
  readonly perex: string;
  readonly body: string;
  readonly coverImage: string | null;
  readonly coverImageAlt: string | null;
  readonly signer: string | null;
  readonly publishedOn: string | null;
  readonly lookBackYear: number | null;
}

export function storedNewsArticleOf(article: AdminNewsArticleResponse): StoredNewsArticle {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    tag: article.tag,
    perex: article.perex,
    body: article.body,
    coverImage: article.coverImage?.id ?? null,
    coverImageAlt: article.coverImage?.alt ?? null,
    signer: article.signer?.id ?? null,
    publishedOn: article.publishedOn,
    lookBackYear: article.lookBackYear ?? null,
  };
}

export interface NewsPageResponse extends NewsListResponse {
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface NewsArticleRequest {
  title: string;
  slug: string | null;
  tag: string | null;
  perex: string;
  body: string;
  coverImageId: string | null;
  coverImageAlt: string | null;
  signerId: string | null;
}

export interface UploadedImageResponse {
  id: string;
  url: string;
  width: number;
  height: number;
}

export const MAX_TITLE_LENGTH = 120;
export const MAX_SLUG_LENGTH = 80;
export const MAX_TAG_LENGTH = 40;
export const MAX_PEREX_LENGTH = 300;
export const MAX_BODY_LENGTH = 20_000;
export const MAX_COVER_IMAGE_ALT_LENGTH = 200;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*';

const ADMIN_NEWS = '/api/admin/content/news';
const ADMIN_MEDIA = '/api/admin/content/media';
const PUBLIC_NEWS = '/api/content/news';
const PUBLIC_MEDIA = '/api/content/media/';

export const MIN_LOOK_BACK_YEAR = 2005;
export const MEDIA_WIDTHS = [480, 960, 1440] as const;
export const SMALL_MEDIA_WIDTH = MEDIA_WIDTHS[0];

export function mediaUrl(imageId: string, width: number): string {
  return `${PUBLIC_MEDIA}${imageId}?w=${width}`;
}

export function slugFromText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

@Injectable({ providedIn: 'root' })
export class NewsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AdminNewsListResponse> {
    return this.http.get<AdminNewsListResponse>(ADMIN_NEWS);
  }

  get(id: string): Observable<AdminNewsArticleResponse> {
    return this.http.get<AdminNewsArticleResponse>(`${ADMIN_NEWS}/${id}`);
  }

  create(request: NewsArticleRequest): Observable<AdminNewsArticleResponse> {
    return this.http.post<AdminNewsArticleResponse>(ADMIN_NEWS, request);
  }

  update(
    id: string,
    request: NewsArticleRequest,
    version: string,
    held: StoredNewsArticle | null,
  ): Observable<AdminNewsArticleResponse> {
    return this.http.put<AdminNewsArticleResponse>(
      `${ADMIN_NEWS}/${id}`,
      request,
      ifMatch(version, held),
    );
  }

  publish(
    id: string,
    publishedOn: string,
    version: string,
    held: StoredNewsArticle | null,
  ): Observable<AdminNewsArticleResponse> {
    return this.http.post<AdminNewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/publish`,
      { publishedOn },
      ifMatch(version, held),
    );
  }

  unpublish(
    id: string,
    version: string,
    held: StoredNewsArticle | null,
  ): Observable<AdminNewsArticleResponse> {
    return this.http.post<AdminNewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/unpublish`,
      {},
      ifMatch(version, held),
    );
  }

  setLookBackYear(
    id: string,
    year: number | null,
    version: string,
  ): Observable<AdminNewsArticleResponse> {
    return this.http.put<AdminNewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/look-back-year`,
      { year },
      ifMatch(version),
    );
  }

  delete(id: string, version: string, held: StoredNewsArticle | null): Observable<void> {
    return this.http.delete<void>(`${ADMIN_NEWS}/${id}`, ifMatch(version, held));
  }

  uploadImage(file: File): Observable<UploadedImageResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UploadedImageResponse>(ADMIN_MEDIA, form);
  }

  published(page: number, size: number, context?: HttpContext): Observable<NewsPageResponse> {
    return this.http.get<NewsPageResponse>(PUBLIC_NEWS, { params: { page, size }, context });
  }

  publishedWithLatest(
    page: number,
    size: number,
    context: HttpContext = refreshedAfterKeptCopy(),
  ): Observable<NewsPageResponse> {
    return this.http.get<NewsPageResponse>(PUBLIC_NEWS, { params: { page, size }, context });
  }

  publishedBySlug(
    slug: string,
    context: HttpContext = refreshedAfterKeptCopy(),
  ): Observable<NewsArticleResponse> {
    return this.http.get<NewsArticleResponse>(`${PUBLIC_NEWS}/${slug}`, { context });
  }
}
