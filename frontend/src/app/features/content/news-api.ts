import { HttpClient } from '@angular/common/http';
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
  version?: string;
  signer: NewsSignerResponse | null;
  lookBackYear?: number | null;
}

export interface NewsListResponse {
  items: NewsArticleResponse[];
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

  list(): Observable<NewsListResponse> {
    return this.http.get<NewsListResponse>(ADMIN_NEWS);
  }

  get(id: string): Observable<NewsArticleResponse> {
    return this.http.get<NewsArticleResponse>(`${ADMIN_NEWS}/${id}`);
  }

  create(request: NewsArticleRequest): Observable<NewsArticleResponse> {
    return this.http.post<NewsArticleResponse>(ADMIN_NEWS, request);
  }

  update(
    id: string,
    request: NewsArticleRequest,
    version: string,
  ): Observable<NewsArticleResponse> {
    return this.http.put<NewsArticleResponse>(`${ADMIN_NEWS}/${id}`, request, ifMatch(version));
  }

  publish(id: string, publishedOn: string, version: string): Observable<NewsArticleResponse> {
    return this.http.post<NewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/publish`,
      { publishedOn },
      ifMatch(version),
    );
  }

  unpublish(id: string, version: string): Observable<NewsArticleResponse> {
    return this.http.post<NewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/unpublish`,
      {},
      ifMatch(version),
    );
  }

  setLookBackYear(
    id: string,
    year: number | null,
    version: string,
  ): Observable<NewsArticleResponse> {
    return this.http.put<NewsArticleResponse>(
      `${ADMIN_NEWS}/${id}/look-back-year`,
      { year },
      ifMatch(version),
    );
  }

  delete(id: string, version: string): Observable<void> {
    return this.http.delete<void>(`${ADMIN_NEWS}/${id}`, ifMatch(version));
  }

  uploadImage(file: File): Observable<UploadedImageResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UploadedImageResponse>(ADMIN_MEDIA, form);
  }

  published(page: number, size: number): Observable<NewsPageResponse> {
    return this.http.get<NewsPageResponse>(PUBLIC_NEWS, { params: { page, size } });
  }

  publishedBySlug(slug: string): Observable<NewsArticleResponse> {
    return this.http.get<NewsArticleResponse>(`${PUBLIC_NEWS}/${slug}`);
  }
}
