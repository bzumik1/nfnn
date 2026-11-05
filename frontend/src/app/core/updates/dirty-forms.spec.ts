import { TestBed } from '@angular/core/testing';

import { DirtyForms } from './dirty-forms';

describe('Given the registry of half-typed forms', () => {
  let dirtyForms: DirtyForms;

  beforeEach(() => {
    dirtyForms = TestBed.inject(DirtyForms);
  });

  it('when no form is registered, then nothing is half-typed', () => {
    expect(dirtyForms.any()).toBe(false);
  });

  it('when a registered form is changed, then something is half-typed', () => {
    let changed = false;
    dirtyForms.register(() => changed);
    expect(dirtyForms.any()).toBe(false);

    changed = true;

    expect(dirtyForms.any()).toBe(true);
  });

  it('when the changed form unregisters, then nothing is half-typed again', () => {
    const unregister = dirtyForms.register(() => true);

    unregister();

    expect(dirtyForms.any()).toBe(false);
  });

  it('when a check throws, then the form counts as half-typed', () => {
    dirtyForms.register(() => {
      throw new Error('destroyed');
    });

    expect(dirtyForms.any()).toBe(true);
  });
});
