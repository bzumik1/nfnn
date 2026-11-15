package cz.novanadeje.app.shared.domain;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

public final class UuidV7 {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int LAST_SEQUENCE = 0x0FFF;
    private static final int FIRST_SEQUENCE_BOUND = 0x0800;

    private static long lastMillis = Long.MIN_VALUE;
    private static int lastSequence;

    private UuidV7() {
    }

    public static UUID generate(Instant instant) {
        long timestampMillis = instant.toEpochMilli();
        long mostSignificant = (timestampMillis << 16) | 0x7000L | sequenceWithin(timestampMillis);
        long leastSignificant = (RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(mostSignificant, leastSignificant);
    }

    private static synchronized int sequenceWithin(long timestampMillis) {
        if (timestampMillis == lastMillis && lastSequence < LAST_SEQUENCE) {
            lastSequence++;
        } else {
            lastSequence = RANDOM.nextInt(FIRST_SEQUENCE_BOUND);
        }
        lastMillis = timestampMillis;
        return lastSequence;
    }
}
