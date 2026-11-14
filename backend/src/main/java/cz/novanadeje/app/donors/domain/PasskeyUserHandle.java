package cz.novanadeje.app.donors.domain;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Pattern;

public record PasskeyUserHandle(String value) {

    private static final int DONOR_ID_BYTES = 16;
    private static final Pattern SHAPE = Pattern.compile("[A-Za-z0-9_-]{21}[AQgw]");

    public PasskeyUserHandle {
        if (value == null || !SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("A passkey user handle is the " + DONOR_ID_BYTES + " bytes of a donor id in unpadded base64url");
        }
    }

    public static PasskeyUserHandle of(DonorId donorId) {
        UUID id = donorId.value();
        byte[] bytes = ByteBuffer.allocate(DONOR_ID_BYTES).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
        return new PasskeyUserHandle(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    public boolean matches(String presented) {
        return value.equals(presented);
    }
}
