package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;

import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ReceiptSigningKeyAuditDetails {

    private static final String REGISTERED = "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: ";
    private static final String ADOPTED = "Server převzal klíč k ověřovacím QR ";
    private static final String ADOPTED_FROM = " z obnovené zálohy (obnova ";
    private static final String ADOPTED_END = ")";
    private static final String WITHDRAWN = "Stažen klíč k ověřovacím QR ";
    private static final String WITHDRAWN_END = " (ověřeno druhým faktorem)";

    private static final String KEY = "(?<key>[0-9a-f]{8})";
    private static final Map<String, Pattern> SHAPES = Map.of(
            ReceiptSigningKeyRegistration.ACTION, Pattern.compile(Pattern.quote(REGISTERED) + KEY),
            ReceiptSigningKeyRegistration.ADOPT_ACTION,
            Pattern.compile(Pattern.quote(ADOPTED) + KEY + Pattern.quote(ADOPTED_FROM) + ".+" + Pattern.quote(ADOPTED_END)),
            ReceiptSigningKeyWithdrawal.ACTION, Pattern.compile(Pattern.quote(WITHDRAWN) + KEY + Pattern.quote(WITHDRAWN_END)));

    private ReceiptSigningKeyAuditDetails() {
    }

    public static String registered(ReceiptSigningKeyId key) {
        return REGISTERED + key;
    }

    public static String adopted(ReceiptSigningKeyId key, String restoreId) {
        return ADOPTED + key + ADOPTED_FROM + restoreId + ADOPTED_END;
    }

    public static String withdrawn(ReceiptSigningKeyId key) {
        return WITHDRAWN + key + WITHDRAWN_END;
    }

    static Optional<ReceiptSigningKeyId> keyOf(AdminActionEntry entry) {
        return Optional.ofNullable(SHAPES.get(entry.action()))
                .map(shape -> shape.matcher(entry.details()))
                .filter(Matcher::matches)
                .map(matcher -> new ReceiptSigningKeyId(matcher.group("key")));
    }
}
