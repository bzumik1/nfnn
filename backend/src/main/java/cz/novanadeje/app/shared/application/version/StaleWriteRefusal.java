package cz.novanadeje.app.shared.application.version;

import cz.novanadeje.app.shared.domain.error.StaleWrite;

public final class StaleWriteRefusal extends RuntimeException {

    private final StaleWrite staleWrite;
    private final transient StoredRecord current;

    public StaleWriteRefusal(StaleWrite staleWrite, StoredRecord current) {
        super("A write named a version the record no longer has", staleWrite);
        if (staleWrite == null || current == null || staleWrite.version().isEmpty()) {
            throw new IllegalArgumentException("A stale write refusal names the stale write with the version stored now and the record as stored now");
        }
        this.staleWrite = staleWrite;
        this.current = current;
    }

    public StaleWrite staleWrite() {
        return staleWrite;
    }

    public StoredRecord current() {
        return current;
    }
}
