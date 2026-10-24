package cz.novanadeje.app.donations.application.recovery;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.recovery.RecoveryDecision;
import cz.novanadeje.app.donations.domain.recovery.SecondFactorRecoveryPolicy;
import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
import cz.novanadeje.app.shared.application.recovery.SecondFactorRecoveryTarget;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class SecondFactorRecoveryPayments {

    private static final Logger log = LoggerFactory.getLogger(SecondFactorRecoveryPayments.class);

    private final DonorRecordRepository donorRecords;
    private final SecondFactorRecoveryPolicy policy;
    private final BankAccount foundationAccount;
    private final ApplicationEventPublisher events;

    public SecondFactorRecoveryPayments(DonorRecordRepository donorRecords, ExcludedSenderAccounts excluded, BankAccount foundationAccount,
                                        ApplicationEventPublisher events) {
        this.donorRecords = donorRecords;
        this.policy = new SecondFactorRecoveryPolicy(excluded);
        this.foundationAccount = foundationAccount;
        this.events = events;
    }

    @Transactional
    public void inspect(List<BankPayment> fresh, Instant now) {
        for (BankPayment payment : fresh) {
            List<DonorRecord> owners = payment.sender().map(donorRecords::findBySenderAccount).orElse(List.of());
            policy.decide(payment, owners).ifPresent(decision -> {
                switch (decision) {
                    case RecoveryDecision.Recover(DonorRecord donor, var code, var account) -> {
                        log.info("Bank payment {} asks to recover the second factor of donor {}", payment.transactionId(), donor.id());
                        events.publishEvent(new SecondFactorRecoveryPaid(donor.id().value(), code, account.shortDisplay(), now));
                    }
                    case RecoveryDecision.Refuse(var reason) ->
                            log.info("Bank payment {} carries a second-factor recovery code but recovers nothing: {}", payment.transactionId(), reason);
                }
            });
        }
    }

    @Transactional(readOnly = true)
    public Optional<SecondFactorRecoveryTarget> targetFor(DonorReference donorId) {
        return donorRecords.findById(donorId)
                .flatMap(policy::usableFrom)
                .map(usableFrom -> new SecondFactorRecoveryTarget(foundationAccount.accountNumber(), foundationAccount.iban().value(),
                        SecondFactorRecoveryPolicy.AMOUNT, usableFrom));
    }
}
