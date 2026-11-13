package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaModifier;

import java.util.function.Predicate;

final class MethodAccesses {

    private MethodAccesses() {
    }

    static DescribedPredicate<JavaAccess<?>> callsOrReferences(String description, Class<?> owner, Predicate<String> methodName) {
        return callsOrReferences(description, owner.getName(), methodName);
    }

    static DescribedPredicate<JavaAccess<?>> callsOrReferences(String description, String ownerName, Predicate<String> methodName) {
        return DescribedPredicate.describe(description, access -> access.getTarget() instanceof CodeUnitAccessTarget target
                && methodName.test(target.getName())
                && access.getTargetOwner().isAssignableTo(ownerName)
                && !isPrivate(target));
    }

    private static boolean isPrivate(CodeUnitAccessTarget target) {
        return target.resolveMember().map(member -> member.getModifiers().contains(JavaModifier.PRIVATE)).orElse(false);
    }
}
