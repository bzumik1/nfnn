package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Optional;

public final class VariableSymbols {

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
}
