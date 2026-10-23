package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.media.UploadedImage;

import java.util.UUID;

public record UploadedImageResponse(UUID id, String url, int width, int height) {

    static UploadedImageResponse from(UploadedImage image) {
        return new UploadedImageResponse(image.id().value(), MediaUrls.of(image.id()), image.width(), image.height());
    }
}
