package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaId;

public record UploadedImage(MediaId id, int width, int height) {
}
