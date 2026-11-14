package cz.novanadeje.app.content.application.donateband;

import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaSize;

import java.util.Map;
import java.util.Optional;

public record DonateBandPhotoView(MediaId id, int width, int height, Optional<String> alt, Optional<FocalPoint> focalPoint) {

    static DonateBandPhotoView of(DonateBandPhoto photo, MediaSize size, Map<MediaId, FocalPoint> focalPoints) {
        Optional<FocalPoint> focalPoint = Optional.ofNullable(focalPoints.get(photo.image()));
        return new DonateBandPhotoView(photo.image(), size.width(), size.height(), photo.alt(), focalPoint);
    }
}
