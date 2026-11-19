package cz.novanadeje.app.operations.application.receiptseed;

public interface ReceiptSeedRequestsAtStart {

    StartRequest requestNewSeedAtStartFor(String keyId);

    enum StartRequest {
        REQUESTED,
        ALREADY_WAITING,
        TRIED_AT_AN_EARLIER_START,
        NOT_WRITTEN
    }
}
