package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap;

import java.lang.reflect.Field;
import java.util.Map;

public final class ClientErrorCapWindows {

    private static final String WINDOWS = "windows";

    private ClientErrorCapWindows() {
    }

    public static void reset(ClientErrorCap cap) {
        synchronized (cap) {
            windowsOf(cap).clear();
        }
    }

    private static Map<?, ?> windowsOf(ClientErrorCap cap) {
        try {
            Field field = ClientErrorCap.class.getDeclaredField(WINDOWS);
            field.setAccessible(true);
            return (Map<?, ?>) field.get(cap);
        } catch (NoSuchFieldException | IllegalAccessException | ClassCastException changed) {
            throw new IllegalStateException("ClientErrorCap no longer keeps its hourly windows in a map named " + WINDOWS
                    + ", so a recorded scenario would inherit the previous one's cap; adapt ClientErrorCapWindows", changed);
        }
    }
}
