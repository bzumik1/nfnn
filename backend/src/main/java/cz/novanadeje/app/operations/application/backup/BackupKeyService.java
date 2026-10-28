package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyCheckMismatch;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationRepository;
import cz.novanadeje.app.operations.domain.backup.BackupKeyUnavailable;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class BackupKeyService {

    static final String VIEW_BACKUP_KEY_ACTION = "VIEW_BACKUP_KEY";
    static final String CONFIRM_BACKUP_KEY_ACTION = "CONFIRM_BACKUP_KEY";

    private static final Logger log = LoggerFactory.getLogger(BackupKeyService.class);

    private final BackupKeySource keys;
    private final BackupKeyConfirmationRepository confirmations;
    private final FreshSecondFactor freshSecondFactor;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public BackupKeyService(BackupKeySource keys, BackupKeyConfirmationRepository confirmations, FreshSecondFactor freshSecondFactor,
                            ApplicationEventPublisher events, Clock clock) {
        this.keys = keys;
        this.confirmations = confirmations;
        this.freshSecondFactor = freshSecondFactor;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public BackupKeyView view() {
        Optional<BackupKey> key = keys.current();
        if (key.isEmpty()) {
            return BackupKeyView.unavailable();
        }
        Optional<BackupKeyConfirmation> confirmation = confirmations.find().filter(found -> found.confirms(key.get()));
        return new BackupKeyView(true, confirmation.isPresent(), confirmation.map(BackupKeyConfirmation::confirmedAt));
    }

    @Transactional
    public BackupKey reveal(UUID adminId, FreshSecondFactorProof proof) {
        BackupKey key = keys.current().orElseThrow(BackupKeyUnavailable::new);
        freshSecondFactor.require(adminId, proof);
        events.publishEvent(new AdminActionPerformed(adminId, VIEW_BACKUP_KEY_ACTION, Optional.empty(),
                "Zobrazen klíč k zálohám (ověřeno druhým faktorem)", clock.instant()));
        log.info("Admin {} viewed the backup key after a fresh second-factor check", adminId);
        return key;
    }

    @Transactional
    public BackupKeyView confirm(UUID adminId, String check) {
        BackupKey key = keys.current().orElseThrow(BackupKeyUnavailable::new);
        Instant now = clock.instant();
        record(key, check, now, Optional.of(adminId));
        events.publishEvent(new AdminActionPerformed(adminId, CONFIRM_BACKUP_KEY_ACTION, Optional.empty(),
                "Potvrzeno uložení klíče k zálohám", now));
        log.info("Admin {} confirmed that the backup key is saved", adminId);
        return view();
    }

    public Optional<BackupKey> keyForSetup() {
        return keys.current();
    }

    @Transactional
    public void confirmInSetup(String check, Instant at) {
        Optional<BackupKey> key = keys.current();
        if (key.isEmpty()) {
            log.warn("The first setup was completed without a backup key; the backups wait for one");
            return;
        }
        record(key.get(), check, at, Optional.empty());
        log.info("The backup key was confirmed as saved in the first setup");
    }

    private void record(BackupKey key, String check, Instant at, Optional<UUID> by) {
        if (!key.matchesCheck(check)) {
            throw new BackupKeyCheckMismatch();
        }
        confirmations.save(BackupKeyConfirmation.of(key, at, by));
    }
}
