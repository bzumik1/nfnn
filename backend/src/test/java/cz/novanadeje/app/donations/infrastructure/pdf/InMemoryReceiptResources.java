package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

class InMemoryReceiptResources implements ReceiptResources {

    private final Map<ContentDigest, String> templates = new ConcurrentHashMap<>();
    private final Map<ContentDigest, ReceiptImage> images = new ConcurrentHashMap<>();

    @Override
    public void storeTemplate(ContentDigest digest, String content, Instant firstUsedAt) {
        templates.putIfAbsent(digest, content);
    }

    @Override
    public Optional<String> template(ContentDigest digest) {
        return Optional.ofNullable(templates.get(digest));
    }

    @Override
    public void storeImage(ContentDigest digest, ReceiptImage image, Instant firstUsedAt) {
        images.putIfAbsent(digest, image);
    }

    @Override
    public Optional<ReceiptImage> image(ContentDigest digest) {
        return Optional.ofNullable(images.get(digest));
    }

    int templateCount() {
        return templates.size();
    }

    int imageCount() {
        return images.size();
    }
}
