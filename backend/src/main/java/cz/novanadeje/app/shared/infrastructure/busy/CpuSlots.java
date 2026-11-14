package cz.novanadeje.app.shared.infrastructure.busy;

import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

public final class CpuSlots {

    private static final int WAITING_PER_SLOT = 4;

    private final CpuWork work;
    private final int count;
    private final Duration wait;
    private final int queueLimit;
    private final Semaphore slots;

    public CpuSlots(CpuWork work, int count, Duration wait) {
        this(work, count, wait, count * WAITING_PER_SLOT);
    }

    CpuSlots(CpuWork work, int count, Duration wait, int queueLimit) {
        if (count < 1) {
            throw new IllegalArgumentException("CPU slots need at least one slot");
        }
        this.work = work;
        this.count = count;
        this.wait = wait;
        this.queueLimit = queueLimit;
        this.slots = new Semaphore(count, true);
    }

    public <T> T run(Supplier<T> task) {
        acquire();
        try {
            return task.get();
        } finally {
            slots.release();
        }
    }

    public int count() {
        return count;
    }

    int queueLimit() {
        return queueLimit;
    }

    int waiting() {
        return slots.getQueueLength();
    }

    private void acquire() {
        if (slots.getQueueLength() >= queueLimit) {
            throw new CpuSlotsFull(work);
        }
        try {
            if (!slots.tryAcquire(wait.toNanos(), TimeUnit.NANOSECONDS)) {
                throw new CpuSlotsFull(work);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CpuSlotsFull(work);
        }
    }
}
