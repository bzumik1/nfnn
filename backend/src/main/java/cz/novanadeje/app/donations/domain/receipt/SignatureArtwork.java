package cz.novanadeje.app.donations.domain.receipt;

public sealed interface SignatureArtwork permits SignatureImage, SignatureVector {

    ContentDigest digest();

    int width();

    int height();
}
