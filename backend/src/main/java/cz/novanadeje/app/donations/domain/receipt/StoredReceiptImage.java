package cz.novanadeje.app.donations.domain.receipt;

import java.util.Arrays;

public record StoredReceiptImage(byte[] content, String mediaType) {

    public StoredReceiptImage {
        if (content == null || content.length == 0 || mediaType == null || mediaType.isBlank()) {
            throw new IllegalArgumentException("A stored receipt image has its content and media type");
        }
        content = content.clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }

    public ContentDigest digest() {
        return ContentDigest.of(content);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof StoredReceiptImage image && Arrays.equals(content, image.content) && mediaType.equals(image.mediaType);
    }

    @Override
    public int hashCode() {
        return 31 * Arrays.hashCode(content) + mediaType.hashCode();
    }

    @Override
    public String toString() {
        return "StoredReceiptImage[" + content.length + " bytes, " + mediaType + "]";
    }
}
