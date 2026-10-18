package cz.novanadeje.app.donations.domain.receipt;

public record ReceiptContent(ReceiptSnapshot snapshot, ContentDigest issuedPdf) {

    public ReceiptContent {
        if (snapshot == null || issuedPdf == null) {
            throw new IllegalArgumentException("A receipt keeps the snapshot it was rendered from and the digest of the PDF issued from it");
        }
    }
}
