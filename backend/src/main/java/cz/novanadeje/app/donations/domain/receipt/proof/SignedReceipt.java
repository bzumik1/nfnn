package cz.novanadeje.app.donations.domain.receipt.proof;

import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

public record SignedReceipt(ReceiptKind kind, ReceiptNumber number, LocalDate issuedOn, Optional<Year> year, Optional<ReplacedReceipt> replaces,
                            SignedDonor donor, List<SignedGift> gifts, long totalMinor) {

    public SignedReceipt {
        if (kind == null || number == null || issuedOn == null || year == null || replaces == null || donor == null || gifts == null) {
            throw new IllegalArgumentException("A signed receipt needs every one of its parts (even when absent)");
        }
        gifts = List.copyOf(gifts);
        if (gifts.isEmpty()) {
            throw new IllegalArgumentException("A signed receipt certifies at least one gift");
        }
        requireIssuedIn(number, issuedOn);
        replaces.ifPresent(replaced -> requireIssuedIn(replaced.number(), replaced.issuedOn()));
        if (kind == ReceiptKind.SINGLE && (gifts.size() != 1 || year.isPresent())) {
            throw new IllegalArgumentException("A single receipt signs one gift and no year");
        }
        if (kind == ReceiptKind.YEARLY) {
            Year covered = year.orElseThrow(() -> new IllegalArgumentException("A yearly receipt signs its year"));
            if (gifts.stream().anyMatch(gift -> !Year.from(gift.receivedOn()).equals(covered))) {
                throw new IllegalArgumentException("A yearly receipt signs only gifts received in " + covered);
            }
        }
        for (int at = 1; at < gifts.size(); at++) {
            if (gifts.get(at).receivedOn().isBefore(gifts.get(at - 1).receivedOn())) {
                throw new IllegalArgumentException("A signed receipt lists its gifts by the day they were received");
            }
        }
        long sum = gifts.stream().mapToLong(SignedGift::amountMinor).reduce(0, Math::addExact);
        if (sum != totalMinor) {
            throw new IllegalArgumentException("The total " + totalMinor + " does not add up the gifts " + sum);
        }
    }

    public static SignedReceipt of(ReceiptDocument document) {
        SignedDonor donor = new SignedDonor(document.donor().type(), document.donor().name(), document.donor().address().street(),
                document.donor().address().city(), document.donor().address().postalCode(), document.donor().companyIdentifier());
        List<SignedGift> gifts = document.lines().stream().map(SignedReceipt::gift).toList();
        return new SignedReceipt(document.kind(), document.number(), document.issuedOn(), document.year(), document.replaces(), donor, gifts,
                document.total().amountMinor());
    }

    private static SignedGift gift(ReceiptLine line) {
        return new SignedGift(line.receivedOn(), line.amount().amountMinor());
    }

    private static void requireIssuedIn(ReceiptNumber number, LocalDate issuedOn) {
        if (!number.value().startsWith(String.format("%04d-", issuedOn.getYear()))) {
            throw new IllegalArgumentException("The receipt " + number + " carries the year it was issued, " + issuedOn.getYear());
        }
    }
}
