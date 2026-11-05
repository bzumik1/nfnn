import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FocalPoint } from '../../shared/ui/focal-point/focal-point';

export interface PhotoResponse {
  id: string;
  url: string;
  width: number;
  height: number;
  focalPoint: FocalPoint | null;
}

const ADMIN_MEDIA = '/api/admin/content/media';

@Injectable({ providedIn: 'root' })
export class PhotosApi {
  private readonly http = inject(HttpClient);

  placeFocalPoint(photoId: string, focalPoint: FocalPoint | null): Observable<PhotoResponse> {
    return this.http.put<PhotoResponse>(`${ADMIN_MEDIA}/${photoId}`, { focalPoint });
  }
}
