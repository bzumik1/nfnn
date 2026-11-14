import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { RELEASE, baseImages, nextRelease, releaseMonth, tagNamesOf } from './release-version.mjs';

const MID_NOVEMBER = new Date('2026-11-14T10:00:00Z');

describe('Given the time of a run', () => {
  it('when the month is read, then it is the Prague month without a leading zero', () => {
    assert.equal(releaseMonth(new Date('2027-03-05T10:00:00Z')), '2027.3');
  });

  it('when the run starts late on the last evening of a month in UTC, then the Prague month is already the next one', () => {
    assert.equal(releaseMonth(new Date('2026-11-30T23:30:00Z')), '2026.12');
  });
});

describe('Given the tags of the repository', () => {
  it('when no release of the month exists, then the first release of the month is 1', () => {
    assert.equal(nextRelease(['2026.10.7', 'some-tag'], MID_NOVEMBER), '2026.11.1');
  });

  it('when releases of the month exist, then the next one follows the highest by number, not by text', () => {
    assert.equal(nextRelease(['2026.11.9', '2026.11.10', '2026.11.2'], MID_NOVEMBER), '2026.11.11');
  });

  it('when a number was skipped by a failed run, then the next one still follows the highest', () => {
    assert.equal(nextRelease(['2026.11.1', '2026.11.3'], MID_NOVEMBER), '2026.11.4');
  });

  it('when a tag only resembles a release, then it is not counted', () => {
    assert.equal(nextRelease(['2026.11.01', 'v2026.11.5', '2026.11.5-rc', '2026.11.0'], MID_NOVEMBER), '2026.11.1');
  });

  it('when git ls-remote lists them, then the names lose the ref prefix and peeled duplicates', () => {
    const listing = [
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/tags/2026.11.1',
      'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/tags/2026.11.1^{}',
      'c1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/tags/2026.11.2',
      '',
    ].join('\n');

    assert.deepEqual(tagNamesOf(listing), ['2026.11.1', '2026.11.2']);
  });
});

describe('Given the release pattern', () => {
  it('when a release is matched, then year, month and order are accepted without leading zeros', () => {
    assert.ok(RELEASE.test('2026.11.3'));
    assert.ok(RELEASE.test('2027.1.12'));
    assert.ok(!RELEASE.test('2026.13.1'));
    assert.ok(!RELEASE.test('2026.01.1'));
    assert.ok(!RELEASE.test('dev'));
  });
});

describe('Given a Dockerfile', () => {
  it('when its base images are read, then every stage base is listed once and the stage names are not', () => {
    const dockerfile = [
      '# syntax=docker/dockerfile:1',
      'FROM eclipse-temurin:25-jdk AS build',
      'RUN true',
      'FROM --platform=linux/amd64 eclipse-temurin:25-jre',
      'FROM build AS again',
      'from node:26-alpine as tools',
      'FROM node:26-alpine',
    ].join('\n');

    assert.deepEqual(baseImages(dockerfile), ['eclipse-temurin:25-jdk', 'eclipse-temurin:25-jre', 'node:26-alpine']);
  });

  it('when a base is pinned by digest, then the digest stays part of the reference', () => {
    const pinned = 'postgres:17.12-alpine@sha256:34261f594522cf41dfcb76aefd42b9d201098b0e6b23c9c68733f169e4218b6f';

    assert.deepEqual(baseImages(`FROM ${pinned}\n`), [pinned]);
  });
});
