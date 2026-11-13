package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;

import java.util.function.Predicate;

final class MethodAccesses {

    private MethodAccesses() {
    }

    static DescribedPredicate<JavaAccess<?>> callsOrReferences(String description, Class<?> owner, Predicate<String> methodName) {
        return DescribedPredicate.describe(description, access -> access.getTarget() instanceof CodeUnitAccessTarget
                && methodName.test(access.getTarget().getName())
                && access.getTargetOwner().isAssignableTo(owner));
    }
}
