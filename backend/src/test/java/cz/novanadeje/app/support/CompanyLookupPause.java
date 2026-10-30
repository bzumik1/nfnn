package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.CompanyLookupService;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Map;

public final class CompanyLookupPause {

    private static final Map<String, Object> FRESH_STATE = Map.of("failuresInARow", 0, "lastFailure", Instant.MIN, "pausedUntil", Instant.MIN);

    private CompanyLookupPause() {
    }

    public static void reset(CompanyLookupService lookup) {
        synchronized (lookup) {
            FRESH_STATE.forEach((name, value) -> write(lookup, name, value));
        }
    }

    private static void write(CompanyLookupService lookup, String name, Object value) {
        try {
            Field field = CompanyLookupService.class.getDeclaredField(name);
            field.setAccessible(true);
            field.set(lookup, value);
        } catch (NoSuchFieldException | IllegalAccessException changed) {
            throw new IllegalStateException("CompanyLookupService no longer keeps its pause in " + name
                    + ", so a recorded scenario would inherit the previous one's pause; adapt CompanyLookupPause", changed);
        }
    }
}
