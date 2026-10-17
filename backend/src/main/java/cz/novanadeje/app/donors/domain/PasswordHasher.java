package cz.novanadeje.app.donors.domain;

public interface PasswordHasher {

    PasswordHash hash(RawPassword password);

    boolean matches(RawPassword password, PasswordHash hash);
}
