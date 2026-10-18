package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocumentFactory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

public sealed interface ReceiptRequest {

    DonorRecord record();

    LocalDate today();

    ReceiptFingerprint fingerprint();

    ReceiptDocument document(FoundationIdentity foundation, Signatory signatory, ReceiptNumber number, LocaleCode locale,
                             Optional<ReplacedReceipt> replaces);

    DonationReceipt receipt(DonationReceiptId id, ReceiptNumber number, Instant issuedAt, LocaleCode locale, ReceiptFingerprint fingerprint,
                            byte[] content, Optional<DonationReceiptId> supersedes);

    default DonorReference donor() {
        return record().id();
    }

    static ReceiptRequest forDonation(DonorRecord record, Donation donation, LocalDate today) {
        return new ForDonation(record, donation, today);
    }

    static ReceiptRequest forYear(DonorRecord record, Year year, List<Donation> donations, LocalDate today) {
        return new ForYear(record, year, donations, today);
    }

    record ForDonation(DonorRecord record, Donation donation, LocalDate today) implements ReceiptRequest {

        public ForDonation {
            if (record == null || donation == null || today == null) {
                throw new IllegalArgumentException("A receipt request for a donation needs the donor record, the donation and today");
            }
        }

        @Override
        public ReceiptFingerprint fingerprint() {
            return ReceiptDocumentFactory.fingerprintForDonation(record, donation);
        }

        @Override
        public ReceiptDocument document(FoundationIdentity foundation, Signatory signatory, ReceiptNumber number, LocaleCode locale,
                                        Optional<ReplacedReceipt> replaces) {
            return ReceiptDocumentFactory.forDonation(record, donation, foundation, signatory, number, today, locale, replaces);
        }

        @Override
        public DonationReceipt receipt(DonationReceiptId id, ReceiptNumber number, Instant issuedAt, LocaleCode locale,
                                       ReceiptFingerprint fingerprint, byte[] content, Optional<DonationReceiptId> supersedes) {
            return DonationReceipt.issueForDonation(id, donor(), donation.id(), number, today, issuedAt, locale, fingerprint, content, supersedes);
        }
    }

    record ForYear(DonorRecord record, Year year, List<Donation> donations, LocalDate today) implements ReceiptRequest {

        public ForYear {
            if (record == null || year == null || donations == null || today == null) {
                throw new IllegalArgumentException("A receipt request for a year needs the donor record, the year, its donations and today");
            }
            donations = List.copyOf(donations);
        }

        @Override
        public ReceiptFingerprint fingerprint() {
            return ReceiptDocumentFactory.fingerprintForYear(record, year, donations);
        }

        @Override
        public ReceiptDocument document(FoundationIdentity foundation, Signatory signatory, ReceiptNumber number, LocaleCode locale,
                                        Optional<ReplacedReceipt> replaces) {
            return ReceiptDocumentFactory.forYear(record, year, donations, foundation, signatory, number, today, locale, replaces);
        }

        @Override
        public DonationReceipt receipt(DonationReceiptId id, ReceiptNumber number, Instant issuedAt, LocaleCode locale,
                                       ReceiptFingerprint fingerprint, byte[] content, Optional<DonationReceiptId> supersedes) {
            return DonationReceipt.issueForYear(id, donor(), year, number, today, issuedAt, locale, fingerprint, content, supersedes);
        }
    }
}
