package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.SignatureVector;

public interface SignatureVectorParser {

    SignatureVector parse(byte[] svg);
}
