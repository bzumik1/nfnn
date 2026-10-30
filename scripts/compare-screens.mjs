#!/usr/bin/env node
export const PAGE_TOLERANCE_RATIO = 0.002;
export const ELEMENT_TOLERANCE_PIXELS = 0;

export function compareImages() {
  return { sameSize: true, differingPixels: 0, totalPixels: 0, box: null };
}
export function shotKind() {
  return 'page';
}
export function withinTolerance() {
  return true;
}
export function pairShots() {
  return { both: [], added: [], removed: [] };
}
export function encodePng() {
  return Buffer.alloc(0);
}
export function cropAround(image) {
  return image;
}
export function diffImage(base) {
  return base;
}
export function reportMarkdown() {
  return '';
}
export function outsideRepository() {
  return true;
}
