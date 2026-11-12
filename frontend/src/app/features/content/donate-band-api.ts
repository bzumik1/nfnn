import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FocalPoint } from '../../shared/ui/focal-point/focal-point';

export interface DonateBandPhotoResponse {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string | null;
  focalPoint: FocalPoint | null;
}

export interface DonateBandResponse {
  photo: DonateBandPhotoResponse | null;
}

export interface DonateBandRequest {
  photoId: string | null;
  photoAlt: string | null;
}

export const MAX_DONATE_BAND_PHOTO_ALT_LENGTH = 200;

const ADMIN_DONATE_BAND = '/api/admin/content/donate-band';

@Injectable({ providedIn: 'root' })
export class DonateBandApi {
  private readonly http = inject(HttpClient);

  load(): Observable<DonateBandResponse> {
    return this.http.get<DonateBandResponse>(ADMIN_DONATE_BAND);
  }

  save(request: DonateBandRequest): Observable<DonateBandResponse> {
    return this.http.put<DonateBandResponse>(ADMIN_DONATE_BAND, request);
  }
}
