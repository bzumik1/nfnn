package cz.novanadeje.app.operations.application.receiptseed;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReceiptSeedRenewalService {

    private static final Logger log = LoggerFactory.getLogger(ReceiptSeedRenewalService.class);

    private final ReceiptSeedRequests seeds;
    private final ApplicationRestarter restarter;

    public ReceiptSeedRenewalService(ReceiptSeedRequests seeds, ApplicationRestarter restarter) {
        this.seeds = seeds;
        this.restarter = restarter;
    }

    public void renewAfterWithdrawal(String keyId, boolean current) {
        if (!current || !seeds.requestNewSeedFor(keyId)) {
            return;
        }
        log.warn("The receipt signing key {} of this server was withdrawn, so the backend restarts and its entrypoint generates a new seed", keyId);
        restarter.restartAfterCommitOnceAsyncWorkIsDone();
    }
}
