package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap;

import java.lang.reflect.Field;
import java.util.Map;

public final class ClientErrorCapWindows {

    private static final String WINDOWS = "windows";
    private static final String DROPPED = "dropped";

    private ClientErrorCapWindows() {
    }

    public static void reset(ClientErrorCap cap) {
        synchronized (cap) {
            Map<?, ?> windows = windowsOf(cap);
            windows.values().forEach(ClientErrorCapWindows::forgetDropped);
            windows.clear();
        }
    }

    private static void forgetDropped(Object window) {
        try {
            Field field = window.getClass().getDeclaredField(DROPPED);
            field.setAccessible(true);
            field.setInt(window, 0);
        } catch (NoSuchFieldException | IllegalAccessException | IllegalArgumentException changed) {
            throw new IllegalStateException("A ClientErrorCap window no longer counts its drops in an int named " + DROPPED
                    + ", so a pending hourly warning would leak into the next scenario; adapt ClientErrorCapWindows", changed);
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
