package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.domain.backup.BackupKeyCheckMismatch;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationRepository;
import cz.novanadeje.app.operations.domain.backup.BackupKeyRevealPaused;
import cz.novanadeje.app.operations.domain.backup.BackupKeyUnavailable;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordCheck;
import cz.novanadeje.app.operations.domain.backup.BackupKeyWordPositions;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.event.BackupKeyRevealed;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactor;
import cz.novanadeje.app.shared.application.secondfactor.FreshSecondFactorProof;
import cz.novanadeje.app.shared.domain.error.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
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
    private final BackupKeyRevealRefusals refusals;
    private final BackupKeyWordChallenges challenges;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public BackupKeyService(BackupKeySource keys, BackupKeyConfirmationRepository confirmations, FreshSecondFactor freshSecondFactor,
                            BackupKeyRevealRefusals refusals, BackupKeyWordChallenges challenges, ApplicationEventPublisher events, Clock clock) {
        this.keys = keys;
        this.confirmations = confirmations;
        this.freshSecondFactor = freshSecondFactor;
        this.refusals = refusals;
        this.challenges = challenges;
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
    public RevealedBackupKey reveal(UUID adminId, FreshSecondFactorProof proof) {
        BackupKey key = keys.current().orElseThrow(BackupKeyUnavailable::new);
        Instant now = clock.instant();
        if (refusals.paused(adminId, now)) {
            log.warn("Admin {} asked for the backup key while it is paused after refused second factors", adminId);
            throw new BackupKeyRevealPaused();
        }
        try {
            freshSecondFactor.require(adminId, proof);
        } catch (DomainException refused) {
            refusals.record(adminId, now);
            throw refused;
        }
        events.publishEvent(new AdminActionPerformed(adminId, VIEW_BACKUP_KEY_ACTION, Optional.empty(),
                "Zobrazen klíč k zálohám (ověřeno druhým faktorem)", now));
        events.publishEvent(new BackupKeyRevealed(adminId, now));
        log.info("Admin {} viewed the backup key after a fresh second-factor check", adminId);
        return new RevealedBackupKey(key, challenges.issue(adminId, now));
    }

    @Transactional
    public BackupKeyView confirm(UUID adminId, List<BackupKeyWordCheck> words) {
        BackupKey key = keys.current().orElseThrow(BackupKeyUnavailable::new);
        Instant now = clock.instant();
        BackupKeyWordPositions asked = challenges.asked(adminId, now);
        try {
            requireWords(key, words, Optional.of(asked));
        } catch (BackupKeyCheckMismatch mismatch) {
            challenges.refused(adminId);
            log.info("Admin {} typed words that are not the words of the backup key", adminId);
            throw mismatch;
        }
        challenges.settled(adminId);
        confirmations.save(BackupKeyConfirmation.of(key, now, Optional.of(adminId)));
        events.publishEvent(new AdminActionPerformed(adminId, CONFIRM_BACKUP_KEY_ACTION, Optional.empty(),
                "Potvrzeno uložení klíče k zálohám", now));
        log.info("Admin {} confirmed that the backup key is saved", adminId);
        return view();
    }

    public Optional<RevealedBackupKey> keyForSetup() {
        return keys.current().map(key -> new RevealedBackupKey(key, challenges.draw()));
    }

    @Transactional
    public void confirmInSetup(List<BackupKeyWordCheck> words, Instant at) {
        Optional<BackupKey> key = keys.current();
        if (key.isEmpty()) {
            log.warn("The first setup was completed without a backup key; the backups wait for one");
            return;
        }
        requireWords(key.get(), words, Optional.empty());
        confirmations.save(BackupKeyConfirmation.of(key.get(), at, Optional.empty()));
        log.info("The backup key was confirmed as saved in the first setup");
    }

    private static void requireWords(BackupKey key, List<BackupKeyWordCheck> words, Optional<BackupKeyWordPositions> asked) {
        BackupKeyWordPositions typed = BackupKeyWordPositions.of(words);
        if (asked.filter(positions -> !positions.equals(typed)).isPresent() || !key.matches(words)) {
            throw new BackupKeyCheckMismatch();
        }
    }
}
