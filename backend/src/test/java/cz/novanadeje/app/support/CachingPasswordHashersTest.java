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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CachingPasswordHashersTest {

    private static final RawPassword PASSWORD = new RawPassword("correct horse battery");
    private static final PasswordHash HASH = new PasswordHash("$2a$12$hash-of-the-password");

    private final CachingPasswordHashers postProcessor = new CachingPasswordHashers();

    @Mock
    private PasswordHasher hasher;

    @Test
    @DisplayName("Given the application's password hasher, when its bean is initialised, then it is replaced by a caching hasher that hashes through it")
    void should_wrap_in_caching_hasher_when_initialised_given_password_hasher() {
        when(hasher.hash(PASSWORD)).thenReturn(HASH);

        Object bean = postProcessor.postProcessAfterInitialization(hasher, "BCryptPasswordHasher");

        assertThat(bean).isInstanceOf(CachingPasswordHasher.class);
        assertThat(((PasswordHasher) bean).hash(PASSWORD)).isEqualTo(HASH);
        verify(hasher).hash(PASSWORD);
    }

    @Test
    @DisplayName("Given a caching hasher, when its bean is initialised, then it is kept as it is")
    void should_keep_bean_when_initialised_given_caching_hasher() {
        CachingPasswordHasher caching = new CachingPasswordHasher(hasher);

        Object bean = postProcessor.postProcessAfterInitialization(caching, "cachingPasswordHasher");

        assertThat(bean).isSameAs(caching);
    }

    @Test
    @DisplayName("Given a bean that hashes no passwords, when it is initialised, then it is kept as it is")
    void should_keep_bean_when_initialised_given_other_bean() {
        Object other = new Object();

        Object bean = postProcessor.postProcessAfterInitialization(other, "other");

        assertThat(bean).isSameAs(other);
    }
}
