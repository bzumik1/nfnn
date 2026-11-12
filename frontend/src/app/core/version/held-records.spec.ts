import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { AdminApi } from '../../features/admin/admin-api';
import {
  adminBankLogo,
  reportView,
  symbolClaim,
} from '../../features/admin/testing/admin-fixtures';
import { NewsApi, storedNewsArticleOf } from '../../features/content/news-api';
import { PeopleApi, storedPageTextOf } from '../../features/content/people-api';
import { ProjectsApi, storedProjectOf } from '../../features/content/projects-api';
import { newsArticle } from '../../features/content/testing/news-fixtures';
import { project } from '../../features/content/testing/project-fixtures';
import { AuthApi, storedProfileOf } from '../auth/auth-api';
import { sampleDonor } from '../auth/testing/donor-fixtures';
import { KEYS_THAT_ALWAYS_MAY_DIFFER } from './held-record-retry';
import { heldRecordOf, keysThatMayDifferOf } from './row-version';
import storedRecords from './stored-records.json';

const VERSION = '0000000000000001';

type Caller = keyof typeof storedRecords;

const WRITES: Record<Caller, () => Observable<unknown>> = {
  newsArticle: () =>
    TestBed.inject(NewsApi).update(
      'n',
      newsArticle() as never,
      VERSION,
      storedNewsArticleOf(newsArticle()),
    ),
  project: () =>
    TestBed.inject(ProjectsApi).update(
      'p',
      project() as never,
      VERSION,
      storedProjectOf(project()),
    ),
  pageText: () => TestBed.inject(PeopleApi).saveNote('Děkujeme.', VERSION, storedPageTextOf('x')),
  profile: () =>
    TestBed.inject(AuthApi).updateProfile(
      {
        name: 'Jana Nováková',
        address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
        preferredLocale: 'cs',
      },
      VERSION,
      storedProfileOf(sampleDonor()),
    ),
  symbolClaim: () => TestBed.inject(AdminApi).deleteSymbolClaim('c', VERSION, symbolClaim()),
  reportSettings: () =>
    TestBed.inject(AdminApi).changeReportSettings(
      reportView().settings,
      VERSION,
      reportView().settings,
    ),
  bankLogo: () => TestBed.inject(AdminApi).removeBankLogo('0800', VERSION, adminBankLogo()),
};

describe('Given every write that carries the record the page held', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  for (const caller of Object.keys(WRITES) as Caller[]) {
    it(`when the ${caller} write goes out, then its held record and the keys allowed to differ cover exactly the stored record the backend answers in a refusal`, () => {
      WRITES[caller]().subscribe();
      const [request] = http.match(() => true);
      const held = heldRecordOf(request.request.context) as Record<string, unknown> | null;
      const mayDiffer = keysThatMayDifferOf(request.request.context);
      const always = new Set(KEYS_THAT_ALWAYS_MAY_DIFFER);
      const heldKeys = Object.keys(held ?? {}).filter((key) => !always.has(key));

      expect(heldKeys.filter((key) => mayDiffer.includes(key))).toEqual([]);
      expect([...heldKeys, ...mayDiffer].sort()).toEqual(
        storedRecords[caller].keys.filter((key) => !always.has(key)).sort(),
      );
    });
  }
});
