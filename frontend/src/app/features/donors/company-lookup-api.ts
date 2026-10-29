import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { DonorAddress } from '../../core/auth/donor';

export interface RegisteredCompany {
  companyIdentifier: string;
  name: string;
  address: DonorAddress | null;
}

@Injectable({ providedIn: 'root' })
export class CompanyLookupApi {
  private readonly http = inject(HttpClient);

  lookUp(companyIdentifier: string): Observable<RegisteredCompany | null> {
    return this.http
      .get<RegisteredCompany>('/api/donors/company-lookup', {
        params: { companyIdentifier },
        observe: 'response',
      })
      .pipe(map((response) => response.body));
  }
}
