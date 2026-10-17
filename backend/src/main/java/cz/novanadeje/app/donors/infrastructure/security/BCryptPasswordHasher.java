package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
class BCryptPasswordHasher implements PasswordHasher {

    private static final int COST = 12;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(COST);

    @Override
    public PasswordHash hash(RawPassword password) {
        return new PasswordHash(encoder.encode(password.value()));
    }

    @Override
    public boolean matches(RawPassword password, PasswordHash hash) {
        return encoder.matches(password.value(), hash.value());
    }
}
