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
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
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
    private final SymbolClaimRepository claims;
    private final PairingLock lock;
    private final ExcludedSenderAccounts excluded;
    private final PaymentPairingPolicy policy;

    public PaymentPairingService(BankPaymentRepository payments, DonorRecordRepository donorRecords, DonationRepository donations,
                                 SymbolClaimRepository claims, PairingLock lock, ExcludedSenderAccounts excluded) {
        this.payments = payments;
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.claims = claims;
        this.lock = lock;
        this.excluded = excluded;
        this.policy = new PaymentPairingPolicy(excluded);
    }

    public PairingOutcome pairUnpaired(Instant now) {
        lock.acquire();
        List<BankPayment> unpaired = payments.findUnpairedOrderedByBooking();
        Tally tally = new Tally();
        Map<VariableSymbol, Optional<DonorRecord>> donorsBySymbol = new HashMap<>();
        List<BankPayment> unknownSymbol = new ArrayList<>();
        for (BankPayment payment : unpaired) {
            if (payment.carriesVariableSymbol()) {
                Optional<DonorRecord> donor = donorsBySymbol.computeIfAbsent(payment.matchingVariableSymbol().orElseThrow(),
                        donorRecords::findByVariableSymbol);
                if (donor.isPresent()) {
                    applySymbolDecision(policy.decide(payment, donor, List.of()), payment, now, tally);
                } else {
                    unknownSymbol.add(payment);
                }
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
        pairByConfirmedSymbols(unknownSymbol, ownersByAccount, now, tally);
        return tally.outcome();
    }

    public ConfirmedSymbolPairing pairConfirmedSymbol(SymbolClaim claim, Instant now) {
        lock.acquire();
        Optional<DonorRecord> holder = donorRecords.findByVariableSymbol(claim.symbol());
        List<DonorRecord> owners = donorRecords.findBySenderAccount(claim.account());
        Tally tally = new Tally();
        List<Donation> paired = new ArrayList<>();
        for (BankPayment payment : payments.findUnpairedBySenderAccountAndMatchingVariableSymbol(claim.account(), claim.symbol())) {
            switch (policy.decide(payment, holder, owners, List.of(claim))) {
                case PairingDecision.PairByConfirmedSymbol(DonorRecord donor, SenderAccountLink link, SymbolClaim confirmed) -> {
                    Donation donation = Donation.pairedByConfirmedSymbol(DonationId.newId(now), donor.id(), payment, link.id(), confirmed.id(), now);
                    if (recordDonation(donation, payment, donor)) {
                        paired.add(donation);
                    }
                }
                case PairingDecision.PairBySymbol bySymbol -> applySymbolDecision(bySymbol, payment, now, tally);
                case PairingDecision.LeaveUnpaired(UnpairedReason reason) -> leaveUnpaired(payment, reason, tally);
                case PairingDecision.PairByAccount _ -> throw new IllegalStateException(
                        "Bank payment " + payment.transactionId() + " carries a symbol and cannot be paired by account");
            }
        }
        return new ConfirmedSymbolPairing(paired);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PairingOutcome pairPaymentsOf(DonorRecord record, Instant now) {
        lock.acquire();
        Tally tally = new Tally();
        Set<SenderAccount> learned = new LinkedHashSet<>();
        for (BankPayment payment : payments.findUnpairedByMatchingVariableSymbol(record.variableSymbol())) {
            applySymbolDecision(policy.decide(payment, Optional.of(record), List.of()), payment, now, tally)
                    .ifPresent(link -> learned.add(link.account()));
        }
        Set<SenderAccount> reportedAmbiguous = new HashSet<>();
        for (SenderAccount account : learned) {
            List<DonorRecord> owners = donorRecords.findBySenderAccount(account);
            for (BankPayment payment : payments.findUnpairedWithoutSymbolBySenderAccount(account)) {
                applyAccountDecision(policy.decide(payment, Optional.empty(), owners), payment, now, tally, reportedAmbiguous);
            }
        }
        PairingOutcome outcome = tally.outcome();
        log.info("Payments of donor {} paired after the registration: {} by symbol, {} by account, {} accounts learned", record.id(),
                outcome.pairedBySymbol(), outcome.pairedByAccount(), outcome.accountsLearned());
        return outcome;
    }

    private Optional<SenderAccountLink> applySymbolDecision(PairingDecision decision, BankPayment payment, Instant now, Tally tally) {
        return switch (decision) {
            case PairingDecision.PairBySymbol(DonorRecord donor) -> {
                if (recordDonation(Donation.fromBankPayment(DonationId.newId(now), donor.id(), payment, PairingMethod.VARIABLE_SYMBOL, now),
                        payment, donor)) {
                    tally.pairedBySymbol++;
                }
                yield learnSenderAccount(donor, payment, now, tally);
            }
            case PairingDecision.LeaveUnpaired(UnpairedReason reason) -> {
                leaveUnpaired(payment, reason, tally);
                yield Optional.empty();
            }
            case PairingDecision.PairByAccount _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " carries a symbol and cannot be paired by account");
            case PairingDecision.PairByConfirmedSymbol _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " is paired by its confirmed symbol in another pass");
        };
    }

    private Optional<SenderAccountLink> learnSenderAccount(DonorRecord donor, BankPayment payment, Instant now, Tally tally) {
        Optional<LocalDate> takenOverOn = payment.sender()
                .flatMap(sender -> donorRecords.findBySenderAccount(sender).stream()
                        .filter(other -> !other.id().equals(donor.id()))
                        .flatMap(other -> other.releasedSenderAccountOn(sender).stream())
                        .max(Comparator.naturalOrder()));
        Optional<SenderAccountLink> learned = donor.learnSenderAccountFrom(payment, takenOverOn, excluded, now);
        learned.ifPresent(link -> {
            if (donorRecords.saveSenderAccountLink(donor.id(), link)) {
                tally.accountsLearned++;
                log.debug("Donor {} learned sender account {} from bank payment {}", donor.id(), link.account().display(),
                        payment.transactionId());
            }
        });
        return learned;
    }

    private void applyAccountDecision(PairingDecision decision, BankPayment payment, Instant now, Tally tally,
                                      Set<SenderAccount> reportedAmbiguous) {
        switch (decision) {
            case PairingDecision.PairByAccount(DonorRecord donor, SenderAccountLink link) -> {
                if (recordDonation(Donation.pairedBySenderAccount(DonationId.newId(now), donor.id(), payment, link.id(), now), payment, donor)) {
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
            case PairingDecision.PairBySymbol _, PairingDecision.PairByConfirmedSymbol _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " carries no symbol and cannot be paired by symbol");
        }
    }

    private void pairByConfirmedSymbols(List<BankPayment> unknownSymbol, Map<SenderAccount, List<DonorRecord>> ownersByAccount, Instant now,
                                        Tally tally) {
        if (unknownSymbol.isEmpty()) {
            return;
        }
        List<SymbolClaim> confirmed = claims.findConfirmed();
        Set<SenderAccount> reportedAmbiguous = new HashSet<>();
        for (BankPayment payment : unknownSymbol) {
            List<SymbolClaim> matching = confirmed.stream().filter(claim -> claim.confirms(payment)).toList();
            List<DonorRecord> owners = matching.isEmpty()
                    ? List.of()
                    : ownersByAccount.computeIfAbsent(payment.sender().orElseThrow(), donorRecords::findBySenderAccount);
            applyClaimDecision(policy.decide(payment, Optional.empty(), owners, matching), payment, matching, now, tally, reportedAmbiguous);
        }
    }

    private void applyClaimDecision(PairingDecision decision, BankPayment payment, List<SymbolClaim> matching, Instant now, Tally tally,
                                    Set<SenderAccount> reportedAmbiguous) {
        switch (decision) {
            case PairingDecision.PairByConfirmedSymbol(DonorRecord donor, SenderAccountLink link, SymbolClaim claim) -> {
                if (recordDonation(Donation.pairedByConfirmedSymbol(DonationId.newId(now), donor.id(), payment, link.id(), claim.id(), now),
                        payment, donor)) {
                    tally.pairedByConfirmedSymbol++;
                }
            }
            case PairingDecision.LeaveUnpaired(UnpairedReason reason) -> {
                if (reason == UnpairedReason.AMBIGUOUS_SENDER_ACCOUNT && reportedAmbiguous.add(payment.sender().orElseThrow())) {
                    log.warn("Bank payment {} stays unpaired: symbol claim {} confirms its symbol but several donors' links cover its booking day",
                            payment.transactionId(), matching.getFirst().id());
                }
                leaveUnpaired(payment, reason, tally);
            }
            case PairingDecision.PairBySymbol _, PairingDecision.PairByAccount _ ->
                    throw new IllegalStateException("Bank payment " + payment.transactionId() + " carries a symbol no donor has");
        }
    }

    private boolean recordDonation(Donation donation, BankPayment payment, DonorRecord donor) {
        if (donations.existsForBankPayment(payment.id())) {
            log.debug("Bank payment {} already has a donation", payment.transactionId());
            return false;
        }
        donations.save(donation);
        log.debug("Bank payment {} paired with donor {} by {}", payment.transactionId(), donor.id(), donation.pairedBy().orElseThrow());
        return true;
    }

    private static void leaveUnpaired(BankPayment payment, UnpairedReason reason, Tally tally) {
        tally.leftUnpaired++;
        log.debug("Bank payment {} stays unpaired: {} (symbol {}, sender {})", payment.transactionId(), reason,
                payment.variableSymbol().orElse("none"), payment.sender().map(SenderAccount::display).orElse("none"));
    }

    private static final class Tally {

        private int pairedBySymbol;
        private int pairedByAccount;
        private int pairedByConfirmedSymbol;
        private int accountsLearned;
        private int leftUnpaired;

        private PairingOutcome outcome() {
            return new PairingOutcome(pairedBySymbol, pairedByAccount, pairedByConfirmedSymbol, accountsLearned, leftUnpaired);
        }
    }
}
