package cz.novanadeje.app.donations.domain.receipt;

import java.util.Arrays;

public sealed interface ReceiptContent {

    record Snapshot(ReceiptSnapshot snapshot, ContentDigest issuedPdf) implements ReceiptContent {

        public Snapshot {
            if (snapshot == null || issuedPdf == null) {
                throw new IllegalArgumentException("A receipt kept as a snapshot has the snapshot and the digest of the PDF issued from it");
            }
        }
    }

    record StoredPdf(byte[] pdf) implements ReceiptContent {

        public StoredPdf {
            if (pdf == null || pdf.length == 0) {
                throw new IllegalArgumentException("A stored receipt holds its rendered document");
            }
            pdf = pdf.clone();
        }

        @Override
        public byte[] pdf() {
            return pdf.clone();
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof StoredPdf stored && Arrays.equals(pdf, stored.pdf);
        }

        @Override
        public int hashCode() {
            return Arrays.hashCode(pdf);
        }

        @Override
        public String toString() {
            return "StoredPdf[" + pdf.length + " bytes]";
        }
    }
}
