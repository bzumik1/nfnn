import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface AboutPhotoResponse {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string | null;
  caption: string | null;
}

export interface AboutResponse {
  photo: AboutPhotoResponse | null;
}

export interface AboutRequest {
  photoId: string | null;
  photoAlt: string | null;
  caption: string | null;
}

export const MAX_ABOUT_PHOTO_ALT_LENGTH = 200;
export const MAX_ABOUT_CAPTION_LENGTH = 200;

const ADMIN_ABOUT = '/api/admin/content/about';

@Injectable({ providedIn: 'root' })
export class AboutApi {
  private readonly http = inject(HttpClient);

  load(): Observable<AboutResponse> {
    return this.http.get<AboutResponse>(ADMIN_ABOUT);
  }

  save(request: AboutRequest): Observable<AboutResponse> {
    return this.http.put<AboutResponse>(ADMIN_ABOUT, request);
  }
}
