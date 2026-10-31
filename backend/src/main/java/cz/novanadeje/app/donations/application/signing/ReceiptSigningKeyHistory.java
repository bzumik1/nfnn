package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public record ReceiptSigningKeyHistory(Set<ReceiptSigningKeyId> recorded, Set<ReceiptSigningKeyId> withdrawn) {

    public static final Set<String> ACTIONS = Set.of(ReceiptSigningKeyRegistration.ACTION, ReceiptSigningKeyRegistration.ADOPT_ACTION,
            ReceiptSigningKeyWithdrawal.ACTION);

    public ReceiptSigningKeyHistory {
        recorded = Set.copyOf(recorded);
        withdrawn = Set.copyOf(withdrawn);
    }

    public static ReceiptSigningKeyHistory of(List<AdminActionEntry> entries, Set<ReceiptSigningKeyId> keptAside) {
        Set<ReceiptSigningKeyId> recorded = new HashSet<>();
        Set<ReceiptSigningKeyId> withdrawn = new HashSet<>(keptAside);
        for (AdminActionEntry entry : entries) {
            ReceiptSigningKeyAuditDetails.keyOf(entry).ifPresent(key -> {
                recorded.add(key);
                if (entry.action().equals(ReceiptSigningKeyWithdrawal.ACTION)) {
                    withdrawn.add(key);
                }
            });
        }
        return new ReceiptSigningKeyHistory(recorded, withdrawn);
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
