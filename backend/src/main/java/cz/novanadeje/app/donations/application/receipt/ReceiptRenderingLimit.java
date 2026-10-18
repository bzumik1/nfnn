package cz.novanadeje.app.donations.application.receipt;

import java.util.concurrent.Semaphore;
import java.util.function.Supplier;

public final class ReceiptRenderingLimit {

    private final Semaphore slots;

    public ReceiptRenderingLimit(int concurrentRenders) {
        if (concurrentRenders < 1) {
            throw new IllegalArgumentException("At least one receipt renders at a time, not " + concurrentRenders);
        }
        this.slots = new Semaphore(concurrentRenders, true);
    }

    <T> T withinLimit(Supplier<T> work) {
        slots.acquireUninterruptibly();
        try {
            return work.get();
        } finally {
            slots.release();
        }
    }
}
