package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;

import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

record ReceiptSignatureResponse(boolean configured, String image, Integer width, Integer height, Instant uploadedAt) {

    private static final String PNG_DATA_URI = "data:image/png;base64,";

    static ReceiptSignatureResponse from(Optional<CurrentSignature> current) {
        return current.map(ReceiptSignatureResponse::of).orElseGet(() -> new ReceiptSignatureResponse(false, null, null, null, null));
    }

    static ReceiptSignatureResponse of(CurrentSignature current) {
        return new ReceiptSignatureResponse(true, PNG_DATA_URI + Base64.getEncoder().encodeToString(current.image().png()),
                current.image().width(), current.image().height(), current.uploadedAt());
    }
}
