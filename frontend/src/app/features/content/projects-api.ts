import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface CoverImageResponse {
  id: string;
  url: string;
  alt: string | null;
}

export type ProjectCategory = 'CHILDREN' | 'ADULTS' | 'ANIMALS' | 'OTHER';

export const PROJECT_CATEGORIES: readonly ProjectCategory[] = [
  'CHILDREN',
  'ADULTS',
  'ANIMALS',
  'OTHER',
];

export interface ProjectResponse {
  id: string;
  slug: string;
  title: string;
  year: number;
  category: ProjectCategory;
  tag: string | null;
  perex: string;
  body: string;
  coverImage: CoverImageResponse | null;
  publishedOn: string | null;
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListResponse {
  items: ProjectResponse[];
}

export interface ProjectPageResponse extends ProjectListResponse {
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
}

export interface ProjectRequest {
  title: string;
  year: number;
  category: ProjectCategory;
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
export const MIN_YEAR = 2005;
export const MAX_YEAR = 2100;
export const MAX_SLUG_LENGTH = 80;
export const MAX_TAG_LENGTH = 40;
export const MAX_PEREX_LENGTH = 300;
export const MAX_BODY_LENGTH = 20_000;
export const MAX_COVER_IMAGE_ALT_LENGTH = 200;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*';

const ADMIN_PROJECTS = '/api/admin/content/projects';
const ADMIN_MEDIA = '/api/admin/content/media';
const PUBLIC_PROJECTS = '/api/content/projects';
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
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ProjectListResponse> {
    return this.http.get<ProjectListResponse>(ADMIN_PROJECTS);
  }

  get(id: string): Observable<ProjectResponse> {
    return this.http.get<ProjectResponse>(`${ADMIN_PROJECTS}/${id}`);
  }

  create(request: ProjectRequest): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(ADMIN_PROJECTS, request);
  }

  update(id: string, request: ProjectRequest): Observable<ProjectResponse> {
    return this.http.put<ProjectResponse>(`${ADMIN_PROJECTS}/${id}`, request);
  }

  publish(id: string, publishedOn: string): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${ADMIN_PROJECTS}/${id}/publish`, { publishedOn });
  }

  unpublish(id: string): Observable<ProjectResponse> {
    return this.http.post<ProjectResponse>(`${ADMIN_PROJECTS}/${id}/unpublish`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${ADMIN_PROJECTS}/${id}`);
  }

  uploadImage(file: File): Observable<UploadedImageResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UploadedImageResponse>(ADMIN_MEDIA, form);
  }

  published(page: number, size: number): Observable<ProjectPageResponse> {
    return this.http.get<ProjectPageResponse>(PUBLIC_PROJECTS, { params: { page, size } });
  }

  publishedBySlug(slug: string): Observable<ProjectResponse> {
    return this.http.get<ProjectResponse>(`${PUBLIC_PROJECTS}/${slug}`);
  }
}
