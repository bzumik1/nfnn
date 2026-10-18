package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.shared.domain.Money;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Year;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

public record ReceiptFingerprint(String value) {

    private static final Pattern FORMAT = Pattern.compile("[0-9a-f]{64}");
    private static final Comparator<ReceiptLine> CANONICAL_ORDER = Comparator.comparing(ReceiptLine::receivedOn)
            .thenComparing(line -> line.donationId().value());

    public ReceiptFingerprint {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new IllegalArgumentException("A receipt fingerprint is 64 lowercase hex characters: " + value);
        }
    }

    public static ReceiptFingerprint of(ReceiptDocument document) {
        Optional<DonationId> donation = document.kind() == ReceiptKind.SINGLE
                ? Optional.of(document.lines().getFirst().donationId())
                : Optional.empty();
        return of(document.kind(), donation, document.year(), document.donor(), document.lines(), document.total());
    }

    public static ReceiptFingerprint of(ReceiptKind kind, Optional<DonationId> donation, Optional<Year> year, ReceiptParty donor,
                                        List<ReceiptLine> lines, Money total) {
        StringBuilder canonical = new StringBuilder()
                .append("kind=").append(kind).append('\n')
                .append("donation=").append(donation.map(DonationId::toString).orElse("")).append('\n')
                .append("year=").append(year.map(Year::toString).orElse("")).append('\n')
                .append("donor.type=").append(donor.type()).append('\n')
                .append("donor.name=").append(escaped(donor.name())).append('\n')
                .append("donor.companyIdentifier=").append(escaped(donor.companyIdentifier().orElse(""))).append('\n')
                .append("donor.street=").append(escaped(donor.address().street())).append('\n')
                .append("donor.city=").append(escaped(donor.address().city())).append('\n')
                .append("donor.postalCode=").append(escaped(donor.address().postalCode())).append('\n');
        lines.stream().sorted(CANONICAL_ORDER).forEach(line -> canonical.append("line=")
                .append(line.donationId()).append('|')
                .append(line.receivedOn()).append('|')
                .append(line.amount().amountMinor()).append('|')
                .append(line.amount().currency()).append('\n'));
        canonical.append("total=").append(total.amountMinor()).append('|').append(total.currency()).append('\n');
        return new ReceiptFingerprint(sha256Hex(canonical.toString()));
    }

    private static String escaped(String text) {
        return text.replace("\\", "\\\\").replace("\n", "\\n").replace("|", "\\|");
    }

    private static String sha256Hex(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException missing) {
            throw new IllegalStateException("SHA-256 is not available", missing);
        }
    }
}
