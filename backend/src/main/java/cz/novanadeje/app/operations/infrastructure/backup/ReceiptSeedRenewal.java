package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawalAnnounced;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Component
class ReceiptSeedRenewal {

    static final String REQUEST_FILE = "receipt-signing-key.renew";
    private static final Logger log = LoggerFactory.getLogger(ReceiptSeedRenewal.class);

    private final Path restoreDirectory;
    private final ApplicationRestarter restarter;

    ReceiptSeedRenewal(BackupProperties properties, ApplicationRestarter restarter) {
        this.restoreDirectory = properties.restoreDirectory();
        this.restarter = restarter;
    }

    @EventListener
    public void renewSeed(ReceiptSigningKeyWithdrawalAnnounced withdrawn) {
        if (!withdrawn.current()) {
            return;
        }
        try {
            Path part = restoreDirectory.resolve(REQUEST_FILE + ".part");
            Files.writeString(part, withdrawn.keyId(), StandardCharsets.US_ASCII);
            Files.move(part, restoreDirectory.resolve(REQUEST_FILE), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException failure) {
            log.error("The request for a new receipt signing seed after the withdrawal of key {} could not be written ({}); "
                    + "the server signs no receipt until secrets/receipt-signing-key is replaced", withdrawn.keyId(), failure.getClass().getSimpleName());
            return;
        }
        log.warn("The receipt signing key {} of this server was withdrawn, so the backend restarts and its entrypoint generates a new seed", withdrawn.keyId());
        restarter.restartAfterCommit();
    }
}
