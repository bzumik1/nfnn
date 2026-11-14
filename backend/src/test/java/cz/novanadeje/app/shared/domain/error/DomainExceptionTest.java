package cz.novanadeje.app.shared.domain.error;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Modifier;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class DomainExceptionTest {

    @Test
    @DisplayName("Given the failure kinds, when they are looked at, then each is abstract and can be made only through a named failure's constructor")
    void should_be_abstract_with_protected_constructors_when_looked_at_given_failure_kinds() {
        assertThat(DomainException.class.getPermittedSubclasses())
                .containsExactlyInAnyOrder(RuleViolation.class, Conflict.class, NotFound.class, AuthenticationFailure.class, AccessDenied.class)
                .allSatisfy(kind -> {
                    assertThat(Modifier.isAbstract(kind.getModifiers())).as("%s is abstract", kind.getSimpleName()).isTrue();
                    assertThat(Arrays.stream(kind.getDeclaredConstructors()).map(constructor -> Modifier.isProtected(constructor.getModifiers())))
                            .as("%s has only protected constructors", kind.getSimpleName())
                            .isNotEmpty().containsOnly(true);
                });
    }
}
