package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.support.CachingPasswordHasher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CachingBCryptPasswordHasherTest {

    private static final String BCRYPT_COST_12 = "\\$2[aby]\\$12\\$[./0-9A-Za-z]{53}";

    private final CachingPasswordHasher hasher = new CachingPasswordHasher(new BCryptPasswordHasher());

    @Test
    @DisplayName("Given the test hasher over the application's BCrypt hasher, when a password is hashed and checked, then the hash is BCrypt at cost 12, the password matches and a wrong one does not")
    void should_hash_with_bcrypt_and_refuse_wrong_password_when_checked_given_caching_over_bcrypt() {
        RawPassword password = new RawPassword("correct horse battery");

        PasswordHash hash = hasher.hash(password);

        assertThat(hash.value()).matches(BCRYPT_COST_12);
        assertThat(hasher.matches(password, hash)).isTrue();
        assertThat(hasher.matches(new RawPassword("wrong horse battery"), hash)).isFalse();
        assertThat(hasher.matches(password, hash)).isTrue();
        assertThat(hasher.matches(new RawPassword("wrong horse battery"), hash)).isFalse();
    }
}
