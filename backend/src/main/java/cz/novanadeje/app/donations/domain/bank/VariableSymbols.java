package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Optional;
import java.util.Set;
import java.util.regex.MatchResult;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class VariableSymbols {

    private static final Pattern SYMBOL_IN_MESSAGE = Pattern.compile("(?<![0-9/-])[1-9][0-9]{9}(?![0-9/-])");

    private VariableSymbols() {
    }

    public static Optional<VariableSymbol> forMatching(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String trimmed = raw.trim();
        if (!trimmed.chars().allMatch(character -> character >= '0' && character <= '9')) {
            return Optional.empty();
        }
        String significant = trimmed.replaceFirst("^0+", "");
        if (significant.isEmpty() || significant.length() > VariableSymbol.MAX_LENGTH) {
            return Optional.empty();
        }
        return Optional.of(new VariableSymbol(significant));
    }

    public static Optional<VariableSymbol> inMessage(String message) {
        if (message == null) {
            return Optional.empty();
        }
        Set<String> found = SYMBOL_IN_MESSAGE.matcher(message).results().map(MatchResult::group).collect(Collectors.toSet());
        if (found.size() != 1) {
            return Optional.empty();
        }
        return Optional.of(new VariableSymbol(found.iterator().next()));
    }
}
