package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import cz.novanadeje.app.shared.application.restore.FinishedRestores;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class ReceiptSigningKeyRegistration {

    public static final String ACTION = "REGISTER_RECEIPT_SIGNING_KEY";
    public static final String ADOPT_ACTION = "ADOPT_RECEIPT_SIGNING_KEY";
    static final Duration RESTORE_WINDOW = Duration.ofHours(1);
    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyRegistration.class);

    private final ReceiptSigner signer;
    private final ReceiptSigningKeyRepository keys;
    private final RecordSeals seals;
    private final FinishedRestores restores;
    private final PublicTestKeyPolicy testKeys;
    private final AdminActionTrail trail;
    private final WithdrawnSeeds withdrawnSeeds;
    private final ApplicationEventPublisher events;
    private final TransactionOperations transactions;
    private final Clock clock;

    public ReceiptSigningKeyRegistration(ReceiptSigner signer, ReceiptSigningKeyRepository keys, RecordSeals seals, FinishedRestores restores,
                                         PublicTestKeyPolicy testKeys, AdminActionTrail trail, WithdrawnSeeds withdrawnSeeds,
                                         ApplicationEventPublisher events, TransactionOperations transactions, Clock clock) {
        this.signer = signer;
        this.keys = keys;
        this.seals = seals;
        this.restores = restores;
        this.testKeys = testKeys;
        this.trail = trail;
        this.withdrawnSeeds = withdrawnSeeds;
        this.events = events;
        this.transactions = transactions;
        this.clock = clock;
    }

    public void registerOwnKey() {
        Registration outcome = transactions.execute(status -> register());
        outcome.testKeys().forEach(id -> log.error("Receipt signing key {} is a public test key of RFC 8032, so it is not published", id));
        outcome.broken().forEach(id -> log.error("Receipt signing key {} fails its seal, so it is not published", id));
        outcome.unconfirmed().forEach(id ->
                log.error("Receipt signing key {} is sealed by the settings key of another server and no restore confirms it, so it is not published", id));
        outcome.adopted().forEach(id -> log.warn("Receipt signing key {} from a restored backup is sealed again and published", id));
        outcome.registered().ifPresent(id -> log.warn("Receipt signing key {} registered and published", id));
        outcome.mismatches().forEach(mismatch -> {
            switch (mismatch.kind()) {
                case MISSING -> log.error("Receipt signing key {} is in the audit trail but its row is missing", mismatch.keyId());
                case REVERTED -> log.error("Receipt signing key {} was withdrawn but its row is active again, so it is published as withdrawn",
                        mismatch.keyId());
            }
        });
        if (outcome.ownKeyWithdrawn()) {
            log.error("Receipt signing key {} of this server is withdrawn, so the server signs no receipt until it starts with a new seed", signer.keyId());
        }
    }

    private Registration register() {
        Instant now = clock.instant();
        Optional<FinishedRestore> restore = restoreToAdoptFrom(now);
        ReceiptSigningKeyHistory history = ReceiptSigningKeyHistory.of(trail.findByActions(ReceiptSigningKeyHistory.ACTIONS), withdrawnSeeds.keyIds());
        List<ReceiptSigningKey> stored = keys.findAll();
        List<ReceiptSigningKeyId> testKeyRows = new ArrayList<>();
        List<ReceiptSigningKeyId> broken = new ArrayList<>();
        List<ReceiptSigningKeyId> unconfirmed = new ArrayList<>();
        List<ReceiptSigningKeyId> adopted = new ArrayList<>();
        for (ReceiptSigningKey key : stored) {
            if (testKeys.refuses(key.id())) {
                testKeyRows.add(key.id());
                continue;
            }
            SealVerdict verdict = key.idMatchesPublicKey() ? seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal())
                    : SealVerdict.BROKEN;
            if (verdict == SealVerdict.BROKEN) {
                broken.add(key.id());
            } else if (verdict == SealVerdict.SEALED_BY_CARRIED_KEY && restore.isPresent()) {
                adopt(key, restore.get(), now);
                adopted.add(key.id());
            } else if (verdict == SealVerdict.SEALED_BY_CARRIED_KEY) {
                unconfirmed.add(key.id());
            }
        }
        ReceiptSigningKeyId own = signer.keyId();
        Optional<ReceiptSigningKey> ownRow = stored.stream().filter(key -> key.id().equals(own)).findFirst();
        boolean ownKeyWithdrawn = history.isWithdrawn(own) || ownRow.filter(ReceiptSigningKey::isWithdrawn).isPresent();
        Optional<ReceiptSigningKeyId> registered = ownRow.isPresent() || ownKeyWithdrawn ? Optional.empty() : Optional.of(registerOwn(now));
        return new Registration(testKeyRows, broken, unconfirmed, adopted, registered, history.mismatches(keys.findAll()), ownKeyWithdrawn);
    }

    private Optional<FinishedRestore> restoreToAdoptFrom(Instant now) {
        Optional<FinishedRestore> last = restores.lastSucceeded().filter(restore -> !restore.finishedAt().isBefore(now.minus(RESTORE_WINDOW)));
        if (last.isEmpty() || !keys.recordRestoreAdoption(last.get().id(), now)) {
            return Optional.empty();
        }
        return last;
    }

    private void adopt(ReceiptSigningKey key, FinishedRestore restore, Instant now) {
        keys.save(key.sealedAgain(seals.seal(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent())));
        events.publishEvent(new AdminActionPerformed(AdminActionPerformed.SERVER, ADOPT_ACTION, Optional.empty(),
                ReceiptSigningKeyAuditDetails.adopted(key.id(), restore.id()), now));
    }

    private ReceiptSigningKeyId registerOwn(Instant now) {
        ReceiptSigningKey key = ReceiptSigningKey.register(signer.publicKey(), now, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content));
        keys.save(key);
        events.publishEvent(new AdminActionPerformed(AdminActionPerformed.SERVER, ACTION, Optional.empty(),
                ReceiptSigningKeyAuditDetails.registered(key.id()), now));
        return key.id();
    }

    private record Registration(List<ReceiptSigningKeyId> testKeys, List<ReceiptSigningKeyId> broken, List<ReceiptSigningKeyId> unconfirmed, List<ReceiptSigningKeyId> adopted,
                                Optional<ReceiptSigningKeyId> registered, List<ReceiptSigningKeyMismatch> mismatches, boolean ownKeyWithdrawn) {
    }
}
