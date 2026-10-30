package cz.novanadeje.app.support;

import org.springframework.core.task.TaskDecorator;

import java.time.Duration;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class AsyncTaskTracker implements TaskDecorator {

    private final ReentrantLock lock = new ReentrantLock();
    private final Condition idle = lock.newCondition();
    private int unfinished;

    @Override
    public Runnable decorate(Runnable task) {
        lock.lock();
        try {
            unfinished++;
        } finally {
            lock.unlock();
        }
        return () -> {
            try {
                task.run();
            } finally {
                finished();
            }
        };
    }

    public void awaitIdle(Duration timeout) {
        long left = timeout.toNanos();
        lock.lock();
        try {
            while (unfinished > 0) {
                if (left <= 0) {
                    throw new IllegalStateException("Asynchronous work did not finish within " + timeout);
                }
                left = idle.awaitNanos(left);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for asynchronous work", interrupted);
        } finally {
            lock.unlock();
        }
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
