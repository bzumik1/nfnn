package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class CachingPasswordHasher implements PasswordHasher {

    private final PasswordHasher hasher;
    private final Map<RawPassword, PasswordHash> hashes = new ConcurrentHashMap<>();
    private final Map<Check, Boolean> checks = new ConcurrentHashMap<>();

    public CachingPasswordHasher(PasswordHasher hasher) {
        this.hasher = hasher;
    }

    @Override
    public PasswordHash hash(RawPassword password) {
        return hashes.computeIfAbsent(password, hasher::hash);
    }

    @Override
    public boolean matches(RawPassword password, PasswordHash hash) {
        return checks.computeIfAbsent(new Check(password, hash), check -> hasher.matches(check.password(), check.hash()));
    }

    private record Check(RawPassword password, PasswordHash hash) {
    }
}
