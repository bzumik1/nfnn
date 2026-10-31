package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.Signatory;

import java.util.Optional;

public record SignatoryAtIssue(Signatory signatory, Optional<ContentDigest> signatureImage, Optional<ContentDigest> portraitImage) {

    public SignatoryAtIssue {
        if (signatory == null || signatureImage == null || portraitImage == null) {
            throw new IllegalArgumentException("A signatory at issue has a name and role, and a signature and a portrait or none");
        }
    }
}
