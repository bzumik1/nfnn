import { PersonResponse, PublicPeopleResponse } from '../people-api';

export const PERSON_ID = '0199f3e0-0000-7000-8000-00000000c001';
export const OTHER_PERSON_ID = '0199f3e0-0000-7000-8000-00000000c002';
export const PORTRAIT_ID = '0199f3e0-0000-7000-8000-00000000c101';
export const SIGNATURE_ID = '0199f3e0-0000-7000-8000-00000000c201';

export function person(overrides: Partial<PersonResponse> = {}): PersonResponse {
  return {
    id: PERSON_ID,
    name: 'Eva Vzorová',
    role: 'Zakladatelka a předsedkyně správní rady',
    position: 0,
    onBoard: true,
    boardNote: 'předsedkyně',
    featured: true,
    portrait: {
      id: PORTRAIT_ID,
      url: `/api/content/media/${PORTRAIT_ID}`,
      width: 640,
      height: 640,
    },
    webSignature: null,
    personalEmail: null,
    fundEmail: null,
    ...overrides,
  };
}

export function publicPeople(overrides: Partial<PublicPeopleResponse> = {}): PublicPeopleResponse {
  return {
    featured: [
      {
        name: 'Eva Vzorová',
        role: 'Zakladatelka a předsedkyně správní rady',
        portrait: {
          id: PORTRAIT_ID,
          url: `/api/content/media/${PORTRAIT_ID}`,
          width: 640,
          height: 640,
        },
      },
      { name: 'Adam Vzor', role: 'Zakladatel a člen správní rady', portrait: null },
    ],
    board: [
      { name: 'Eva Vzorová', note: 'předsedkyně' },
      { name: 'Adam Vzor', note: null },
      { name: 'Hana Vzorová', note: null },
    ],
    note: {
      text: 'Fond jsme založili, abychom pomáhali konkrétním dětem.\n\nDěkujeme všem, kdo pomáhají s námi.',
      signatures: [
        {
          url: `/api/content/media/${SIGNATURE_ID}`,
          width: 600,
          height: 180,
          name: 'Eva Vzorová',
        },
      ],
    },
    footnote: 'Web zajišťuje bez nároku na odměnu Petr Vzor.',
    ...overrides,
  };
}
