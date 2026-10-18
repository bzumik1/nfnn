package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public final class SenderAccountLink {

    private final SenderAccountLinkId id;
    private final SenderAccount account;
    private SenderAccountLinkStatus status;
    private BankPaymentId provedBy;
    private Instant provedAt;
    private final LocalDate validFrom;
    private LocalDate validTo;
    private final Instant createdAt;
    private Instant disconnectedAt;

    private SenderAccountLink(SenderAccountLinkId id, SenderAccount account, SenderAccountLinkStatus status, Optional<BankPaymentId> provedBy,
                              Optional<Instant> provedAt, Optional<LocalDate> validFrom, Optional<LocalDate> validTo, Instant createdAt,
                              Optional<Instant> disconnectedAt) {
        this.id = require(id, "Sender account link id");
        this.account = require(account, "Sender account");
        this.status = require(status, "Link status");
        this.provedBy = require(provedBy, "Proving payment").orElse(null);
        this.provedAt = require(provedAt, "Proof time").orElse(null);
        this.validFrom = require(validFrom, "Start").orElse(null);
        this.validTo = require(validTo, "End").orElse(null);
        this.createdAt = require(createdAt, "Creation time");
        this.disconnectedAt = require(disconnectedAt, "Disconnection time").orElse(null);
        requireConsistentState();
    }

    public static SenderAccountLink provedBy(SenderAccountLinkId id, BankPayment payment, Optional<LocalDate> validFrom, Instant at) {
        BankPayment proof = require(payment, "Proving payment");
        SenderAccount account = proof.sender()
                .orElseThrow(() -> new IllegalArgumentException("A payment without a Czech sender account proves no account"));
        return new SenderAccountLink(id, account, SenderAccountLinkStatus.ACTIVE, Optional.of(proof.id()), Optional.of(require(at, "Proof time")),
                validFrom, Optional.empty(), at, Optional.empty());
    }

    public static SenderAccountLink awaitingPayment(SenderAccountLinkId id, SenderAccount account, LocalDate from, Instant at) {
        return new SenderAccountLink(id, account, SenderAccountLinkStatus.AWAITING_PAYMENT, Optional.empty(), Optional.empty(),
                Optional.of(require(from, "Start")), Optional.empty(), at, Optional.empty());
    }

    public static SenderAccountLink reconstitute(SenderAccountLinkId id, SenderAccount account, SenderAccountLinkStatus status,
                                                 Optional<BankPaymentId> provedBy, Optional<Instant> provedAt, Optional<LocalDate> validFrom,
                                                 Optional<LocalDate> validTo, Instant createdAt, Optional<Instant> disconnectedAt) {
        return new SenderAccountLink(id, account, status, provedBy, provedAt, validFrom, validTo, createdAt, disconnectedAt);
    }

    public boolean pairsPaymentsBookedOn(LocalDate day) {
        require(day, "Booking day");
        return provedBy != null
                && (validFrom == null || !day.isBefore(validFrom))
                && (validTo == null || !day.isAfter(validTo));
    }

    public boolean isLive() {
        return status != SenderAccountLinkStatus.DISCONNECTED;
    }

    public boolean isActive() {
        return status == SenderAccountLinkStatus.ACTIVE;
    }

    public boolean isProvedBy(BankPayment payment) {
        return status == SenderAccountLinkStatus.AWAITING_PAYMENT
                && payment.sender().filter(account::equals).isPresent()
                && !payment.bookedOn().isBefore(validFrom);
    }

    void prove(BankPayment payment, Instant at) {
        if (!isProvedBy(require(payment, "Proving payment"))) {
            throw new IllegalStateException("Bank payment " + payment.transactionId() + " does not prove sender account link " + id);
        }
        this.provedBy = payment.id();
        this.provedAt = require(at, "Proof time");
        this.status = SenderAccountLinkStatus.ACTIVE;
    }

    void disconnect(LocalDate today, Instant at) {
        require(today, "Disconnection day");
        require(at, "Disconnection time");
        if (!isLive()) {
            throw new SenderAccountAlreadyDisconnected(id);
        }
        this.validTo = validFrom != null && today.isBefore(validFrom) ? validFrom : today;
        this.disconnectedAt = at;
        this.status = SenderAccountLinkStatus.DISCONNECTED;
    }

    public SenderAccountLinkId id() {
        return id;
    }

    public SenderAccount account() {
        return account;
    }

    public SenderAccountLinkStatus status() {
        return status;
    }

    public Optional<BankPaymentId> provedBy() {
        return Optional.ofNullable(provedBy);
    }

    public Optional<Instant> provedAt() {
        return Optional.ofNullable(provedAt);
    }

    public Optional<LocalDate> validFrom() {
        return Optional.ofNullable(validFrom);
    }

    public Optional<LocalDate> validTo() {
        return Optional.ofNullable(validTo);
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Optional<Instant> disconnectedAt() {
        return Optional.ofNullable(disconnectedAt);
    }

    private void requireConsistentState() {
        if ((provedBy == null) != (provedAt == null)) {
            throw new IllegalArgumentException("A proved sender account link needs both the payment and the time");
        }
        if (status == SenderAccountLinkStatus.ACTIVE && provedBy == null) {
            throw new IllegalArgumentException("An active sender account link needs the payment that proved it");
        }
        if (status == SenderAccountLinkStatus.AWAITING_PAYMENT && (provedBy != null || validFrom == null)) {
            throw new IllegalArgumentException("A sender account link awaiting a payment has a start and no proof yet");
        }
        boolean disconnected = status == SenderAccountLinkStatus.DISCONNECTED;
        if (disconnected != (validTo != null) || disconnected != (disconnectedAt != null)) {
            throw new IllegalArgumentException("Exactly a disconnected sender account link has an end and a disconnection time");
        }
        if (validFrom != null && validTo != null && validTo.isBefore(validFrom)) {
            throw new IllegalArgumentException("A sender account link cannot end before it starts");
        }
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
