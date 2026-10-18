package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

public record ReceiptDocument(ReceiptKind kind, ReceiptNumber number, LocalDate issuedOn, LocaleCode locale, FoundationIdentity foundation,
                              ReceiptParty donor, List<ReceiptLine> lines, Money total, Optional<Year> year, Signatory signatory,
                              Optional<ReplacedReceipt> replaces) {

    public ReceiptDocument {
        if (kind == null || number == null || issuedOn == null || locale == null || foundation == null || donor == null || lines == null
                || total == null || year == null || signatory == null || replaces == null) {
            throw new IllegalArgumentException("A receipt document needs every one of its parts");
        }
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("A receipt document certifies at least one donation");
        }
        requireShapeOfKind(kind, lines, year);
        Money sum = lines.stream().map(ReceiptLine::amount).reduce(Money.zero(total.currency()), Money::plus);
        if (!sum.equals(total)) {
            throw new IllegalArgumentException("The total " + total + " does not add up the lines " + sum);
        }
    }

    public int count() {
        return lines.size();
    }

    private static void requireShapeOfKind(ReceiptKind kind, List<ReceiptLine> lines, Optional<Year> year) {
        if (kind == ReceiptKind.SINGLE && (lines.size() != 1 || year.isPresent())) {
            throw new IllegalArgumentException("A single receipt has one line and no year");
        }
        if (kind == ReceiptKind.YEARLY) {
            Year covered = year.orElseThrow(() -> new IllegalArgumentException("A yearly receipt names its year"));
            if (lines.stream().anyMatch(line -> !Year.from(line.receivedOn()).equals(covered))) {
                throw new IllegalArgumentException("A yearly receipt lists only donations received in " + covered);
            }
        }
    }
}
