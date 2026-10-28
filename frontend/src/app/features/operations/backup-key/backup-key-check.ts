export const BACKUP_KEY_CHECK_LENGTH = 4;

export function backupKeyCheckPattern(key: string): string {
  const end = key.trim().slice(-BACKUP_KEY_CHECK_LENGTH);
  const letters = [...end]
    .map((character) =>
      /[a-z]/i.test(character)
        ? `[${character.toLowerCase()}${character.toUpperCase()}]`
        : character,
    )
    .join('');
  return `\\s*${letters}\\s*`;
}
