package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Optional;

public final class DonationReceipt {

    private final DonationReceiptId id;
    private final DonorReference donor;
    private final ReceiptKind kind;
    private final DonationId donation;
    private final Year year;
    private final ReceiptNumber number;
    private final LocalDate issuedOn;
    private final Instant issuedAt;
    private final LocaleCode locale;
    private final ReceiptFingerprint fingerprint;
    private final ReceiptContent content;
    private final DonationReceiptId supersedes;
    private Instant supersededAt;

    private DonationReceipt(DonationReceiptId id, DonorReference donor, ReceiptKind kind, Optional<DonationId> donation, Optional<Year> year,
                            ReceiptNumber number, LocalDate issuedOn, Instant issuedAt, LocaleCode locale, ReceiptFingerprint fingerprint,
                            ReceiptContent content, Optional<DonationReceiptId> supersedes, Optional<Instant> supersededAt) {
        this.id = require(id, "Receipt id");
        this.donor = require(donor, "Donor reference");
        this.kind = require(kind, "Receipt kind");
        this.donation = require(donation, "Donation").orElse(null);
        this.year = require(year, "Year").orElse(null);
        this.number = require(number, "Receipt number");
        this.issuedOn = require(issuedOn, "Issue date");
        this.issuedAt = require(issuedAt, "Issue time");
        this.locale = require(locale, "Locale");
        this.fingerprint = require(fingerprint, "Fingerprint");
        this.content = require(content, "Content");
        this.supersedes = require(supersedes, "Superseded receipt").orElse(null);
        this.supersededAt = require(supersededAt, "Supersede time").orElse(null);
        requireSubjectMatchingKind();
    }

    public static DonationReceipt issueForDonation(DonationReceiptId id, DonorReference donor, DonationId donation, ReceiptNumber number,
                                                   LocalDate issuedOn, Instant issuedAt, LocaleCode locale, ReceiptFingerprint fingerprint,
                                                   ReceiptContent content, Optional<DonationReceiptId> supersedes) {
        return new DonationReceipt(id, donor, ReceiptKind.SINGLE, Optional.ofNullable(donation), Optional.empty(), number, issuedOn, issuedAt,
                locale, fingerprint, content, supersedes, Optional.empty());
    }

    public static DonationReceipt issueForYear(DonationReceiptId id, DonorReference donor, Year year, ReceiptNumber number, LocalDate issuedOn,
                                               Instant issuedAt, LocaleCode locale, ReceiptFingerprint fingerprint, ReceiptContent content,
                                               Optional<DonationReceiptId> supersedes) {
        return new DonationReceipt(id, donor, ReceiptKind.YEARLY, Optional.empty(), Optional.ofNullable(year), number, issuedOn, issuedAt,
                locale, fingerprint, content, supersedes, Optional.empty());
    }

    public static DonationReceipt reconstitute(DonationReceiptId id, DonorReference donor, ReceiptKind kind, Optional<DonationId> donation,
                                               Optional<Year> year, ReceiptNumber number, LocalDate issuedOn, Instant issuedAt,
                                               LocaleCode locale, ReceiptFingerprint fingerprint, ReceiptContent content,
                                               Optional<DonationReceiptId> supersedes, Optional<Instant> supersededAt) {
        return new DonationReceipt(id, donor, kind, donation, year, number, issuedOn, issuedAt, locale, fingerprint, content, supersedes,
                supersededAt);
    }

    public void markSuperseded(Instant at) {
        require(at, "Supersede time");
        if (supersededAt != null) {
            throw new IllegalStateException("Receipt " + number + " was already superseded at " + supersededAt);
        }
        supersededAt = at;
    }

    public boolean certifies(ReceiptFingerprint candidate) {
        return fingerprint.equals(candidate);
    }

    public boolean isActive() {
        return supersededAt == null;
    }

    public DonationReceiptId id() {
        return id;
    }

    public DonorReference donor() {
        return donor;
    }

    public ReceiptKind kind() {
        return kind;
    }

    public Optional<DonationId> donation() {
        return Optional.ofNullable(donation);
    }

    public Optional<Year> year() {
        return Optional.ofNullable(year);
    }

    public ReceiptNumber number() {
        return number;
    }

    public LocalDate issuedOn() {
        return issuedOn;
    }

    public Instant issuedAt() {
        return issuedAt;
    }

    public LocaleCode locale() {
        return locale;
    }

    public ReceiptFingerprint fingerprint() {
        return fingerprint;
    }

    public ReceiptContent content() {
        return content;
    }

    public Optional<DonationReceiptId> supersedes() {
        return Optional.ofNullable(supersedes);
    }

    public Optional<Instant> supersededAt() {
        return Optional.ofNullable(supersededAt);
    }

    private void requireSubjectMatchingKind() {
        boolean single = kind == ReceiptKind.SINGLE && donation != null && year == null;
        boolean yearly = kind == ReceiptKind.YEARLY && donation == null && year != null;
        if (!single && !yearly) {
            throw new IllegalArgumentException("A single receipt names its donation and a yearly receipt its year, never both");
        }
    }

    private static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value;
    }
}
