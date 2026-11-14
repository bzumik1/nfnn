package cz.novanadeje.app.shared.infrastructure.net;

import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class TimeBoundedCall {

    private TimeBoundedCall() {
    }

    public static <T> T within(Duration limit, String threadName, Callable<T> call) throws ExecutionException, TimeoutException, InterruptedException {
        FutureTask<T> task = new FutureTask<>(call);
        Thread.ofVirtual().name(threadName).start(task);
        try {
            return task.get(Math.max(0, limit.toNanos()), TimeUnit.NANOSECONDS);
        } catch (TimeoutException | InterruptedException unfinished) {
            task.cancel(true);
            throw unfinished;
        }
    }
}
