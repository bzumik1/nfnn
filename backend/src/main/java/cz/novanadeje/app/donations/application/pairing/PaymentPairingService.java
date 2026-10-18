package cz.novanadeje.app.donations.application.pairing;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.donations.domain.pairing.PairingDecision;
import cz.novanadeje.app.donations.domain.pairing.PaymentPairingPolicy;
import cz.novanadeje.app.donations.domain.pairing.UnpairedReason;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@Transactional
public class PaymentPairingService {

    private static final Logger log = LoggerFactory.getLogger(PaymentPairingService.class);

    private final BankPaymentRepository payments;
    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final PaymentPairingPolicy policy = new PaymentPairingPolicy();

    public PaymentPairingService(BankPaymentRepository payments, DonorRecordRepository donorRecords, DonationRepository donations) {
        this.payments = payments;
        this.donorRecords = donorRecords;
        this.donations = donations;
    }

    public PairingOutcome pairUnpaired(Instant now) {
        List<BankPayment> unpaired = payments.findUnpairedOrderedByBooking();
        Tally tally = new Tally();
        Map<VariableSymbol, Optional<DonorRecord>> donorsBySymbol = new HashMap<>();
        for (BankPayment payment : unpaired) {
            if (payment.carriesVariableSymbol()) {
                Optional<DonorRecord> donor = donorsBySymbol.computeIfAbsent(payment.matchingVariableSymbol().orElseThrow(),
                        donorRecords::findByVariableSymbol);
                applySymbolDecision(policy.decide(payment, donor, List.of()), payment, now, tally);
            }
        }
        Map<SenderAccount, List<DonorRecord>> ownersByAccount = new HashMap<>();
        Set<SenderAccount> reportedAmbiguous = new HashSet<>();
        for (BankPayment payment : unpaired) {
            if (!payment.carriesVariableSymbol()) {
                List<DonorRecord> owners = payment.sender()
                        .map(sender -> ownersByAccount.computeIfAbsent(sender, donorRecords::findBySenderAccount))
                        .orElse(List.of());
                applyAccountDecision(policy.decide(payment, Optional.empty(), owners), payment, now, tally, reportedAmbiguous);
            }
        }
        return tally.outcome();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PairingOutcome pairPaymentsOf(DonorRecord record, Instant now) {
        Tally tally = new Tally();
        List<LearnedSenderAccount> learned = new ArrayList<>();
        for (BankPayment payment : payments.findUnpairedByMatchingVariableSymbol(record.variableSymbol())) {
            applySymbolDecision(policy.decide(payment, Optional.of(record), List.of()), payment, now, tally).ifPresent(learned::add);
        }
        Set<SenderAccount> reportedAmbiguous = new HashSet<>();
        for (LearnedSenderAccount account : learned) {
            List<DonorRecord> owners = donorRecords.findBySenderAccount(account.account());
            if (!isSoleOwner(record, owners)) {
                log.debug("Sender account {} of donor {} is shared with other donors; its payments without a symbol stay unpaired",
                        account.account().display(), record.id());
                continue;
            }
            for (BankPayment payment : payments.findUnpairedWithoutSymbolBySenderAccount(account.account())) {
                applyAccountDecision(policy.decide(payment, Optional.empty(), owners), payment, now, tally, reportedAmbiguous);
            }
        }
        PairingOutcome outcome = tally.outcome();
        log.info("Payments of donor {} paired after the registration: {} by symbol, {} by account, {} accounts learned", record.id(),
                outcome.pairedBySymbol(), outcome.pairedByAccount(), outcome.accountsLearned());
        return outcome;
    }

    private Optional<LearnedSenderAccount> applySymbolDecision(PairingDecision decision, BankPayment payment, Instant now, Tally tally) {
        return switch (decision) {
            case PairingDecision.PairBySymbol(DonorRecord donor) -> {
                if (recordDonation(donor, payment, PairingMethod.VARIABLE_SYMBOL, now)) {
                    tally.pairedBySymbol++;
                }
                Optional<LearnedSenderAccount> learned = donor.learnSenderAccountFrom(payment, now);
                learned.ifPresent(account -> {
                    donorRecords.addSenderAccount(donor.id(), account);
                    tally.accountsLearned++;
                    log.debug("Donor {} learned sender account {} from bank payment {}", donor.id(), account.account().display(),
                            payment.transactionId());
                });
                yield learned;
            }
            case PairingDecision.LeaveUnpaired(UnpairedReason reason) -> {
                leaveUnpaired(payment, reason, tally);
                yield Optional.empty();
            }
            case PairingDecision.PairByAccount _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " carries a symbol and cannot be paired by account");
        };
    }

    private void applyAccountDecision(PairingDecision decision, BankPayment payment, Instant now, Tally tally,
                                      Set<SenderAccount> reportedAmbiguous) {
        switch (decision) {
            case PairingDecision.PairByAccount(DonorRecord donor) -> {
                if (recordDonation(donor, payment, PairingMethod.SENDER_ACCOUNT, now)) {
                    tally.pairedByAccount++;
                }
            }
            case PairingDecision.LeaveUnpaired(UnpairedReason reason) -> {
                if (reason == UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT && reportedAmbiguous.add(payment.sender().orElseThrow())) {
                    log.warn("Bank payment {} without a variable symbol stays unpaired: its sender account was learned by several donors; "
                            + "later payments from that account stay unpaired too until they are paired by hand", payment.transactionId());
                }
                leaveUnpaired(payment, reason, tally);
            }
            case PairingDecision.PairBySymbol _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " carries no symbol and cannot be paired by symbol");
        }
    }

    private boolean recordDonation(DonorRecord donor, BankPayment payment, PairingMethod method, Instant now) {
        if (donations.existsForBankPayment(payment.id())) {
            log.debug("Bank payment {} already has a donation", payment.transactionId());
            return false;
        }
        donations.save(Donation.fromBankPayment(DonationId.newId(now), donor.id(), payment, method, now));
        log.debug("Bank payment {} paired with donor {} by {}", payment.transactionId(), donor.id(), method);
        return true;
    }

    private static void leaveUnpaired(BankPayment payment, UnpairedReason reason, Tally tally) {
        tally.leftUnpaired++;
        log.debug("Bank payment {} stays unpaired: {} (symbol {}, sender {})", payment.transactionId(), reason,
                payment.variableSymbol().orElse("none"), payment.sender().map(SenderAccount::display).orElse("none"));
    }

    private static boolean isSoleOwner(DonorRecord record, List<DonorRecord> owners) {
        return owners.size() == 1 && owners.getFirst().id().equals(record.id());
    }

    private static final class Tally {

        private int pairedBySymbol;
        private int pairedByAccount;
        private int accountsLearned;
        private int leftUnpaired;

        private PairingOutcome outcome() {
            return new PairingOutcome(pairedBySymbol, pairedByAccount, accountsLearned, leftUnpaired);
        }
    }
}
