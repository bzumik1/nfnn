package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;
import java.time.Year;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class ReceiptDocumentFactory {

    private static final Comparator<Donation> OLDEST_FIRST = Comparator.comparing(Donation::receivedOn)
            .thenComparing(Donation::recordedAt)
            .thenComparing(donation -> donation.id().value());

    private ReceiptDocumentFactory() {
    }

    public static ReceiptDocument forDonation(DonorRecord record, Donation donation, FoundationIdentity foundation, Signatory signatory,
                                              ReceiptNumber number, LocalDate issuedOn, LocaleCode locale, Optional<ReplacedReceipt> replaces) {
        List<ReceiptLine> lines = certifiedLines(record, List.of(require(donation, "Donation")));
        return new ReceiptDocument(ReceiptKind.SINGLE, number, issuedOn, locale, foundation, party(record), lines, total(lines),
                Optional.empty(), signatory, replaces);
    }

    public static ReceiptDocument forYear(DonorRecord record, Year year, List<Donation> donations, FoundationIdentity foundation,
                                          Signatory signatory, ReceiptNumber number, LocalDate issuedOn, LocaleCode locale,
                                          Optional<ReplacedReceipt> replaces) {
        List<ReceiptLine> lines = certifiedLines(record, inYear(year, donations));
        return new ReceiptDocument(ReceiptKind.YEARLY, number, issuedOn, locale, foundation, party(record), lines, total(lines),
                Optional.of(year), signatory, replaces);
    }

    public static ReceiptFingerprint fingerprintForDonation(DonorRecord record, Donation donation) {
        List<ReceiptLine> lines = certifiedLines(record, List.of(require(donation, "Donation")));
        return ReceiptFingerprint.of(ReceiptKind.SINGLE, Optional.of(donation.id()), Optional.empty(), party(record), lines, total(lines));
    }

    public static ReceiptFingerprint fingerprintForYear(DonorRecord record, Year year, List<Donation> donations) {
        List<ReceiptLine> lines = certifiedLines(record, inYear(year, donations));
        return ReceiptFingerprint.of(ReceiptKind.YEARLY, Optional.empty(), Optional.of(year), party(record), lines, total(lines));
    }

    public static ReceiptParty party(DonorRecord record) {
        DonorRecord donor = require(record, "Donor record");
        return new ReceiptParty(donor.type(), donor.name(), donor.address(), donor.companyIdentifier(), donor.variableSymbol());
    }

    public static List<ReceiptLine> lines(List<Donation> donations) {
        require(donations, "Donations").forEach(ReceiptDocumentFactory::requireReceived);
        return donations.stream()
                .sorted(OLDEST_FIRST)
                .map(donation -> new ReceiptLine(donation.id(), donation.receivedOn(), donation.amount(), donation.source()))
                .toList();
    }

    private static List<ReceiptLine> certifiedLines(DonorRecord record, List<Donation> donations) {
        require(record, "Donor record");
        if (donations.isEmpty()) {
            throw new IllegalArgumentException("A receipt certifies at least one donation");
        }
        if (donations.stream().anyMatch(donation -> !donation.donor().equals(record.id()))) {
            throw new IllegalArgumentException("A receipt certifies only donations of donor " + record.id());
        }
        return lines(donations);
    }

    private static List<Donation> inYear(Year year, List<Donation> donations) {
        require(year, "Year");
        if (require(donations, "Donations").stream().anyMatch(donation -> !donation.receivedIn(year))) {
            throw new IllegalArgumentException("A yearly receipt lists only donations received in " + year);
        }
        return donations;
    }

    private static void requireReceived(Donation donation) {
        if (!donation.isReceived()) {
            throw new IllegalArgumentException("Only a received donation is certified, not " + donation.status() + " " + donation.id());
        }
    }

    private static Money total(List<ReceiptLine> lines) {
        return lines.stream().map(ReceiptLine::amount).reduce(Money::plus).orElseThrow();
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
