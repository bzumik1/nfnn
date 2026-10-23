package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.SignatureImage;

public interface SignatureImageProcessor {

    SignatureImage process(byte[] upload);
}
