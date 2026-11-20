package cz.novanadeje.app.operations.application.receiptseed;

import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReceiptSeedRenewalService {

    private static final Logger log = LoggerFactory.getLogger(ReceiptSeedRenewalService.class);

    private final ReceiptSeedRequests seeds;
    private final ReceiptSeedRequestsAtStart startRequests;
    private final ApplicationRestarter restarter;

    public ReceiptSeedRenewalService(ReceiptSeedRequests seeds, ReceiptSeedRequestsAtStart startRequests, ApplicationRestarter restarter) {
        this.seeds = seeds;
        this.startRequests = startRequests;
        this.restarter = restarter;
    }

    public void renewAfterWithdrawal(String keyId, boolean current) {
        if (!current || !seeds.requestNewSeedFor(keyId)) {
            return;
        }
        log.warn("The receipt signing key {} of this server was withdrawn, so the backend restarts and its entrypoint generates a new seed", keyId);
        restarter.restartAfterCommitOnceAsyncWorkIsDone();
    }

    public void renewAtStart(String keyId) {
        switch (startRequests.requestNewSeedAtStartFor(keyId)) {
            case REQUESTED -> {
                log.warn("The receipt signing key {} of this server is withdrawn and no new seed was requested, so the backend restarts and its entrypoint "
                        + "generates a new seed", keyId);
                restarter.restartAfterCommitOnceAsyncWorkIsDone();
            }
            case ALREADY_WAITING -> log.warn("The receipt signing key {} of this server is withdrawn and a request for a new seed waits, "
                    + "but this start did not replace the seed; the entrypoint's log says why", keyId);
            case TRIED_AT_AN_EARLIER_START -> log.error("The receipt signing key {} of this server is still withdrawn although an earlier start asked "
                    + "for a new seed, so the backend does not restart again; the entrypoint's log says why it kept the seed", keyId);
            case NOT_WRITTEN -> {
            }
        }
    }
}
