package cz.novanadeje.app.donors.application;

public interface AccessTokenVerifier {

    VerifiedAccessToken verify(String token);
}
