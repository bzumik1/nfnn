package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.properties.HasAnnotations;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.lang.annotation.Annotation;
import java.nio.file.Path;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SelfInvocationRulesTest {

    private static final Set<String> JOINING_PROPAGATIONS = Set.of(Propagation.REQUIRED.name(), Propagation.SUPPORTS.name(), Propagation.MANDATORY.name());

    @ArchTest
    static final ArchRule calls_within_a_class_never_rely_on_a_proxy_attribute = noCodeUnits()
            .should(callAMethodOfTheirOwnClassWhoseProxyAttributeWouldNotApply())
            .because("backend.md, Application: @Transactional and @Async work only through Spring's proxy, and a call within the class "
                    + "(this.x(), an unqualified call, or one from an inner class or lambda of it) never passes the proxy, so the attribute "
                    + "does nothing for that call: the method runs in the caller's transaction, or none, and on the caller's thread");

    @Test
    @DisplayName("Given planted classes calling their own transactional and asynchronous methods, when the rule checks them, then each call that bypasses an attribute is reported and calls under the same attribute or to plain methods are not")
    void should_report_every_call_that_bypasses_a_proxy_attribute_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.PlantedMethods", """
                package cz.novanadeje.app.planteda.application;

                import java.util.function.Supplier;
                import org.springframework.scheduling.annotation.Async;
                import org.springframework.transaction.annotation.Propagation;
                import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

                class PlantedMethods {

                    public void plainCallsTransactional() {
                        transactional();
                    }

                    public void plainCallsThisAsync() {
                        this.asynchronous();
                    }

                    public void plainCallsMetaTransactional() {
                        writes();
                    }

                    public Supplier<Integer> plainReferencesTransactional() {
                        return this::counted;
                    }

                    public void plainCallsInALambda() {
                        Runnable later = () -> transactional();
                        later.run();
                    }

                    @Transactional
                    public void transactionalCallsNewOne() {
                        separately();
                    }

                    @Transactional
                    public void transactionalCallsTheSame() {
                        transactional();
                    }

                    @Transactional(propagation = Propagation.REQUIRES_NEW)
                    public void newOneCallsNewOne() {
                        separately();
                    }

                    @Async
                    public void asyncCallsAsync() {
                        asynchronous();
                    }

                    public void plainCallsPlain() {
                        plain();
                    }

                    @Transactional
                    public void transactional() {
                    }

                    @Transactional(propagation = Propagation.REQUIRES_NEW)
                    public void separately() {
                    }

                    @Async
                    public void asynchronous() {
                    }

                    @Writes
                    public void writes() {
                    }

                    @Transactional
                    public int counted() {
                        return 1;
                    }

                    public void plain() {
                    }

                    class Inner {

                        void innerCallsOuter() {
                            transactional();
                        }

                        @Transactional
                        void transactionalInnerCallsOuter() {
                            transactional();
                        }
                    }

                    Runnable anonymous() {
                        return new Runnable() {
                            @Override
                            public void run() {
                                asynchronous();
                            }
                        };
                    }
                }
                """, "cz.novanadeje.app.planteda.application.Writes", """
                package cz.novanadeje.app.planteda.application;

                import java.lang.annotation.Retention;
                import java.lang.annotation.RetentionPolicy;
                import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

                @Retention(RetentionPolicy.RUNTIME)
                @Transactional
                @interface Writes {
                }
                """, "cz.novanadeje.app.planteda.application.PlantedReadingClass", """
                package cz.novanadeje.app.planteda.application;

                import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

                @Transactional(readOnly = true)
                class PlantedReadingClass {

                    PlantedReadingClass() {
                        read();
                    }

                    public void read() {
                    }

                    public void readsAgain() {
                        read();
                    }

                    @Transactional
                    public void writeCallsRead() {
                        read();
                    }

                    public static void staticCallsNothing() {
                    }

                    private void helperCallsRead() {
                        read();
                    }

                    private void helperCallsStatic() {
                        staticCallsNothing();
                    }
                }
                """, "cz.novanadeje.app.planteda.application.PlantedAsyncClass", """
                package cz.novanadeje.app.planteda.application;

                import org.springframework.scheduling.annotation.Async;

                @Async
                class PlantedAsyncClass {

                    public void first() {
                        second();
                    }

                    public void second() {
                    }

                    private void helper() {
                    }

                    public void callsHelper() {
                        helper();
                    }
                }
                """, "cz.novanadeje.app.planteda.application.PlantedCaller", """
                package cz.novanadeje.app.planteda.application;

                class PlantedCaller {

                    private final PlantedMethods other;

                    PlantedCaller(PlantedMethods other) {
                        this.other = other;
                    }

                    void throughTheProxy() {
                        other.transactional();
                        other.asynchronous();
                    }

                    static class Nested {

                        void throughAReference(PlantedMethods methods) {
                            methods.transactional();
                        }
                    }
                }
                """));

        assertThat(calls_within_a_class_never_rely_on_a_proxy_attribute.evaluate(planted).getFailureReport().getDetails())
                .hasSize(15)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.plainCallsTransactional()").contains("transactional()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.plainCallsThisAsync()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.plainCallsMetaTransactional()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.plainReferencesTransactional()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.plainCallsInALambda()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.transactionalCallsNewOne()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.newOneCallsNewOne()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods.asyncCallsAsync()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods$Inner.innerCallsOuter()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods$Inner.transactionalInnerCallsOuter()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMethods$1.run()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedReadingClass.<init>()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedReadingClass.writeCallsRead()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedReadingClass.helperCallsRead()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedAsyncClass.first()"))
                .noneSatisfy(detail -> assertThat(detail).containsAnyOf("transactionalCallsTheSame", "plainCallsPlain", "readsAgain",
                        "helperCallsStatic", "callsHelper", "PlantedCaller"));
    }

    private static ArchCondition<JavaCodeUnit> callAMethodOfTheirOwnClassWhoseProxyAttributeWouldNotApply() {
        return new ArchCondition<>("call a @Transactional or @Async method of their own class whose attribute the call would bypass") {
            @Override
            public void check(JavaCodeUnit caller, ConditionEvents events) {
                Set<JavaClass> ownClasses = ownClassesOf(caller.getOwner());
                Stream.<JavaAccess<?>>concat(caller.getMethodCallsFromSelf().stream(), caller.getMethodReferencesFromSelf().stream())
                        .filter(access -> ownClasses.contains(access.getTargetOwner()))
                        .forEach(access -> bypassedAttributeOf(caller, access).ifPresent(attribute -> events.add(SimpleConditionEvent.satisfied(caller,
                                caller.getFullName() + " calls " + ((CodeUnitAccessTarget) access.getTarget()).getFullName() + " of its own class, "
                                        + "bypassing its " + attribute + " " + access.getSourceCodeLocation()))));
            }
        };
    }

    private static Optional<String> bypassedAttributeOf(JavaCodeUnit caller, JavaAccess<?> access) {
        Optional<JavaMethod> target = ((CodeUnitAccessTarget) access.getTarget()).resolveMember().filter(JavaMethod.class::isInstance).map(JavaMethod.class::cast);
        if (target.isEmpty()) {
            return Optional.empty();
        }
        if (attributeOf(target.get(), Async.class).isPresent()) {
            return Optional.of("@Async");
        }
        Optional<JavaAnnotation<?>> transactional = attributeOf(target.get(), Transactional.class);
        boolean underTheSameTransaction = transactional.filter(SelfInvocationRulesTest::joinsARunningTransaction).isPresent()
                && caller.getOwner().equals(target.get().getOwner())
                && attributeOf(caller, Transactional.class).filter(own -> sameProperties(own, transactional.get())).isPresent();
        return transactional.filter(any -> !underTheSameTransaction).map(any -> "@Transactional");
    }

    private static Optional<JavaAnnotation<?>> attributeOf(JavaCodeUnit codeUnit, Class<? extends Annotation> kind) {
        Optional<JavaAnnotation<?>> own = declaredOn(codeUnit, kind);
        if (own.isPresent()) {
            return own;
        }
        boolean proxied = codeUnit instanceof JavaMethod && !codeUnit.getModifiers().contains(JavaModifier.PRIVATE)
                && !codeUnit.getModifiers().contains(JavaModifier.STATIC);
        return proxied ? declaredOn(codeUnit.getOwner(), kind) : Optional.empty();
    }

    private static Optional<JavaAnnotation<?>> declaredOn(HasAnnotations<?> annotated, Class<? extends Annotation> kind) {
        return annotated.getAnnotations().stream()
                .<JavaAnnotation<?>>flatMap(annotation -> annotation.getRawType().isEquivalentTo(kind)
                        ? Stream.of(annotation)
                        : annotation.getRawType().getAnnotations().stream().filter(meta -> meta.getRawType().isEquivalentTo(kind)))
                .findFirst();
    }

    private static boolean joinsARunningTransaction(JavaAnnotation<?> transactional) {
        return transactional.get("propagation").filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast).map(JavaEnumConstant::name)
                .map(JOINING_PROPAGATIONS::contains).orElse(true);
    }

    private static boolean sameProperties(JavaAnnotation<?> one, JavaAnnotation<?> other) {
        Map<String, Object> ones = one.getProperties();
        Map<String, Object> others = other.getProperties();
        return ones.keySet().equals(others.keySet()) && ones.keySet().stream().allMatch(key -> Objects.deepEquals(ones.get(key), others.get(key)));
    }

    private static Set<JavaClass> ownClassesOf(JavaClass caller) {
        return Stream.iterate(Optional.of(caller), Optional::isPresent, type -> type
                        .filter(nested -> nested.isInnerClass() || nested.isAnonymousClass() || nested.isLocalClass())
                        .flatMap(JavaClass::getEnclosingClass))
                .map(Optional::get)
                .collect(Collectors.toSet());
    }
}
