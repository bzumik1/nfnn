package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public record ReceiptSigningKeyHistory(Set<ReceiptSigningKeyId> recorded, Set<ReceiptSigningKeyId> withdrawn) {

    public static final Set<String> ACTIONS = Set.of(ReceiptSigningKeyRegistration.ACTION, ReceiptSigningKeyRegistration.ADOPT_ACTION,
            ReceiptSigningKeyWithdrawal.ACTION);

    private static final String KEY = "(?<key>[0-9a-f]{8})";
    private static final Map<String, Pattern> DETAILS = Map.of(
            ReceiptSigningKeyRegistration.ACTION, Pattern.compile("Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: " + KEY),
            ReceiptSigningKeyRegistration.ADOPT_ACTION, Pattern.compile("Server převzal klíč k ověřovacím QR " + KEY + " z obnovené zálohy \\(obnova .+\\)"),
            ReceiptSigningKeyWithdrawal.ACTION, Pattern.compile("Stažen klíč k ověřovacím QR " + KEY + " \\(ověřeno druhým faktorem\\)"));

    public ReceiptSigningKeyHistory {
        recorded = Set.copyOf(recorded);
        withdrawn = Set.copyOf(withdrawn);
    }

    public static ReceiptSigningKeyHistory of(List<AdminActionEntry> entries) {
        Set<ReceiptSigningKeyId> recorded = new HashSet<>();
        Set<ReceiptSigningKeyId> withdrawn = new HashSet<>();
        for (AdminActionEntry entry : entries) {
            keyOf(entry).ifPresent(key -> {
                recorded.add(key);
                if (entry.action().equals(ReceiptSigningKeyWithdrawal.ACTION)) {
                    withdrawn.add(key);
                }
            });
        }
        return new ReceiptSigningKeyHistory(recorded, withdrawn);
    }

    private static Optional<ReceiptSigningKeyId> keyOf(AdminActionEntry entry) {
        return Optional.ofNullable(DETAILS.get(entry.action()))
                .map(pattern -> pattern.matcher(entry.details()))
                .filter(Matcher::matches)
                .map(matcher -> new ReceiptSigningKeyId(matcher.group("key")));
    }

    public boolean isWithdrawn(ReceiptSigningKeyId id) {
        return withdrawn.contains(id);
    }

    public List<ReceiptSigningKeyMismatch> mismatches(List<ReceiptSigningKey> rows) {
        Map<ReceiptSigningKeyId, ReceiptSigningKey> byId = rows.stream().collect(Collectors.toMap(ReceiptSigningKey::id, Function.identity(), (first, second) -> first));
        Stream<ReceiptSigningKeyMismatch> missing = recorded.stream().filter(id -> !byId.containsKey(id))
                .map(id -> new ReceiptSigningKeyMismatch(id, ReceiptSigningKeyMismatch.Kind.MISSING));
        Stream<ReceiptSigningKeyMismatch> reverted = withdrawn.stream().filter(id -> byId.containsKey(id) && !byId.get(id).isWithdrawn())
                .map(id -> new ReceiptSigningKeyMismatch(id, ReceiptSigningKeyMismatch.Kind.REVERTED));
        return Stream.concat(missing, reverted).sorted(Comparator.comparing(mismatch -> mismatch.keyId().value())).toList();
    }
}
