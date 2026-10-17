package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public final class Donation {

    private final DonationId id;
    private final DonorReference donor;
    private final BankPaymentId bankPayment;
    private final LocalDate receivedOn;
    private final Money amount;
    private final DonationSource source;
    private final DonationStatus status;
    private final PairingMethod pairedBy;
    private final Instant recordedAt;

    private Donation(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn, Money amount,
                     DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy, Instant recordedAt) {
        this.id = require(id, "Donation id");
        this.donor = require(donor, "Donor reference");
        this.bankPayment = require(bankPayment, "Bank payment").orElse(null);
        this.receivedOn = require(receivedOn, "Receipt date");
        this.amount = requirePositive(amount);
        this.source = require(source, "Donation source");
        this.status = require(status, "Donation status");
        this.pairedBy = require(pairedBy, "Pairing method").orElse(null);
        this.recordedAt = require(recordedAt, "Recording time");
        requireOriginMatchingSource();
    }

    public static Donation fromBankPayment(DonationId id, DonorReference donor, BankPayment payment, PairingMethod pairedBy,
                                           Instant recordedAt) {
        BankPayment paid = require(payment, "Bank payment");
        return new Donation(id, donor, Optional.of(paid.id()), paid.bookedOn(), paid.amount(), DonationSource.BANK_TRANSFER,
                DonationStatus.RECEIVED, Optional.ofNullable(pairedBy), recordedAt);
    }

    public static Donation reconstitute(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn,
                                        Money amount, DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy,
                                        Instant recordedAt) {
        return new Donation(id, donor, bankPayment, receivedOn, amount, source, status, pairedBy, recordedAt);
    }

    public DonationId id() {
        return id;
    }

    public DonorReference donor() {
        return donor;
    }

    public Optional<BankPaymentId> bankPayment() {
        return Optional.ofNullable(bankPayment);
    }

    public LocalDate receivedOn() {
        return receivedOn;
    }

    public Money amount() {
        return amount;
    }

    public DonationSource source() {
        return source;
    }

    public DonationStatus status() {
        return status;
    }

    public Optional<PairingMethod> pairedBy() {
        return Optional.ofNullable(pairedBy);
    }

    public Instant recordedAt() {
        return recordedAt;
    }

    private void requireOriginMatchingSource() {
        boolean pairedFromBank = bankPayment != null && pairedBy != null;
        boolean withoutBank = bankPayment == null && pairedBy == null;
        if (source == DonationSource.BANK_TRANSFER && !pairedFromBank) {
            throw new IllegalArgumentException("A bank transfer needs its bank payment and the way it was paired");
        }
        if (source == DonationSource.MANUAL && !withoutBank) {
            throw new IllegalArgumentException("A manual donation has neither a bank payment nor a pairing method");
        }
    }

    private static Money requirePositive(Money amount) {
        if (!require(amount, "Amount").isPositive()) {
            throw new IllegalArgumentException("A donation has a positive amount: " + amount);
        }
        return amount;
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
