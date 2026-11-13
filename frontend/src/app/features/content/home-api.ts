import { HttpClient, HttpContext } from '@angular/common/http';
import { refreshedAfterKeptCopy } from '../../core/connectivity/kept-answer-refresh';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AboutResponse } from './about-api';
import { DonateBandResponse } from './donate-band-api';
import { NewsArticleResponse } from './news-api';
import { PublicPeopleResponse } from './people-api';
import { ProjectResponse } from './projects-api';

export interface HomeResponse {
  news: NewsArticleResponse[];
  projects: ProjectResponse[];
  about?: AboutResponse;
  people?: PublicPeopleResponse | null;
  donateBand?: DonateBandResponse;
}

const HOME = '/api/content/home';

@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly http = inject(HttpClient);

  load(context: HttpContext = refreshedAfterKeptCopy()): Observable<HomeResponse> {
    return this.http.get<HomeResponse>(HOME, { context });
  }
}
