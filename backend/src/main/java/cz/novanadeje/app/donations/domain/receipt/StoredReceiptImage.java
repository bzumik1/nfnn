package cz.novanadeje.app.donations.domain.receipt;

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
}
