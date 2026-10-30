package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;

import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

record ReceiptSignatureResponse(boolean configured, String kind, String image, SignatureVectorResponse vector, Integer width, Integer height,
                                Instant uploadedAt) {

    private static final String PNG_DATA_URI = "data:image/png;base64,";

    static ReceiptSignatureResponse from(Optional<CurrentSignature> current) {
        return current.map(ReceiptSignatureResponse::of).orElseGet(() -> new ReceiptSignatureResponse(false, null, null, null, null, null, null));
    }

    static ReceiptSignatureResponse of(CurrentSignature current) {
        return switch (current.artwork()) {
            case SignatureImage scan -> new ReceiptSignatureResponse(true, "RASTER", PNG_DATA_URI + Base64.getEncoder().encodeToString(scan.png()),
                    null, scan.width(), scan.height(), current.uploadedAt());
            case SignatureVector vector -> new ReceiptSignatureResponse(true, "VECTOR", null, SignatureVectorResponse.of(vector),
                    vector.width(), vector.height(), current.uploadedAt());
        };
    }
}
