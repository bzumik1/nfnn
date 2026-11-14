import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RELEASE = /^(\d{4})\.(1[0-2]|[1-9])\.([1-9]\d{0,3})$/;

const RELEASE_ZONE = 'Europe/Prague';
const TAG_REF = /^[0-9a-f]{40}\trefs\/tags\/([^\s^]+)$/;
const FROM = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i;

export function releaseMonth(now) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: RELEASE_ZONE, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const part = (type) => Number(parts.find((candidate) => candidate.type === type).value);
  return `${part('year')}.${part('month')}`;
}

export function nextRelease(tagNames, now) {
  const month = releaseMonth(now);
  const orders = tagNames
    .map((name) => RELEASE.exec(name))
    .filter((match) => match !== null && `${match[1]}.${match[2]}` === month)
    .map((match) => Number(match[3]));
  return `${month}.${Math.max(0, ...orders) + 1}`;
}

export function tagNamesOf(lsRemoteListing) {
  const names = lsRemoteListing
    .split('\n')
    .map((line) => TAG_REF.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => match[1]);
  return [...new Set(names)];
}

export function baseImages(dockerfile) {
  const stages = new Set();
  const bases = [];
  for (const line of dockerfile.split('\n')) {
    const match = FROM.exec(line.trim());
    if (match === null) {
      continue;
    }
    const [, image, stage] = match;
    if (!stages.has(image) && !bases.includes(image)) {
      bases.push(image);
    }
    if (stage !== undefined) {
      stages.add(stage);
    }
  }
  return bases;
}

function main([command, ...files]) {
  if (command === 'next') {
    console.log(nextRelease(tagNamesOf(readFileSync(0, 'utf8')), new Date()));
    return;
  }
  if (command === 'bases' && files.length > 0) {
    const all = files.flatMap((file) => baseImages(readFileSync(file, 'utf8')));
    console.log([...new Set(all)].sort().join('\n'));
    return;
  }
  console.error('Usage: release-version.mjs next < git-ls-remote-tags | release-version.mjs bases <Dockerfile>...');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
