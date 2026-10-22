package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.DonorType;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

import static cz.novanadeje.app.donations.domain.bank.BankTexts.require;

public final class CounterpartyNames {

    private static final Set<String> LEGAL_FORMS = Set.of("SRO", "SPOL", "AS", "ZS", "OPS", "VOS", "KS", "ZU", "SE", "SPOLEK", "NADACE");
    private static final String COOPERATIVE = "DRUZSTV";
    private static final List<String> FOUNDATION_FUND = List.of("NADACNI", "FOND");

    private CounterpartyNames() {
    }

    public static boolean looksLikeLegalEntity(String name) {
        List<String> tokens = tokens(require(name, "Counterparty name"));
        return tokens.stream().anyMatch(token -> LEGAL_FORMS.contains(token) || token.startsWith(COOPERATIVE))
                || Collections.indexOfSubList(tokens, FOUNDATION_FUND) >= 0;
    }

    public static boolean fitsDonorType(DonorType type, Optional<String> name) {
        require(type, "Donor type");
        return require(name, "Counterparty name").filter(text -> !text.isBlank())
                .map(text -> looksLikeLegalEntity(text) == (type == DonorType.COMPANY))
                .orElse(true);
    }

    private static List<String> tokens(String name) {
        String plain = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]", " ")
                .trim();
        List<String> tokens = new ArrayList<>();
        StringBuilder letters = new StringBuilder();
        for (String word : plain.isEmpty() ? new String[0] : plain.split(" +")) {
            if (isSingleLetter(word)) {
                letters.append(word);
                continue;
            }
            addLetterRun(letters, tokens);
            tokens.add(word);
        }
        addLetterRun(letters, tokens);
        return tokens;
    }

    private static boolean isSingleLetter(String word) {
        return word.length() == 1 && Character.isLetter(word.charAt(0));
    }

    private static void addLetterRun(StringBuilder letters, List<String> tokens) {
        if (letters.isEmpty()) {
            return;
        }
        String run = letters.toString();
        letters.setLength(0);
        Optional<String> endingForm = LEGAL_FORMS.stream().filter(form -> run.length() > form.length() && run.endsWith(form)).findFirst();
        if (endingForm.isPresent()) {
            tokens.add(run.substring(0, run.length() - endingForm.get().length()));
            tokens.add(endingForm.get());
        } else {
            tokens.add(run);
        }
    }
}
