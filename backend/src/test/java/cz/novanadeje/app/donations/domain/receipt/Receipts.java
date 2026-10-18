package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.DonationStatus;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Optional;

public final class Receipts {

    public static final Instant NOW = Instant.parse("2027-01-15T09:00:00Z");
    public static final LocalDate TODAY = LocalDate.of(2027, 1, 15);
    public static final Year YEAR_2026 = Year.of(2026);
    public static final DonorReference JANA = new DonorReference(UuidV7.generate(NOW));
    public static final DonorReference ACME = new DonorReference(UuidV7.generate(NOW.plusMillis(1)));
    public static final PostalAddress JANA_ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");
    public static final PostalAddress ACME_ADDRESS = new PostalAddress("Průmyslová 5", "Česká Lípa", "470 01");
    public static final FoundationIdentity FOUNDATION = new FoundationIdentity("Nová naděje - nadační fond", "27278794",
            new PostalAddress("Jiráskova 436", "Nový Bor", "473 01"), "Krajský soud v Ústí nad Labem", "N 78", "5544332217/2010",
            "V Novém Boru", "Nový Bor");
    public static final Signatory SIGNATORY = new Signatory("Pavel Znamenáček", "předseda správní rady");
    public static final ReceiptNumber FIRST_NUMBER = ReceiptNumber.of(Year.of(2027), 1);

    private Receipts() {
    }

    public static DonorRecord jana() {
        return DonorRecord.registerPerson(JANA, "Jana Nováková", JANA_ADDRESS, new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
    }

    public static DonorRecord janaSpeakingEnglish() {
        return DonorRecord.registerPerson(JANA, "Jana Nováková", JANA_ADDRESS, new VariableSymbol("4821937560"), LocaleCode.EN, NOW);
    }

    public static DonorRecord acme() {
        return DonorRecord.registerCompany(ACME, "Acme Třebíč s.r.o.", "25596641", ACME_ADDRESS, new VariableSymbol("7310945528"),
                LocaleCode.CS, NOW);
    }

    public static Donation receivedFromJana(LocalDate receivedOn, long amountMinor) {
        return donation(JANA, receivedOn, amountMinor, DonationStatus.RECEIVED);
    }

    public static Donation refundedToJana(LocalDate receivedOn, long amountMinor) {
        return donation(JANA, receivedOn, amountMinor, DonationStatus.REFUNDED);
    }

    public static Donation receivedFromAcme(LocalDate receivedOn, long amountMinor) {
        return donation(ACME, receivedOn, amountMinor, DonationStatus.RECEIVED);
    }

    public static ReceiptDocument singleDocument(DonorRecord record, Donation donation) {
        return ReceiptDocumentFactory.forDonation(record, donation, FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY, record.preferredLocale(),
                Optional.empty());
    }

    public static ReceiptDocument yearlyDocument(DonorRecord record, List<Donation> donations) {
        return ReceiptDocumentFactory.forYear(record, YEAR_2026, donations, FOUNDATION, SIGNATORY, FIRST_NUMBER, TODAY,
                record.preferredLocale(), Optional.empty());
    }

    private static Donation donation(DonorReference donor, LocalDate receivedOn, long amountMinor, DonationStatus status) {
        return Donation.reconstitute(DonationId.newId(NOW), donor, Optional.of(BankPaymentId.newId(NOW)), receivedOn, Money.czk(amountMinor),
                DonationSource.BANK_TRANSFER, status, Optional.of(PairingMethod.VARIABLE_SYMBOL), NOW);
    }
}
