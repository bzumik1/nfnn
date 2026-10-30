package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignaturePathData;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.SignatureViewBox;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class CanonicalSignatureVectors {

    static final String MEDIA_TYPE = "application/json";

    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS, DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    private CanonicalSignatureVectors() {
    }

    static SignatureVector read(String digest, byte[] content) {
        if (!ContentDigest.of(content).value().equals(digest)) {
            throw new IllegalStateException("The stored signature vector " + digest + " does not match its digest");
        }
        SignatureVector vector;
        try {
            vector = vector(JSON.readTree(content));
        } catch (JacksonException | UnsupportedSignatureVector unreadable) {
            throw new IllegalStateException("The stored signature vector " + digest + " cannot be read: " + unreadable.getClass().getSimpleName());
        }
        if (!Arrays.equals(vector.canonicalBytes(), content)) {
            throw new IllegalStateException("The stored signature vector " + digest + " is not in its canonical form");
        }
        return vector;
    }

    private static SignatureVector vector(JsonNode root) {
        JsonNode box = root.path("viewBox");
        if (box.size() != 4) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.VIEW_BOX);
        }
        SignatureViewBox viewBox = new SignatureViewBox(box.get(0).decimalValue(), box.get(1).decimalValue(), box.get(2).decimalValue(),
                box.get(3).decimalValue());
        List<SignaturePath> paths = new ArrayList<>();
        for (JsonNode path : root.path("paths")) {
            paths.add(new SignaturePath(SignaturePathData.parse(path.path("d").asString()), path.path("fill").asString(),
                    path.path("opacity").decimalValue()));
        }
        return new SignatureVector(viewBox, paths);
    }
}
