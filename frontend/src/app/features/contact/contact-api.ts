import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ContactMessageRequest {
  fullName: string;
  email: string;
  message: string;
  website: string;
}

@Injectable({ providedIn: 'root' })
export class ContactApi {
  private readonly http = inject(HttpClient);

  submit(request: ContactMessageRequest): Observable<void> {
    return this.http.post<void>('/api/contact/messages', request);
  }
}
