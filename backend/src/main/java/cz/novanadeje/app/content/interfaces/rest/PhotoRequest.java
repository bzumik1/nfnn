package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import jakarta.validation.Valid;

import java.util.Optional;

public record PhotoRequest(@Valid FocalPointRequest focalPoint) {

    Optional<FocalPoint> toFocalPoint() {
        return Optional.ofNullable(focalPoint).map(FocalPointRequest::toFocalPoint);
    }
}
