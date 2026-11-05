package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record PhotoView(MediaId id, int width, int height, Optional<FocalPoint> focalPoint) {
}
