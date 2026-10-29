const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const CHECKSUM_LENGTH = 6;
const SEPARATOR = '1';

function polymod(humanReadablePart: string, values: readonly number[]): number {
  let checksum = 1;
  const step = (value: number) => {
    const top = checksum >>> 25;
    checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0;
    GENERATOR.forEach((generator, bit) => {
      if ((top >>> bit) & 1) {
        checksum = (checksum ^ generator) >>> 0;
      }
    });
  };
  for (const character of humanReadablePart) {
    step(character.charCodeAt(0) >> 5);
  }
  step(0);
  for (const character of humanReadablePart) {
    step(character.charCodeAt(0) & 31);
  }
  values.forEach(step);
  return checksum;
}

export function bech32Decode(
  text: string,
  humanReadablePart: string,
  byteCount: number,
): Uint8Array | null {
  const lower = text.toLowerCase();
  const separator = lower.lastIndexOf(SEPARATOR);
  if (separator < 1 || lower.slice(0, separator) !== humanReadablePart) {
    return null;
  }
  const values = [...lower.slice(separator + 1)].map((character) => CHARSET.indexOf(character));
  if (values.length < CHECKSUM_LENGTH || values.some((value) => value < 0)) {
    return null;
  }
  if (polymod(humanReadablePart, values) !== 1) {
    return null;
  }
  const dataLength = values.length - CHECKSUM_LENGTH;
  const bits = dataLength * 5;
  if (Math.floor(bits / 8) !== byteCount || bits % 8 >= 5) {
    return null;
  }
  const bytes = new Uint8Array(byteCount);
  let accumulator = 0;
  let pending = 0;
  let next = 0;
  for (let i = 0; i < dataLength; i++) {
    accumulator = ((accumulator << 5) | values[i]) & 0xffff;
    pending += 5;
    if (pending >= 8) {
      pending -= 8;
      if (next < byteCount) {
        bytes[next++] = (accumulator >>> pending) & 0xff;
      }
    }
  }
  if ((accumulator & ((1 << pending) - 1)) !== 0) {
    return null;
  }
  return bytes;
}

export function bech32Encode(humanReadablePart: string, bytes: Uint8Array): string {
  const values: number[] = [];
  let accumulator = 0;
  let pending = 0;
  for (const byte of bytes) {
    accumulator = ((accumulator << 8) | byte) & 0xffff;
    pending += 8;
    while (pending >= 5) {
      pending -= 5;
      values.push((accumulator >>> pending) & 31);
    }
  }
  if (pending > 0) {
    values.push((accumulator << (5 - pending)) & 31);
  }
  const checksum = polymod(humanReadablePart, [...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    values.push((checksum >>> (5 * (CHECKSUM_LENGTH - 1 - i))) & 31);
  }
  return humanReadablePart + SEPARATOR + values.map((value) => CHARSET[value]).join('');
}
