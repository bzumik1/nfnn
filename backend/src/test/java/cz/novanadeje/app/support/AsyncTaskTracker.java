package cz.novanadeje.app.support;

import org.springframework.core.task.TaskDecorator;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class AsyncTaskTracker {

    public static final Duration SCENARIO_WAIT = Duration.ofSeconds(15);

    private final ReentrantLock lock = new ReentrantLock();
    private final Condition idle = lock.newCondition();
    private boolean attached;
    private int unfinished;

    public TaskDecorator decorator() {
        lock.lock();
        try {
            attached = true;
        } finally {
            lock.unlock();
        }
        return this::track;
    }

    public void awaitIdleAfter(String step) {
        awaitIdleAfter(step, SCENARIO_WAIT);
    }

    public void awaitIdleAfter(String step, Duration timeout) {
        long left = timeout.toNanos();
        lock.lock();
        try {
            if (!attached) {
                throw new IllegalStateException("After " + step + ", the asynchronous work cannot be awaited: the tracker is attached to no executor");
            }
            while (unfinished > 0) {
                if (left <= 0) {
                    throw new IllegalStateException("After " + step + ", " + unfinished + " asynchronous task" + (unfinished == 1 ? "" : "s")
                            + " did not finish within " + timeout);
                }
                left = idle.awaitNanos(left);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("After " + step + ", the wait for asynchronous work was interrupted", interrupted);
        } finally {
            lock.unlock();
        }
    }

    private Runnable track(Runnable task) {
        lock.lock();
        try {
            unfinished++;
        } finally {
            lock.unlock();
        }
        AtomicBoolean counted = new AtomicBoolean(true);
        return () -> {
            try {
                task.run();
            } finally {
                if (counted.compareAndSet(true, false)) {
                    finished();
                }
            }
        };
    }

    private void finished() {
        lock.lock();
        try {
            unfinished--;
            idle.signalAll();
        } finally {
            lock.unlock();
        }
    }
}
