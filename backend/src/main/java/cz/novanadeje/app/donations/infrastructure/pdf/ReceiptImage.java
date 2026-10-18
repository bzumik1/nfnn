package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;

import java.util.Base64;

public record ReceiptImage(byte[] bytes, String mediaType) {

    public ReceiptImage {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("A receipt image has content");
        }
        if (!"image/png".equals(mediaType) && !"image/jpeg".equals(mediaType)) {
            throw new IllegalArgumentException("A receipt image is PNG or JPEG, not " + mediaType);
        }
        bytes = bytes.clone();
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }

    public ContentDigest digest() {
        return ContentDigest.of(bytes);
    }

    public String dataUri() {
        return "data:" + mediaType + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }
}
