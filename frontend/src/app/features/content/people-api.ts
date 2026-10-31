import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface PersonImageResponse {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface PersonResponse {
  id: string;
  name: string;
  role: string | null;
  position: number;
  onBoard: boolean;
  boardNote: string | null;
  featured: boolean;
  portrait: PersonImageResponse | null;
  webSignature: PersonImageResponse | null;
  personalEmail: string | null;
  fundEmail: string | null;
}

export interface PeopleResponse {
  members: PersonResponse[];
  note: string | null;
}

export interface PersonRequest {
  name: string;
  role: string | null;
  onBoard: boolean;
  boardNote: string | null;
  featured: boolean;
  portraitId: string | null;
  personalEmail: string | null;
  fundEmail: string | null;
}

export interface FoundersNoteResponse {
  text: string | null;
}

export interface PublicPersonCard {
  name: string;
  role: string | null;
  portrait: PersonImageResponse | null;
}

export interface PublicBoardMember {
  name: string;
  note: string | null;
}

export interface PublicSignature {
  url: string;
  width: number;
  height: number;
  name: string;
}

export interface PublicFoundersNote {
  text: string;
  signatures: PublicSignature[];
}

export interface PublicPeopleResponse {
  featured: PublicPersonCard[];
  board: PublicBoardMember[];
  note: PublicFoundersNote | null;
}

export const MAX_PERSON_NAME_LENGTH = 100;
export const MAX_PERSON_ROLE_LENGTH = 120;
export const MAX_BOARD_NOTE_LENGTH = 60;
export const MAX_FOUNDERS_NOTE_LENGTH = 600;
export const MAX_PEOPLE = 30;
export const MAX_EMAIL_LENGTH = 254;
export const EMAIL_SHAPE = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

export function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toLocaleUpperCase('cs'))
    .slice(0, 2)
    .join('');
}

const ADMIN_PEOPLE = '/api/admin/content/people';

@Injectable({ providedIn: 'root' })
export class PeopleApi {
  private readonly http = inject(HttpClient);

  load(): Observable<PeopleResponse> {
    return this.http.get<PeopleResponse>(ADMIN_PEOPLE);
  }

  add(request: PersonRequest): Observable<PersonResponse> {
    return this.http.post<PersonResponse>(ADMIN_PEOPLE, request);
  }

  update(id: string, request: PersonRequest): Observable<PersonResponse> {
    return this.http.put<PersonResponse>(`${ADMIN_PEOPLE}/${id}`, request);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${ADMIN_PEOPLE}/${id}`);
  }

  order(memberIds: string[]): Observable<PeopleResponse> {
    return this.http.put<PeopleResponse>(`${ADMIN_PEOPLE}/order`, { memberIds });
  }

  saveNote(text: string | null): Observable<FoundersNoteResponse> {
    return this.http.put<FoundersNoteResponse>(`${ADMIN_PEOPLE}/note`, { text });
  }

  setWebSignature(id: string, imageId: string): Observable<PersonResponse> {
    return this.http.post<PersonResponse>(`${ADMIN_PEOPLE}/${id}/web-signature`, { imageId });
  }

  removeWebSignature(id: string): Observable<PersonResponse> {
    return this.http.delete<PersonResponse>(`${ADMIN_PEOPLE}/${id}/web-signature`);
  }
}
