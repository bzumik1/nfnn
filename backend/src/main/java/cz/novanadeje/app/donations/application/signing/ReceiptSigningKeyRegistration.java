package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
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
    private final ApplicationEventPublisher events;
    private final TransactionOperations transactions;
    private final Clock clock;

    public ReceiptSigningKeyRegistration(ReceiptSigner signer, ReceiptSigningKeyRepository keys, RecordSeals seals, FinishedRestores restores,
                                         PublicTestKeyPolicy testKeys, ApplicationEventPublisher events, TransactionOperations transactions,
                                         Clock clock) {
        this.signer = signer;
        this.keys = keys;
        this.seals = seals;
        this.restores = restores;
        this.testKeys = testKeys;
        this.events = events;
        this.transactions = transactions;
        this.clock = clock;
    }

    public void registerOwnKey() {
        Registration outcome = transactions.execute(status -> register());
        outcome.broken().forEach(id -> log.error("Receipt signing key {} fails its seal, so it is not published", id));
        outcome.unconfirmed().forEach(id ->
                log.error("Receipt signing key {} is sealed by the settings key of another server and no restore confirms it, so it is not published", id));
        outcome.adopted().forEach(id -> log.warn("Receipt signing key {} from a restored backup is sealed again and published", id));
        outcome.registered().ifPresent(id -> log.warn("Receipt signing key {} registered and published", id));
    }

    private Registration register() {
        Instant now = clock.instant();
        Optional<FinishedRestore> restore = restoreToAdoptFrom(now);
        List<ReceiptSigningKey> stored = keys.findAll();
        List<ReceiptSigningKeyId> broken = new ArrayList<>();
        List<ReceiptSigningKeyId> unconfirmed = new ArrayList<>();
        List<ReceiptSigningKeyId> adopted = new ArrayList<>();
        for (ReceiptSigningKey key : stored) {
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
        Optional<ReceiptSigningKeyId> registered = stored.stream().anyMatch(key -> key.id().equals(own)) ? Optional.empty()
                : Optional.of(registerOwn(now));
        return new Registration(broken, unconfirmed, adopted, registered);
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
                "Server převzal klíč k ověřovacím QR " + key.id() + " z obnovené zálohy (obnova " + restore.id() + ")", now));
    }

    private ReceiptSigningKeyId registerOwn(Instant now) {
        ReceiptSigningKey key = ReceiptSigningKey.register(signer.publicKey(), now, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content));
        keys.save(key);
        events.publishEvent(new AdminActionPerformed(AdminActionPerformed.SERVER, ACTION, Optional.empty(),
                "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: " + key.id(), now));
        return key.id();
    }

    private record Registration(List<ReceiptSigningKeyId> broken, List<ReceiptSigningKeyId> unconfirmed, List<ReceiptSigningKeyId> adopted,
                                Optional<ReceiptSigningKeyId> registered) {
    }
}
