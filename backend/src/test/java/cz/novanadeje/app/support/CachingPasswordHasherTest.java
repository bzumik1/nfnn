package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CachingPasswordHasherTest {

    private static final RawPassword RIGHT = new RawPassword("correct horse battery");
    private static final RawPassword WRONG = new RawPassword("wrong horse battery");
    private static final PasswordHash HASH = new PasswordHash("$2a$12$hash-of-the-right-password");

    @Mock
    private PasswordHasher hasher;

    @Test
    @DisplayName("Given a password hashed once, when it is hashed again, then the wrapped hasher made one hash and both answers are that hash")
    void should_hash_once_when_hashed_again_given_password_hashed_once() {
        when(hasher.hash(RIGHT)).thenReturn(HASH);
        CachingPasswordHasher caching = new CachingPasswordHasher(hasher);

        PasswordHash first = caching.hash(RIGHT);
        PasswordHash second = caching.hash(new RawPassword(RIGHT.value()));

        assertThat(first).isEqualTo(HASH);
        assertThat(second).isEqualTo(HASH);
        verify(hasher, times(1)).hash(RIGHT);
    }

    @Test
    @DisplayName("Given two different passwords, when both are hashed, then the wrapped hasher hashes each of them")
    void should_ask_wrapped_hasher_for_each_when_hashed_given_two_different_passwords() {
        CachingPasswordHasher caching = new CachingPasswordHasher(hasher);
        when(hasher.hash(RIGHT)).thenReturn(HASH);
        when(hasher.hash(WRONG)).thenReturn(new PasswordHash("$2a$12$hash-of-the-wrong-password"));

        caching.hash(RIGHT);
        caching.hash(WRONG);

        verify(hasher).hash(RIGHT);
        verify(hasher).hash(WRONG);
    }

    @Test
    @DisplayName("Given a password checked against a hash once, when it is checked again, then the wrapped hasher was asked once and its answer stands")
    void should_ask_once_when_checked_again_given_password_checked_once() {
        when(hasher.matches(RIGHT, HASH)).thenReturn(true);
        CachingPasswordHasher caching = new CachingPasswordHasher(hasher);

        boolean first = caching.matches(RIGHT, HASH);
        boolean second = caching.matches(RIGHT, HASH);

        assertThat(first).isTrue();
        assertThat(second).isTrue();
        verify(hasher, times(1)).matches(RIGHT, HASH);
    }

    @Test
    @DisplayName("Given the right password matched a hash, when a wrong password is checked against the same hash, then the wrapped hasher decides and it does not match")
    void should_not_match_when_wrong_password_checked_given_right_password_matched() {
        when(hasher.matches(RIGHT, HASH)).thenReturn(true);
        when(hasher.matches(WRONG, HASH)).thenReturn(false);
        CachingPasswordHasher caching = new CachingPasswordHasher(hasher);
        caching.matches(RIGHT, HASH);

        boolean wrong = caching.matches(WRONG, HASH);

        assertThat(wrong).isFalse();
        verify(hasher).matches(WRONG, HASH);
    }
}
