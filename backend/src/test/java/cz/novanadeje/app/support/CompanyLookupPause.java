package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.infrastructure.ares.CompanyRegistryBreaker;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Map;

public final class CompanyLookupPause {

    private static final Map<String, Object> FRESH_STATE = Map.of("failuresInARow", 0, "lastFailure", Instant.MIN, "pausedUntil", Instant.MIN);

    private CompanyLookupPause() {
    }

    public static void reset(CompanyRegistryBreaker breaker) {
        synchronized (breaker) {
            FRESH_STATE.forEach((name, value) -> write(breaker, name, value));
        }
    }

    private static void write(CompanyRegistryBreaker breaker, String name, Object value) {
        try {
            Field field = CompanyRegistryBreaker.class.getDeclaredField(name);
            field.setAccessible(true);
            field.set(breaker, value);
        } catch (NoSuchFieldException | IllegalAccessException changed) {
            throw new IllegalStateException("CompanyRegistryBreaker no longer keeps its pause in " + name
                    + ", so a recorded scenario would inherit the previous one's pause; adapt CompanyLookupPause", changed);
        }
    }
}
