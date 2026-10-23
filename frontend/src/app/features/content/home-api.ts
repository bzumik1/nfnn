import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { NewsArticleResponse } from './news-api';
import { ProjectResponse } from './projects-api';

export interface HomeResponse {
  news: NewsArticleResponse[];
  projects: ProjectResponse[];
}

const HOME = '/api/content/home';

@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly http = inject(HttpClient);

  load(): Observable<HomeResponse> {
    return this.http.get<HomeResponse>(HOME);
  }
}
