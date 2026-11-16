package cz.novanadeje.app.donations.domain.recovery;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

public record NameWords(List<String> words) {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern SEPARATORS = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final String TITLE_JOINER = "et";
    private static final List<List<String>> TITLES = Arrays.stream(new String[]{
                    "ing arch", "ing", "bc", "bca", "mga", "mgr", "mudr", "mddr", "mvdr", "pharmdr", "phdr", "judr", "rndr", "paeddr",
                    "thdr", "thlic", "rsdr", "dr", "ph d", "phd", "th d", "thd", "art d", "artd", "csc", "drsc", "dsc", "dis", "mba",
                    "mpa", "ll m", "llm", "msc", "bsc", "doc", "prof"})
            .map(title -> List.of(title.split(" ")))
            .sorted(Comparator.comparingInt(List<String>::size).reversed())
            .toList();

    public NameWords {
        if (words == null || words.isEmpty() || words.stream().anyMatch(word -> word == null || word.isEmpty())) {
            throw new IllegalArgumentException("Name words need at least one word and no empty one");
        }
        words = words.stream().sorted().toList();
    }

    public static Optional<NameWords> of(String name) {
        if (name == null) {
            return Optional.empty();
        }
        List<String> words = withoutTitles(joinedInitials(tokens(name)));
        return words.isEmpty() ? Optional.empty() : Optional.of(new NameWords(words));
    }

    private static List<String> tokens(String name) {
        String plain = MARKS.matcher(Normalizer.normalize(name, Normalizer.Form.NFKD)).replaceAll("").toLowerCase(Locale.ROOT);
        return SEPARATORS.splitAsStream(plain).filter(token -> !token.isEmpty()).toList();
    }

    private static List<String> joinedInitials(List<String> tokens) {
        List<String> joined = new ArrayList<>();
        StringBuilder initials = new StringBuilder();
        for (String token : tokens) {
            if (token.length() == 1 && Character.isLetter(token.charAt(0))) {
                initials.append(token);
                continue;
            }
            if (!initials.isEmpty()) {
                joined.add(initials.toString());
                initials.setLength(0);
            }
            joined.add(token);
        }
        if (!initials.isEmpty()) {
            joined.add(initials.toString());
        }
        return joined;
    }

    private static List<String> withoutTitles(List<String> tokens) {
        List<String> kept = new ArrayList<>();
        int index = 0;
        boolean afterTitle = false;
        while (index < tokens.size()) {
            int title = titleLengthAt(tokens, index);
            if (title > 0) {
                index += title;
                afterTitle = true;
                continue;
            }
            if (afterTitle && tokens.get(index).equals(TITLE_JOINER) && titleLengthAt(tokens, index + 1) > 0) {
                index++;
                continue;
            }
            kept.add(tokens.get(index));
            afterTitle = false;
            index++;
        }
        return kept;
    }

    private static int titleLengthAt(List<String> tokens, int index) {
        return TITLES.stream()
                .filter(title -> index + title.size() <= tokens.size() && tokens.subList(index, index + title.size()).equals(title))
                .mapToInt(List::size)
                .findFirst()
                .orElse(0);
    }
}
