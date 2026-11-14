package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.Sha256;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

public record BackupKey(String value) {

    public static final int MAX_LENGTH = 100;
    public static final int MAX_PARSED_LENGTH = 600;

    private static final String HUMAN_READABLE_PART = "age-secret-key-";
    private static final String PREFIX = HUMAN_READABLE_PART + "1";
    private static final int KEY_BYTES = 32;

    public BackupKey {
        if (value == null) {
            throw new InvalidBackupKey();
        }
        value = value.strip().toUpperCase(Locale.ROOT);
        if (value.length() > MAX_LENGTH || !Bech32.holds(value, HUMAN_READABLE_PART, KEY_BYTES)) {
            throw new InvalidBackupKey();
        }
    }

    public static BackupKey parse(String text, BackupKeyWords wordlist) {
        if (text == null || text.length() > MAX_PARSED_LENGTH) {
            throw new InvalidBackupKey();
        }
        if (looksLikeOne(text)) {
            return new BackupKey(text);
        }
        return wordlist.keyOf(text)
                .map(bytes -> new BackupKey(Bech32.encode(HUMAN_READABLE_PART, bytes)))
                .orElseThrow(InvalidBackupKey::new);
    }

    public static boolean looksLikeOne(String value) {
        return value != null && value.strip().toLowerCase(Locale.ROOT).startsWith(PREFIX);
    }

    public List<String> words(BackupKeyWords wordlist) {
        return wordlist.of(Bech32.decode(value, HUMAN_READABLE_PART, KEY_BYTES).orElseThrow(InvalidBackupKey::new));
    }

    public boolean matches(List<BackupKeyWordCheck> checks, BackupKeyWords wordlist) {
        if (checks.isEmpty()) {
            return false;
        }
        List<String> words = words(wordlist);
        return checks.stream().allMatch(check -> wordlist.canonical(check.word())
                .filter(word -> word.equals(words.get(check.position() - 1)))
                .isPresent());
    }

    public String fingerprint() {
        return Sha256.hex(value.getBytes(StandardCharsets.US_ASCII));
    }

    @Override
    public String toString() {
        return "BackupKey[********]";
    }
}
