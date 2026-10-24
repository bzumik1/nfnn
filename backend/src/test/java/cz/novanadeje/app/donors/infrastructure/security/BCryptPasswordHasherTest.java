package cz.novanadeje.app.donors.infrastructure.security;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RawPassword;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BCryptPasswordHasherTest {

    private static final String BCRYPT_COST_12 = "\\$2[aby]\\$12\\$[./0-9A-Za-z]{53}";

    private final BCryptPasswordHasher hasher = new BCryptPasswordHasher();

    @Test
    @DisplayName("Given the password a hash was made from, when it is checked, then it matches")
    void should_match_when_checked_given_the_password_it_was_made_from() {
        RawPassword password = new RawPassword("correct horse battery");

        PasswordHash hash = hasher.hash(password);

        assertThat(hash.value()).matches(BCRYPT_COST_12);
        assertThat(hasher.matches(password, hash)).isTrue();
        assertThat(hasher.matches(new RawPassword("wrong horse battery"), hash)).isFalse();
    }

    @Test
    @DisplayName("Given a 128-character password of Czech letters, when hashed, then the whole password is accepted, though it is over 72 bytes")
    void should_hash_when_given_longest_password_of_multibyte_letters() {
        RawPassword password = new RawPassword("ž".repeat(RawPassword.MAX_LENGTH));

        PasswordHash hash = hasher.hash(password);

        assertThat(hasher.matches(password, hash)).isTrue();
    }

    @Test
    @DisplayName("Given two passwords that agree on their first 72 bytes, when one is checked against the other's hash, then it does not match")
    void should_not_match_when_checked_given_a_password_differing_only_after_72_bytes() {
        String firstSeventyTwoBytes = "x".repeat(72);
        PasswordHash hash = hasher.hash(new RawPassword(firstSeventyTwoBytes + "ends one way"));

        assertThat(hasher.matches(new RawPassword(firstSeventyTwoBytes + "ends another"), hash)).isFalse();
        assertThat(hasher.matches(new RawPassword(firstSeventyTwoBytes + "ends one way"), hash)).isTrue();
    }
}
