package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentAlreadyPaired;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentNotFound;
import cz.novanadeje.app.donations.domain.bank.BankPaymentNotPaired;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationHasReceipt;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordNotFound;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.Year;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class ManualPairingService {

    static final String PAIR_ACTION = "PAIR_PAYMENT";
    static final String UNPAIR_ACTION = "UNPAIR_PAYMENT";

    private static final Logger log = LoggerFactory.getLogger(ManualPairingService.class);

    private final BankPaymentRepository payments;
    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final DonationReceiptRepository receipts;
    private final PairingLock lock;
    private final ApplicationEventPublisher events;
    private final FirstReceiptYear firstYear;
    private final Clock clock;

    public ManualPairingService(BankPaymentRepository payments, DonorRecordRepository donorRecords, DonationRepository donations,
                                DonationReceiptRepository receipts, PairingLock lock, ApplicationEventPublisher events, FirstReceiptYear firstYear,
                                Clock clock) {
        this.payments = payments;
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.receipts = receipts;
        this.lock = lock;
        this.events = events;
        this.firstYear = firstYear;
        this.clock = clock;
    }

    public ManualPairingResult pair(UUID adminId, BankPaymentId paymentId, DonorReference donorId) {
        lock.acquire();
        Instant now = clock.instant();
        BankPayment payment = payments.findById(paymentId).orElseThrow(() -> new BankPaymentNotFound(paymentId));
        if (donations.existsForBankPayment(paymentId)) {
            throw new BankPaymentAlreadyPaired(paymentId);
        }
        DonorRecord donor = donorRecords.findById(donorId).orElseThrow(() -> new DonorRecordNotFound(donorId));
        receipts.lockDonor(donor.id());
        Donation donation = Donation.fromBankPayment(DonationId.newId(now), donor.id(), payment, PairingMethod.MANUAL, now);
        donations.save(donation);
        events.publishEvent(new AdminActionPerformed(adminId, PAIR_ACTION, Optional.of(paymentId.value()),
                "Platba " + payment.transactionId() + " (" + payment.amount() + ", zaúčtována " + payment.bookedOn() + ") ručně přiřazena dárci "
                        + donor.id() + " jako dar " + donation.id(), now));
        log.info("Admin {} paired bank payment {} with donor {} by hand", adminId, payment.transactionId(), donor.id());
        return new ManualPairingResult(donation.id(), changedYearlyReceipts(donor.id(), donation.receivedYear()));
    }

    public List<Year> unpair(UUID adminId, BankPaymentId paymentId) {
        lock.acquire();
        Instant now = clock.instant();
        BankPayment payment = payments.findById(paymentId).orElseThrow(() -> new BankPaymentNotFound(paymentId));
        Donation donation = donations.findByBankPayment(paymentId).orElseThrow(() -> new BankPaymentNotPaired(paymentId));
        receipts.lockDonor(donation.donor());
        if (receipts.existsForDonation(donation.id())) {
            throw new DonationHasReceipt(donation.id());
        }
        donations.delete(donation.id());
        payments.save(payment.unpairedByAdmin(now));
        events.publishEvent(new AdminActionPerformed(adminId, UNPAIR_ACTION, Optional.of(paymentId.value()),
                "Dar " + donation.id() + " dárce " + donation.donor() + " (spárován podle " + donation.pairedBy().orElseThrow()
                        + ") odebrán z platby " + payment.transactionId() + "; platba se od teď páruje jen ručně", now));
        log.info("Admin {} unpaired bank payment {} from donor {}", adminId, payment.transactionId(), donation.donor());
        return changedYearlyReceipts(donation.donor(), donation.receivedYear());
    }

    private List<Year> changedYearlyReceipts(DonorReference donor, Year year) {
        if (firstYear.admits(year) && receipts.findActiveForYear(donor, year).isPresent()) {
            return List.of(year);
        }
        return List.of();
    }
}
