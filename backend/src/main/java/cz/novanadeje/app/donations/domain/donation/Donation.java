package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.shared.domain.Money;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
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
    private final SenderAccountLinkId pairedThrough;
    private final SymbolClaimId confirmedClaim;
    private final DonationPurpose purpose;
    private final Instant recordedAt;

    private Donation(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn, Money amount,
                     DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy, Optional<SenderAccountLinkId> pairedThrough,
                     Optional<SymbolClaimId> confirmedClaim, DonationPurpose purpose, Instant recordedAt) {
        this.id = require(id, "Donation id");
        this.donor = require(donor, "Donor reference");
        this.bankPayment = require(bankPayment, "Bank payment").orElse(null);
        this.receivedOn = require(receivedOn, "Receipt date");
        this.amount = requirePositive(amount);
        this.source = require(source, "Donation source");
        this.status = require(status, "Donation status");
        this.pairedBy = require(pairedBy, "Pairing method").orElse(null);
        this.pairedThrough = require(pairedThrough, "Sender account link").orElse(null);
        this.confirmedClaim = require(confirmedClaim, "Confirmed symbol claim").orElse(null);
        this.purpose = require(purpose, "Purpose");
        this.recordedAt = require(recordedAt, "Recording time");
        requireOriginMatchingSource();
        requirePairingDetailsMatchingMethod();
    }

    public static Donation fromBankPayment(DonationId id, DonorReference donor, BankPayment payment, PairingMethod pairedBy,
                                           Instant recordedAt) {
        BankPayment paid = require(payment, "Bank payment");
        return new Donation(id, donor, Optional.of(paid.id()), paid.bookedOn(), paid.amount(), DonationSource.BANK_TRANSFER,
                DonationStatus.RECEIVED, Optional.ofNullable(pairedBy), Optional.empty(), Optional.empty(), DonationPurpose.of(paid), recordedAt);
    }

    public static Donation pairedBySenderAccount(DonationId id, DonorReference donor, BankPayment payment, SenderAccountLinkId link,
                                                 Instant recordedAt) {
        BankPayment paid = require(payment, "Bank payment");
        return new Donation(id, donor, Optional.of(paid.id()), paid.bookedOn(), paid.amount(), DonationSource.BANK_TRANSFER,
                DonationStatus.RECEIVED, Optional.of(PairingMethod.SENDER_ACCOUNT), Optional.of(require(link, "Sender account link")),
                Optional.empty(), DonationPurpose.of(paid), recordedAt);
    }

    public static Donation pairedByConfirmedSymbol(DonationId id, DonorReference donor, BankPayment payment, SenderAccountLinkId link,
                                                   SymbolClaimId claim, Instant recordedAt) {
        BankPayment paid = require(payment, "Bank payment");
        if (!paid.carriesVariableSymbol() || !paid.hasSender()) {
            throw new IllegalArgumentException("Only a payment with a variable symbol from a Czech account is paired by a confirmed symbol");
        }
        return new Donation(id, donor, Optional.of(paid.id()), paid.bookedOn(), paid.amount(), DonationSource.BANK_TRANSFER,
                DonationStatus.RECEIVED, Optional.of(PairingMethod.CONFIRMED_SYMBOL), Optional.of(require(link, "Sender account link")),
                Optional.of(require(claim, "Confirmed symbol claim")), DonationPurpose.of(paid), recordedAt);
    }

    public static Donation reconstitute(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn,
                                        Money amount, DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy,
                                        Instant recordedAt) {
        return reconstitute(id, donor, bankPayment, receivedOn, amount, source, status, pairedBy, Optional.empty(), recordedAt);
    }

    public static Donation reconstitute(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn,
                                        Money amount, DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy,
                                        Optional<SenderAccountLinkId> pairedThrough, Instant recordedAt) {
        return reconstitute(id, donor, bankPayment, receivedOn, amount, source, status, pairedBy, pairedThrough, Optional.empty(),
                DonationPurpose.GENERAL, recordedAt);
    }

    public static Donation reconstitute(DonationId id, DonorReference donor, Optional<BankPaymentId> bankPayment, LocalDate receivedOn,
                                        Money amount, DonationSource source, DonationStatus status, Optional<PairingMethod> pairedBy,
                                        Optional<SenderAccountLinkId> pairedThrough, Optional<SymbolClaimId> confirmedClaim,
                                        DonationPurpose purpose, Instant recordedAt) {
        return new Donation(id, donor, bankPayment, receivedOn, amount, source, status, pairedBy, pairedThrough, confirmedClaim, purpose,
                recordedAt);
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

    public Optional<SenderAccountLinkId> pairedThrough() {
        return Optional.ofNullable(pairedThrough);
    }

    public Optional<SymbolClaimId> confirmedClaim() {
        return Optional.ofNullable(confirmedClaim);
    }

    public DonationPurpose purpose() {
        return purpose;
    }

    public Instant recordedAt() {
        return recordedAt;
    }

    public boolean isReceived() {
        return status == DonationStatus.RECEIVED;
    }

    public Year receivedYear() {
        return Year.from(receivedOn);
    }

    public boolean receivedIn(Year year) {
        return receivedYear().equals(year);
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

    private void requirePairingDetailsMatchingMethod() {
        if (pairedThrough != null && pairedBy != PairingMethod.SENDER_ACCOUNT && pairedBy != PairingMethod.CONFIRMED_SYMBOL) {
            throw new IllegalArgumentException("Only a donation paired by sender account or by a confirmed symbol names the account link "
                    + "it was paired through");
        }
        if (pairedBy == PairingMethod.CONFIRMED_SYMBOL && (pairedThrough == null || confirmedClaim == null)) {
            throw new IllegalArgumentException("A donation paired by a confirmed symbol names the account link and the claim it was paired through");
        }
        if (confirmedClaim != null && pairedBy != PairingMethod.CONFIRMED_SYMBOL) {
            throw new IllegalArgumentException("Only a donation paired by a confirmed symbol names a symbol claim");
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
