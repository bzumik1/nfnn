package cz.novanadeje.app.content.application.about;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaSize;

import java.util.Map;
import java.util.Optional;

public record AboutPhotoView(MediaId id, int width, int height, Optional<String> alt, Optional<String> caption, Optional<FocalPoint> focalPoint) {

    static AboutPhotoView of(AboutPhoto photo, MediaSize size, Map<MediaId, FocalPoint> focalPoints) {
        Optional<FocalPoint> focalPoint = Optional.ofNullable(focalPoints.get(photo.image()));
        return new AboutPhotoView(photo.image(), size.width(), size.height(), photo.alt(), photo.caption(), focalPoint);
    }
}
