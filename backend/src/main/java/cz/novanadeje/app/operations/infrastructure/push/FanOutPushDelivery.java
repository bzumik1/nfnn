package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.application.push.PushDelivery;
import cz.novanadeje.app.operations.application.push.PushPace;
import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushRecipient;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.LockSupport;

@Component
class FanOutPushDelivery implements PushDelivery {

    static final int PACED_SENDS_AT_ONCE = 8;
    static final Duration GAP_BETWEEN_PACED_SENDS = Duration.ofMillis(50);

    private final DeviceDelivery device;
    private final Duration gap;
    private final Semaphore pacedSlots = new Semaphore(PACED_SENDS_AT_ONCE);

    @Autowired
    FanOutPushDelivery(DeviceDelivery device) {
        this(device, GAP_BETWEEN_PACED_SENDS);
    }

    FanOutPushDelivery(DeviceDelivery device, Duration gap) {
        this.device = device;
        this.gap = gap;
    }

    @Override
    public Map<PushSubscriptionId, PushOutcome> deliver(List<? extends PushRecipient> recipients, PushMessage message, VapidKeys keys, PushPace pace) {
        try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<PushOutcome>> started = switch (pace) {
                case AT_ONCE -> atOnce(sends, recipients, message, keys);
                case PACED -> paced(sends, recipients, message, keys);
            };
            return outcomesOf(recipients, started);
        }
    }

    private List<Future<PushOutcome>> atOnce(ExecutorService sends, List<? extends PushRecipient> recipients, PushMessage message, VapidKeys keys) {
        return recipients.stream().<Future<PushOutcome>>map(recipient -> sends.submit(() -> deliverTo(recipient, message, keys))).toList();
    }

    private List<Future<PushOutcome>> paced(ExecutorService sends, List<? extends PushRecipient> recipients, PushMessage message, VapidKeys keys) {
        List<Future<PushOutcome>> started = new ArrayList<>();
        for (PushRecipient recipient : recipients) {
            if (!started.isEmpty()) {
                pause();
            }
            if (Thread.currentThread().isInterrupted() || !takeSlot()) {
                break;
            }
            try {
                started.add(sends.submit(() -> {
                    try {
                        return deliverTo(recipient, message, keys);
                    } finally {
                        pacedSlots.release();
                    }
                }));
            } catch (RuntimeException rejected) {
                pacedSlots.release();
                break;
            }
        }
        return started;
    }

    private PushOutcome deliverTo(PushRecipient recipient, PushMessage message, VapidKeys keys) {
        try {
            return device.deliver(recipient, message, keys);
        } catch (RuntimeException failure) {
            return PushOutcome.FAILED;
        }
    }

    private static Map<PushSubscriptionId, PushOutcome> outcomesOf(List<? extends PushRecipient> recipients, List<Future<PushOutcome>> started) {
        Map<PushSubscriptionId, PushOutcome> outcomes = new LinkedHashMap<>();
        for (int index = 0; index < started.size(); index++) {
            try {
                outcomes.put(recipients.get(index).id(), started.get(index).get());
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } catch (ExecutionException failure) {
                outcomes.put(recipients.get(index).id(), PushOutcome.FAILED);
            }
        }
        return outcomes;
    }

    private void pause() {
        long until = System.nanoTime() + gap.toNanos();
        for (long left = gap.toNanos(); left > 0 && !Thread.currentThread().isInterrupted(); left = until - System.nanoTime()) {
            LockSupport.parkNanos(left);
        }
    }

    private boolean takeSlot() {
        try {
            pacedSlots.acquire();
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
