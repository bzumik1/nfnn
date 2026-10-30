package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

record ReceiptStatusRequest(
        @NotNull(message = "{problem.validation.missing-value}")
        @Size(max = ContentDigest.LENGTH, message = "{problem.validation.invalid-value}")
        @Pattern(regexp = ContentDigest.SHAPE_REGEX, message = "{problem.validation.invalid-value}")
        String digest
) {

    ContentDigest statusDigest() {
        return new ContentDigest(digest);
    }
}
