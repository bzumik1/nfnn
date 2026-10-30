package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.restore.FinishedRestores;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class ReceiptSigningKeyRegistration {

    public static final String ACTION = "REGISTER_RECEIPT_SIGNING_KEY";
    public static final String ADOPT_ACTION = "ADOPT_RECEIPT_SIGNING_KEY";
    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyRegistration.class);

    private final ReceiptSigner signer;
    private final ReceiptSigningKeyRepository keys;
    private final RecordSeals seals;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSigningKeyRegistration(ReceiptSigner signer, ReceiptSigningKeyRepository keys, RecordSeals seals, FinishedRestores restores,
                                         ApplicationEventPublisher events, TransactionOperations transactions, Clock clock) {
        this.signer = signer;
        this.keys = keys;
        this.seals = seals;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void registerOwnKey() {
        List<ReceiptSigningKey> stored = keys.findAll();
        int sealedAgain = 0;
        for (ReceiptSigningKey key : stored) {
            SealVerdict verdict = seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal());
            if (verdict == SealVerdict.SEALED_BY_CARRIED_KEY) {
                keys.save(key.sealedAgain(seals.seal(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent())));
                sealedAgain++;
            } else if (verdict == SealVerdict.BROKEN) {
                log.error("Receipt signing key {} fails its seal, so it is not published", key.id());
            }
        }
        if (sealedAgain > 0) {
            log.info("{} receipt signing keys restored from a backup are sealed again with this server's settings key", sealedAgain);
        }
        ReceiptSigningKeyId own = signer.keyId();
        Optional<ReceiptSigningKey> registered = stored.stream().filter(key -> key.id().equals(own)).findFirst();
        if (registered.isEmpty()) {
            register();
        }
    }

    private void register() {
        Instant now = clock.instant();
        ReceiptSigningKey key = ReceiptSigningKey.register(signer.publicKey(), now, content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content));
        keys.save(key);
        events.publishEvent(new AdminActionPerformed(AdminActionPerformed.SERVER, ACTION, Optional.empty(),
                "Server zaregistroval svůj klíč k ověřovacím QR na potvrzeních o daru: " + key.id(), now));
        log.warn("Receipt signing key {} registered and published", key.id());
    }
}
