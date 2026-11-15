package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import org.springframework.stereotype.Repository;

import java.util.List;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;

final class PersistencePorts {

    private static final String SITE = "cz.novanadeje.app";
    private static final List<String> PERSISTENCE_TECHNOLOGY = List.of(
            "org.springframework.data", "jakarta.persistence", "org.springframework.jdbc", "org.springframework.orm", "org.hibernate", "java.sql", "javax.sql");
    private static final DescribedPredicate<JavaClass> IN_A_PERSISTENCE_ADAPTER_PACKAGE = resideInAnyPackage(AdapterLibraryRulesTest.persistenceAdapters());

    static final DescribedPredicate<JavaClass> PERSISTENCE_ADAPTERS = DescribedPredicate.describe(
            "are persistence adapters (classes of the site in a persistence adapter package, annotated @Repository or on Spring Data, JPA, Hibernate or JDBC)",
            PersistencePorts::isPersistenceAdapter);

    static final DescribedPredicate<JavaClass> PERSISTENCE_PORTS = DescribedPredicate.describe(
            "a persistence port (a type of the site named …Repository, a persistence adapter or a type one of them implements or extends, "
                    + "or a type assignable to one of these)",
            type -> type.isAssignableTo(DescribedPredicate.describe("a persistence port itself", PersistencePorts::isPersistencePortItself)));

    private PersistencePorts() {
    }

    private static boolean isPersistencePortItself(JavaClass type) {
        return isOfTheSite(type) && (type.getSimpleName().endsWith("Repository") || isPersistenceAdapter(type)
                || type.getAllSubclasses().stream().anyMatch(PersistencePorts::isPersistenceAdapter));
    }

    private static boolean isPersistenceAdapter(JavaClass type) {
        return isOfTheSite(type) && (IN_A_PERSISTENCE_ADAPTER_PACKAGE.test(type)
                || type.isAnnotatedWith(Repository.class) || type.isMetaAnnotatedWith(Repository.class)
                || type.getDirectDependenciesFromSelf().stream()
                .map(dependency -> dependency.getTargetClass().getPackageName())
                .anyMatch(target -> PERSISTENCE_TECHNOLOGY.stream().anyMatch(technology -> target.equals(technology) || target.startsWith(technology + "."))));
    }

    private static boolean isOfTheSite(JavaClass type) {
        return type.getPackageName().equals(SITE) || type.getPackageName().startsWith(SITE + ".");
    }
}
