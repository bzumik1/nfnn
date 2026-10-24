import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface CoverImageResponse {
  id: string;
  url: string;
  alt: string | null;
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

  update(id: string, request: NewsArticleRequest): Observable<NewsArticleResponse> {
    return this.http.put<NewsArticleResponse>(`${ADMIN_NEWS}/${id}`, request);
  }

  publish(id: string, publishedOn: string): Observable<NewsArticleResponse> {
    return this.http.post<NewsArticleResponse>(`${ADMIN_NEWS}/${id}/publish`, { publishedOn });
  }

  unpublish(id: string): Observable<NewsArticleResponse> {
    return this.http.post<NewsArticleResponse>(`${ADMIN_NEWS}/${id}/unpublish`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${ADMIN_NEWS}/${id}`);
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
