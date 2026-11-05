import { HttpClient, HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveApi {
  private readonly http = inject(HttpClient);

  stream(): Observable<HttpEvent<string>> {
    return this.http.get('/api/live', {
      headers: { Accept: 'text/event-stream' },
      observe: 'events',
      reportProgress: true,
      responseType: 'text',
    });
  }
}
