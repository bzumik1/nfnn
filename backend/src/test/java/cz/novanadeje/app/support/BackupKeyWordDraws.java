package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.backup.BackupKeyWordChallenges;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.Random;
import java.util.random.RandomGenerator;

public final class BackupKeyWordDraws {

    private static final long RECORDING_SEED = 20261029L;

    private BackupKeyWordDraws() {
    }

    public static void reseed(BackupKeyWordChallenges challenges) {
        write(challenges, RandomGenerator.class, new Random(RECORDING_SEED));
        ((Map<?, ?>) read(challenges, Map.class)).clear();
    }

    private static void write(BackupKeyWordChallenges challenges, Class<?> type, Object value) {
        try {
            field(type).set(challenges, value);
        } catch (IllegalAccessException refused) {
            throw changed(type, refused);
        }
    }

    private static Object read(BackupKeyWordChallenges challenges, Class<?> type) {
        try {
            return field(type).get(challenges);
        } catch (IllegalAccessException refused) {
            throw changed(type, refused);
        }
    }

    private static Field field(Class<?> type) {
        for (Field field : BackupKeyWordChallenges.class.getDeclaredFields()) {
            if (field.getType() == type) {
                field.setAccessible(true);
                return field;
            }
        }
        throw changed(type, null);
    }

    private static IllegalStateException changed(Class<?> type, Exception cause) {
        return new IllegalStateException("BackupKeyWordChallenges no longer keeps a " + type.getSimpleName()
                + " field, so recorded check positions would be random; adapt BackupKeyWordDraws", cause);
    }
}
