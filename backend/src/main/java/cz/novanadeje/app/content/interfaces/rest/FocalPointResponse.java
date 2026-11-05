package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.FocalPoint;

import java.util.Optional;

public record FocalPointResponse(int x, int y) {

    static FocalPointResponse of(Optional<FocalPoint> point) {
        return point.map(placed -> new FocalPointResponse(placed.x(), placed.y())).orElse(null);
    }
}
