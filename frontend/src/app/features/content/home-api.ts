import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AboutResponse } from './about-api';
import { NewsArticleResponse } from './news-api';
import { PublicPeopleResponse } from './people-api';
import { ProjectResponse } from './projects-api';

export interface HomeResponse {
  news: NewsArticleResponse[];
  projects: ProjectResponse[];
  about?: AboutResponse;
  people?: PublicPeopleResponse | null;
}

const HOME = '/api/content/home';

@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly http = inject(HttpClient);

  load(): Observable<HomeResponse> {
    return this.http.get<HomeResponse>(HOME);
  }
}
