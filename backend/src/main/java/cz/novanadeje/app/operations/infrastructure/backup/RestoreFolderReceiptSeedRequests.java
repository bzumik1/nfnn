package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.application.receiptseed.ReceiptSeedRequests;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Component
class RestoreFolderReceiptSeedRequests implements ReceiptSeedRequests {

    private static final String REQUEST_FILE = "receipt-signing-key.renew";
    private static final Logger log = LoggerFactory.getLogger(RestoreFolderReceiptSeedRequests.class);

    private final Path restoreDirectory;

    RestoreFolderReceiptSeedRequests(BackupProperties properties) {
        this.restoreDirectory = properties.restoreDirectory();
    }

    @Override
    public boolean requestNewSeedFor(String keyId) {
        try {
            Path part = restoreDirectory.resolve(REQUEST_FILE + ".part");
            Files.writeString(part, keyId, StandardCharsets.US_ASCII);
            Files.move(part, restoreDirectory.resolve(REQUEST_FILE), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return true;
        } catch (IOException | RuntimeException failure) {
            log.error("The request for a new receipt signing seed after the withdrawal of key {} could not be written ({}); "
                    + "the server signs no receipt until secrets/receipt-signing-key is replaced", keyId, failure.getClass().getSimpleName());
            return false;
        }
    }
}
