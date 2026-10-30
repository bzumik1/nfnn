package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;

import java.math.BigDecimal;
import java.util.List;

record SignatureVectorResponse(List<BigDecimal> viewBox, List<Path> paths) {

    static SignatureVectorResponse of(SignatureVector vector) {
        SignatureViewBox box = vector.viewBox();
        return new SignatureVectorResponse(List.of(box.minX(), box.minY(), box.width(), box.height()),
                vector.paths().stream().map(Path::of).toList());
    }

    record Path(String d, String fill, BigDecimal opacity) {

        static Path of(SignaturePath path) {
            return new Path(path.data().value(), path.fill(), path.opacity());
        }
    }
}
