import { HttpErrorResponse } from '@angular/common/http';

export interface ApiProblemError {
  field: string;
  message: string;
}

export interface ApiProblem {
  status: number;
  type: string;
  title: string;
  detail: string;
  errors: readonly ApiProblemError[];
  challenge: string | null;
}

export function problemOf(failure: unknown): ApiProblem | null {
  if (!(failure instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = failure.error;
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const fields = body as Record<string, unknown>;
  return {
    status: failure.status,
    type: stringOf(fields['type']),
    title: stringOf(fields['title']),
    detail: stringOf(fields['detail']),
    errors: Array.isArray(fields['errors']) ? fields['errors'].map(errorOf) : [],
    challenge: typeof fields['challenge'] === 'string' ? fields['challenge'] : null,
  };
}

export function problemTypeEndsWith(failure: unknown, suffix: string): boolean {
  const problem = problemOf(failure);
  return problem !== null && problem.type.endsWith(suffix);
}

export function describeProblem(failure: unknown, generic: string): string {
  const problem = problemOf(failure);
  if (problem === null || problem.title === '') {
    return generic;
  }
  const fieldMessages = problem.errors
    .map((error) => error.message)
    .filter((message) => message !== '');
  return [problem.title + '.', problem.detail, ...fieldMessages]
    .filter((part) => part !== '')
    .join(' ');
}

export function describeProblemWithoutFields(failure: unknown, generic: string): string {
  const problem = problemOf(failure);
  if (problem === null || problem.title === '') {
    return generic;
  }
  return [problem.title + '.', problem.detail].filter((part) => part !== '').join(' ');
}

function errorOf(value: unknown): ApiProblemError {
  const fields = (value ?? {}) as Record<string, unknown>;
  return { field: stringOf(fields['field']), message: stringOf(fields['message']) };
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
