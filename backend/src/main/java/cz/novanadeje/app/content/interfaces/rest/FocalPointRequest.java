package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record FocalPointRequest(
        @NotNull @Min(FocalPoint.MIN_PERCENT) @Max(FocalPoint.MAX_PERCENT) Integer x,
        @NotNull @Min(FocalPoint.MIN_PERCENT) @Max(FocalPoint.MAX_PERCENT) Integer y) {

    FocalPoint toFocalPoint() {
        return new FocalPoint(x, y);
    }
}
