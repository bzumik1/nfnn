package cz.novanadeje.app.donors.domain;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

public record PasskeyUserHandle(String value) {

    public static PasskeyUserHandle of(DonorId donorId) {
        UUID id = donorId.value();
        byte[] bytes = ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
        return new PasskeyUserHandle(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    public boolean matches(String presented) {
        return value.equals(presented);
    }
}
