package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.Sha256;
import cz.novanadeje.app.shared.infrastructure.busy.CpuSlots;
import cz.novanadeje.app.shared.infrastructure.busy.CpuWork;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
class BCryptPasswordHasher implements PasswordHasher {

    static final Duration SLOT_WAIT = Duration.ofSeconds(2);

    private static final int COST = 12;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(COST);
    private final CpuSlots slots;

    BCryptPasswordHasher() {
        this(new CpuSlots(CpuWork.PASSWORD_HASHING, Runtime.getRuntime().availableProcessors(), SLOT_WAIT));
    }

    BCryptPasswordHasher(CpuSlots slots) {
        this.slots = slots;
    }

    @Override
    public PasswordHash hash(RawPassword password) {
        String digest = digestOf(password);
        return new PasswordHash(slots.run(() -> encoder.encode(digest)));
    }

    @Override
    public boolean matches(RawPassword password, PasswordHash hash) {
        String digest = digestOf(password);
        return slots.run(() -> encoder.matches(digest, hash.value()));
    }

    int slotCount() {
        return slots.count();
    }

    private static String digestOf(RawPassword password) {
        return Sha256.hex(password.value().getBytes(StandardCharsets.UTF_8));
    }
}
