package cz.novanadeje.app.donations.infrastructure.pdf;

import java.util.Base64;

public record SignatureImage(byte[] bytes, String mediaType) {

    public SignatureImage {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("A signature image has content");
        }
        if (!"image/png".equals(mediaType) && !"image/jpeg".equals(mediaType)) {
            throw new IllegalArgumentException("A signature image is PNG or JPEG, not " + mediaType);
        }
        bytes = bytes.clone();
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }

    public String dataUri() {
        return "data:" + mediaType + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }
}
