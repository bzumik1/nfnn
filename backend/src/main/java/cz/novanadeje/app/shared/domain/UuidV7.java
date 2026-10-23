package cz.novanadeje.app.shared.domain;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

public final class UuidV7 {

    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {
    }

    public static UUID generate(Instant instant) {
        long timestampMillis = instant.toEpochMilli();
        long mostSignificant = (timestampMillis << 16) | 0x7000L | (RANDOM.nextLong() & 0x0FFFL);
        long leastSignificant = (RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(mostSignificant, leastSignificant);
    }
}
