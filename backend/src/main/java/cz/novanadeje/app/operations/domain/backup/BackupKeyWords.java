package cz.novanadeje.app.operations.domain.backup;

import cz.novanadeje.app.shared.domain.Sha256;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

public final class BackupKeyWords {

    public static final int COUNT = 24;
    public static final int MAX_WORD_LENGTH = 40;

    private static final int KEY_BYTES = 32;
    private static final int BITS_PER_WORD = 11;
    private static final int WORDLIST_SIZE = 1 << BITS_PER_WORD;
    private static final int UNIQUE_PREFIX = 4;
    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern LETTERS = Pattern.compile("[a-z]+");
    private static final Pattern NOT_LETTERS = Pattern.compile("[^a-z]+");

    private final List<String> words;
    private final Map<String, Integer> indexByPrefix;

    public BackupKeyWords(List<String> words) {
        if (words == null || words.size() != WORDLIST_SIZE) {
            throw new IllegalStateException("The Czech BIP39 wordlist must hold " + WORDLIST_SIZE + " words");
        }
        this.words = List.copyOf(words);
        this.indexByPrefix = indexByPrefix(this.words);
    }

    public Optional<String> canonical(String typed) {
        if (typed == null) {
            return Optional.empty();
        }
        String plain = plain(typed).strip();
        if (plain.length() < UNIQUE_PREFIX || plain.length() > MAX_WORD_LENGTH || !LETTERS.matcher(plain).matches()) {
            return Optional.empty();
        }
        return Optional.ofNullable(indexByPrefix.get(plain.substring(0, UNIQUE_PREFIX)))
                .map(words::get)
                .filter(word -> word.startsWith(plain));
    }

    List<String> of(byte[] key) {
        byte[] bits = withChecksum(key);
        List<String> written = new ArrayList<>(COUNT);
        for (int word = 0; word < COUNT; word++) {
            int index = 0;
            for (int bit = 0; bit < BITS_PER_WORD; bit++) {
                index = (index << 1) | bitAt(bits, word * BITS_PER_WORD + bit);
            }
            written.add(words.get(index));
        }
        return List.copyOf(written);
    }

    Optional<byte[]> keyOf(String text) {
        List<String> typed = Arrays.stream(NOT_LETTERS.split(plain(text))).filter(token -> !token.isEmpty()).toList();
        if (typed.size() != COUNT) {
            return Optional.empty();
        }
        byte[] bits = new byte[KEY_BYTES + 1];
        for (int word = 0; word < COUNT; word++) {
            Optional<String> canonical = canonical(typed.get(word));
            if (canonical.isEmpty()) {
                return Optional.empty();
            }
            int index = indexByPrefix.get(canonical.get().substring(0, UNIQUE_PREFIX));
            for (int bit = 0; bit < BITS_PER_WORD; bit++) {
                if (((index >>> (BITS_PER_WORD - 1 - bit)) & 1) == 1) {
                    int position = word * BITS_PER_WORD + bit;
                    bits[position / 8] |= (byte) (0x80 >>> (position % 8));
                }
            }
        }
        byte[] key = Arrays.copyOf(bits, KEY_BYTES);
        return Arrays.equals(withChecksum(key), bits) ? Optional.of(key) : Optional.empty();
    }

    private static byte[] withChecksum(byte[] key) {
        byte[] bits = Arrays.copyOf(key, KEY_BYTES + 1);
        bits[KEY_BYTES] = Sha256.digest(key)[0];
        return bits;
    }

    private static int bitAt(byte[] bytes, int position) {
        return (bytes[position / 8] >>> (7 - position % 8)) & 1;
    }

    private static String plain(String text) {
        return MARKS.matcher(Normalizer.normalize(text, Normalizer.Form.NFKD)).replaceAll("").toLowerCase(Locale.ROOT);
    }

    private static Map<String, Integer> indexByPrefix(List<String> words) {
        Map<String, Integer> index = new HashMap<>();
        for (int i = 0; i < words.size(); i++) {
            if (index.put(words.get(i).substring(0, UNIQUE_PREFIX), i) != null) {
                throw new IllegalStateException("Every word of the BIP39 list starts with its own four letters");
            }
        }
        return Map.copyOf(index);
    }
}
