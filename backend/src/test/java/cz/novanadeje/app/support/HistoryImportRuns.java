package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.HistoryImportTracker;

import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicReference;

public final class HistoryImportRuns {

    private HistoryImportRuns() {
    }

    public static void forget(HistoryImportTracker tracker, SynchronousBankImportRequests requests) {
        try {
            Field last = HistoryImportTracker.class.getDeclaredField("last");
            last.setAccessible(true);
            ((AtomicReference<?>) last.get(tracker)).set(null);
        } catch (NoSuchFieldException | IllegalAccessException changed) {
            throw new IllegalStateException("HistoryImportTracker no longer keeps its run in last, so a recorded scenario would inherit "
                    + "the previous one's history import; adapt HistoryImportRuns", changed);
        }
        requests.reset();
    }
}
