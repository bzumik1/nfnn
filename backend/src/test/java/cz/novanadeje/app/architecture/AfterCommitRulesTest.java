package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
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
import com.tngtech.archunit.lang.ConditionEvent;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.repository.Repository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.TransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionOperations;

import java.io.IOException;
import java.lang.annotation.Annotation;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.base.DescribedPredicate.describe;
import static com.tngtech.archunit.lang.conditions.ArchConditions.beMetaAnnotatedWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class AfterCommitRulesTest {

    private static final String SITE = "cz.novanadeje.app";
    private static final Set<String> AFTER_COMPLETION_PHASES = Set.of(TransactionPhase.AFTER_COMMIT.name(), TransactionPhase.AFTER_ROLLBACK.name(),
            TransactionPhase.AFTER_COMPLETION.name());
    private static final Set<String> OUTSIDE_A_RUNNING_TRANSACTION = Set.of(Propagation.REQUIRES_NEW.name(), Propagation.NOT_SUPPORTED.name());
    private static final List<Class<?>> TRANSACTIONAL_LIBRARIES = List.of(Repository.class, EntityManager.class, TransactionOperations.class,
            TransactionManager.class);

    private static final DescribedPredicate<JavaAnnotation<?>> AN_AFTER_COMMIT_LISTENER = describe(
            "@TransactionalEventListener(phase = AFTER_COMMIT)",
            annotation -> annotation.getRawType().isEquivalentTo(TransactionalEventListener.class)
                    && phaseOf(annotation).equals(TransactionPhase.AFTER_COMMIT.name()));

    private static final DescribedPredicate<JavaMethod> SYNCHRONOUS_AFTER_COMPLETION_LISTENERS = describe(
            "are synchronous @TransactionalEventListener methods of an AFTER_COMMIT, AFTER_ROLLBACK or AFTER_COMPLETION phase that open no transaction of their own",
            method -> declaredOn(method, TransactionalEventListener.class).map(AfterCommitRulesTest::phaseOf).filter(AFTER_COMPLETION_PHASES::contains).isPresent()
                    && attributeOf(method, Async.class).isEmpty()
                    && attributeOf(method, Transactional.class).filter(AfterCommitRulesTest::outsideARunningTransaction).isEmpty());

    @ArchTest
    static final ArchRule async_work_is_an_after_commit_listener = methods()
            .that().areMetaAnnotatedWith(Async.class)
            .should(beMetaAnnotatedWith(AN_AFTER_COMMIT_LISTENER))
            .because("backend.md, Contexts and layers: @Async runs a side effect after the commit it follows, so it sits only on an AFTER_COMMIT "
                    + "listener; on any other method it would fire before or regardless of the outcome of the caller's transaction");

    @ArchTest
    static final ArchRule no_class_is_async = noClasses()
            .should(beMetaAnnotatedWith(describe("@Async", annotation -> annotation.getRawType().isEquivalentTo(Async.class))))
            .because("backend.md, Contexts and layers: @Async belongs on the AFTER_COMMIT listener method, and on a class it would make every "
                    + "public method fire and forget");

    @ArchTest
    static final ArchRule synchronous_after_completion_listeners_stay_out_of_the_finished_transaction = methods()
            .that(SYNCHRONOUS_AFTER_COMPLETION_LISTENERS)
            .should(reachNoWorkThatJoinsTheFinishedTransaction())
            .because("backend.md, Contexts and layers: while an AFTER_COMMIT listener runs synchronously the finished transaction's resources are still "
                    + "bound to the thread, so whatever joins a running transaction there writes into one that never commits again; such work runs "
                    + "behind REQUIRES_NEW, NOT_SUPPORTED or @Async");

    @Test
    @DisplayName("Given planted @Async methods and an @Async class, when the rules check them, then each outside an AFTER_COMMIT listener is reported and the AFTER_COMMIT listeners are not")
    void should_report_every_async_outside_an_after_commit_listener_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.events.PlantedAsyncWork", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import org.springframework.context.event.EventListener;
                import org.springframework.scheduling.annotation.Async;
                import org.springframework.transaction.event.TransactionPhase;
                import org.springframework.transaction.event.TransactionalEventListener;

                class PlantedAsyncWork {

                    @Async
                    void fireAndForget() {
                    }

                    @Async
                    @EventListener
                    void plainListener(String event) {
                    }

                    @Async
                    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                    void beforeCommit(String event) {
                    }

                    @Async
                    @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
                    void afterRollback(String event) {
                    }

                    @Async
                    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                    void afterCommit(String event) {
                    }

                    @Async
                    @TransactionalEventListener
                    void afterCommitByDefault(String event) {
                    }

                    @Async
                    @AfterCommit
                    void afterCommitByMetaAnnotation(String event) {
                    }
                }
                """, "cz.novanadeje.app.planteda.infrastructure.events.AfterCommit", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import java.lang.annotation.Retention;
                import java.lang.annotation.RetentionPolicy;
                import org.springframework.transaction.event.TransactionalEventListener;

                @Retention(RetentionPolicy.RUNTIME)
                @TransactionalEventListener
                @interface AfterCommit {
                }
                """, "cz.novanadeje.app.planteda.infrastructure.events.PlantedAsyncClass", """
                package cz.novanadeje.app.planteda.infrastructure.events;

                import org.springframework.scheduling.annotation.Async;

                @Async
                class PlantedAsyncClass {

                    public void everyMethod() {
                    }
                }
                """));

        assertThat(async_work_is_an_after_commit_listener.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("fireAndForget"))
                .anySatisfy(detail -> assertThat(detail).contains("plainListener"))
                .anySatisfy(detail -> assertThat(detail).contains("beforeCommit"))
                .anySatisfy(detail -> assertThat(detail).contains("afterRollback"));
        assertThat(no_class_is_async.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("PlantedAsyncClass"));
    }

    @Test
    @DisplayName("Given planted synchronous after-completion listeners, when the rule checks them, then each that reaches work joining the finished transaction is reported and the ones behind a new transaction, NOT_SUPPORTED or @Async are not")
    void should_report_every_listener_reaching_a_joining_transaction_when_checked_given_planted_listeners(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.ofEntries(
                Map.entry("cz.novanadeje.app.planteda.infrastructure.events.PlantedListeners", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.planteda.application.PlantedPlainService;
                        import cz.novanadeje.app.planteda.application.PlantedReadingService;
                        import cz.novanadeje.app.planteda.application.PlantedWritingService;
                        import jakarta.persistence.EntityManager;
                        import java.util.function.Consumer;
                        import org.springframework.scheduling.annotation.Async;
                        import org.springframework.transaction.annotation.Propagation;
                        import org.springframework.transaction.annotation.Transactional;
                        import org.springframework.transaction.event.TransactionPhase;
                        import org.springframework.transaction.event.TransactionalEventListener;
                        import org.springframework.transaction.support.TransactionOperations;

                        class PlantedListeners {

                            private final PlantedWritingService writing;
                            private final PlantedPlainService plain;
                            private final PlantedReadingService reading;
                            private final PlantedRows rows;
                            private final EntityManager entities;
                            private final TransactionOperations transactions;

                            PlantedListeners(PlantedWritingService writing, PlantedPlainService plain, PlantedReadingService reading, PlantedRows rows,
                                             EntityManager entities, TransactionOperations transactions) {
                                this.writing = writing;
                                this.plain = plain;
                                this.reading = reading;
                                this.rows = rows;
                                this.entities = entities;
                                this.transactions = transactions;
                            }

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                            void writesDirectly(String event) {
                                writing.write();
                            }

                            @TransactionalEventListener(fallbackExecution = true)
                            void writesThroughAPlainServiceAndAPort(String event) {
                                plain.forward();
                            }

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
                            void readsAfterARollback(String event) {
                                reading.read();
                            }

                            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
                            void countsRows(String event) {
                                rows.count();
                            }

                            @TransactionalEventListener
                            void persists(Object event) {
                                entities.persist(event);
                            }

                            @TransactionalEventListener
                            void runsATemplate(String event) {
                                transactions.executeWithoutResult(status -> {
                                });
                            }

                            @TransactionalEventListener
                            void writesThroughAHelper(Integer event) {
                                helper();
                            }

                            @TransactionalEventListener
                            void writesInALambda(Long event) {
                                Runnable later = () -> writing.write();
                                later.run();
                            }

                            @TransactionalEventListener
                            Consumer<String> referencesAWrite(Short event) {
                                return writing::writeOne;
                            }

                            @TransactionalEventListener
                            void writesSeparately(String event) {
                                writing.separately();
                            }

                            @TransactionalEventListener
                            void writesWithoutATransaction(String event) {
                                writing.withoutATransaction();
                            }

                            @TransactionalEventListener
                            void writesLater(String event) {
                                writing.later();
                            }

                            @TransactionalEventListener
                            void staysInMemory(String event) {
                                plain.remember();
                            }

                            @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
                            void writesBeforeTheCommit(String event) {
                                writing.write();
                            }

                            @Async
                            @TransactionalEventListener
                            void writesOnAnotherThread(Byte event) {
                                writing.write();
                            }

                            @Transactional(propagation = Propagation.REQUIRES_NEW)
                            @TransactionalEventListener
                            void opensItsOwn(Character event) {
                                writing.write();
                            }

                            @AfterCommit
                            void writesUnderAComposedListener(Float event) {
                                writing.write();
                            }

                            @TransactionalEventListener
                            void writesThroughItsOwnNewTransaction(Double event) {
                                ownSeparately();
                            }

                            private void helper() {
                                writing.write();
                            }

                            @Transactional(propagation = Propagation.REQUIRES_NEW)
                            void ownSeparately() {
                                writing.write();
                            }
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.infrastructure.events.AfterCommit", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import java.lang.annotation.Retention;
                        import java.lang.annotation.RetentionPolicy;
                        import org.springframework.transaction.event.TransactionalEventListener;

                        @Retention(RetentionPolicy.RUNTIME)
                        @TransactionalEventListener
                        @interface AfterCommit {
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.infrastructure.events.PlantedRows", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        interface PlantedRows extends org.springframework.data.repository.Repository<Object, Long> {

                            long count();
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.application.PlantedWritingService", """
                        package cz.novanadeje.app.planteda.application;

                        import org.springframework.scheduling.annotation.Async;
                        import org.springframework.transaction.annotation.Propagation;
                        import org.springframework.transaction.annotation.Transactional;

                        public class PlantedWritingService {

                            private final PlantedReadingService reading;

                            public PlantedWritingService(PlantedReadingService reading) {
                                this.reading = reading;
                            }

                            @Transactional
                            public void write() {
                            }

                            @Transactional
                            public void writeOne(String value) {
                            }

                            @Transactional(propagation = Propagation.REQUIRES_NEW)
                            public void separately() {
                                write();
                            }

                            @Transactional(propagation = Propagation.NOT_SUPPORTED)
                            public void withoutATransaction() {
                            }

                            @Async
                            public void later() {
                                reading.read();
                            }
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.application.PlantedReadingService", """
                        package cz.novanadeje.app.planteda.application;

                        import org.springframework.transaction.annotation.Transactional;

                        @Transactional(readOnly = true)
                        public class PlantedReadingService {

                            public void read() {
                            }
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.application.PlantedPlainService", """
                        package cz.novanadeje.app.planteda.application;

                        public class PlantedPlainService {

                            private final PlantedPort port;
                            private int remembered;

                            public PlantedPlainService(PlantedPort port) {
                                this.port = port;
                            }

                            public void forward() {
                                port.store();
                            }

                            public void remember() {
                                remembered++;
                                remember(remembered);
                            }

                            private void remember(int times) {
                                if (times < 3) {
                                    remember();
                                }
                            }
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.application.PlantedPort", """
                        package cz.novanadeje.app.planteda.application;

                        public interface PlantedPort {

                            void store();
                        }
                        """),
                Map.entry("cz.novanadeje.app.planteda.infrastructure.persistence.PlantedPortAdapter", """
                        package cz.novanadeje.app.planteda.infrastructure.persistence;

                        import cz.novanadeje.app.planteda.application.PlantedPort;
                        import org.springframework.transaction.annotation.Propagation;
                        import org.springframework.transaction.annotation.Transactional;

                        class PlantedPortAdapter implements PlantedPort {

                            @Override
                            @Transactional(propagation = Propagation.MANDATORY)
                            public void store() {
                            }
                        }
                        """)));

        assertThat(synchronous_after_completion_listeners_stay_out_of_the_finished_transaction.evaluate(planted).getFailureReport().getDetails())
                .hasSize(11)
                .anySatisfy(detail -> assertThat(detail).contains("writesDirectly").contains("PlantedWritingService.write()"))
                .anySatisfy(detail -> assertThat(detail).contains("writesThroughAPlainServiceAndAPort").contains("PlantedPortAdapter.store()"))
                .anySatisfy(detail -> assertThat(detail).contains("readsAfterARollback").contains("PlantedReadingService.read()"))
                .anySatisfy(detail -> assertThat(detail).contains("countsRows").contains("PlantedRows.count()"))
                .anySatisfy(detail -> assertThat(detail).contains("persists").contains("EntityManager.persist"))
                .anySatisfy(detail -> assertThat(detail).contains("runsATemplate").contains("TransactionOperations.executeWithoutResult"))
                .anySatisfy(detail -> assertThat(detail).contains("writesThroughAHelper").contains("PlantedWritingService.write()"))
                .anySatisfy(detail -> assertThat(detail).contains("writesThroughItsOwnNewTransaction").contains("PlantedWritingService.write()"))
                .anySatisfy(detail -> assertThat(detail).contains("writesUnderAComposedListener").contains("PlantedWritingService.write()"))
                .anySatisfy(detail -> assertThat(detail).contains("writesInALambda").contains("PlantedWritingService.write()"))
                .anySatisfy(detail -> assertThat(detail).contains("referencesAWrite").contains("PlantedWritingService.writeOne"));
    }

    private static ArchCondition<JavaMethod> reachNoWorkThatJoinsTheFinishedTransaction() {
        return new ArchCondition<>("reach, through the site's own code, no work that joins a running transaction") {
            @Override
            public void check(JavaMethod listener, ConditionEvents events) {
                Map<JavaCodeUnit, JavaCodeUnit> reachedFrom = new HashMap<>();
                Deque<JavaCodeUnit> pending = new ArrayDeque<>(List.of(listener));
                reachedFrom.put(listener, listener);
                while (!pending.isEmpty()) {
                    JavaCodeUnit caller = pending.poll();
                    for (JavaAccess<?> access : callsFrom(caller)) {
                        if (TRANSACTIONAL_LIBRARIES.stream().anyMatch(library -> access.getTargetOwner().isAssignableTo(library))) {
                            events.add(joins(listener, pathTo(caller, reachedFrom), access.getTarget().getFullName()));
                            continue;
                        }
                        for (JavaCodeUnit target : codeUnitsRunBy(access)) {
                            boolean throughTheProxy = !ownClassesOf(caller.getOwner()).contains(target.getOwner());
                            if (throughTheProxy && attributeOf(target, Async.class).isPresent()) {
                                continue;
                            }
                            Optional<JavaAnnotation<?>> transactional = throughTheProxy ? attributeOf(target, Transactional.class) : Optional.empty();
                            if (transactional.filter(AfterCommitRulesTest::outsideARunningTransaction).isPresent()) {
                                continue;
                            }
                            if (transactional.isPresent()) {
                                events.add(joins(listener, pathTo(caller, reachedFrom), target.getFullName()));
                                continue;
                            }
                            if (reachedFrom.putIfAbsent(target, caller) == null) {
                                pending.add(target);
                            }
                        }
                    }
                }
            }
        };
    }

    private static ConditionEvent joins(JavaMethod listener, List<JavaCodeUnit> path, String joiningWork) {
        String through = path.stream().map(JavaCodeUnit::getFullName).collect(Collectors.joining(" -> "));
        return SimpleConditionEvent.violated(listener, through + " -> " + joiningWork + " joins the finished transaction " + listener.getSourceCodeLocation());
    }

    private static List<JavaCodeUnit> pathTo(JavaCodeUnit reached, Map<JavaCodeUnit, JavaCodeUnit> reachedFrom) {
        List<JavaCodeUnit> path = new ArrayList<>();
        JavaCodeUnit step = reached;
        path.addFirst(step);
        while (reachedFrom.get(step) != step) {
            step = reachedFrom.get(step);
            path.addFirst(step);
        }
        return path;
    }

    private static List<JavaAccess<?>> callsFrom(JavaCodeUnit caller) {
        return Stream.of(caller.getMethodCallsFromSelf(), caller.getMethodReferencesFromSelf(), caller.getConstructorCallsFromSelf(),
                        caller.getConstructorReferencesFromSelf())
                .<JavaAccess<?>>flatMap(Set::stream)
                .toList();
    }

    private static List<JavaCodeUnit> codeUnitsRunBy(JavaAccess<?> access) {
        if (!(access.getTarget() instanceof CodeUnitAccessTarget target) || !access.getTargetOwner().getPackageName().startsWith(SITE)) {
            return List.of();
        }
        Optional<? extends JavaCodeUnit> declared = target.resolveMember();
        if (declared.isEmpty()) {
            return List.of();
        }
        JavaCodeUnit codeUnit = declared.get();
        List<String> parameters = codeUnit.getRawParameterTypes().stream().map(JavaClass::getName).toList();
        Stream<JavaCodeUnit> overrides = codeUnit instanceof JavaMethod && !codeUnit.getModifiers().contains(JavaModifier.STATIC)
                ? codeUnit.getOwner().getAllSubclasses().stream()
                .flatMap(subclass -> subclass.getMethods().stream())
                .filter(method -> method.getName().equals(codeUnit.getName())
                        && method.getRawParameterTypes().stream().map(JavaClass::getName).toList().equals(parameters))
                .map(JavaCodeUnit.class::cast)
                : Stream.empty();
        return Stream.concat(Stream.of(codeUnit), overrides).toList();
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

    private static boolean outsideARunningTransaction(JavaAnnotation<?> transactional) {
        return OUTSIDE_A_RUNNING_TRANSACTION.contains(enumProperty(transactional, "propagation").orElse(Propagation.REQUIRED.name()));
    }

    private static String phaseOf(JavaAnnotation<?> listener) {
        return enumProperty(listener, "phase").orElse(TransactionPhase.AFTER_COMMIT.name());
    }

    private static Optional<String> enumProperty(JavaAnnotation<?> annotation, String property) {
        return annotation.get(property).filter(JavaEnumConstant.class::isInstance).map(JavaEnumConstant.class::cast).map(JavaEnumConstant::name);
    }

    private static Set<JavaClass> ownClassesOf(JavaClass caller) {
        return Stream.iterate(Optional.of(caller), Optional::isPresent, type -> type
                        .filter(nested -> nested.isInnerClass() || nested.isAnonymousClass() || nested.isLocalClass())
                        .flatMap(JavaClass::getEnclosingClass))
                .map(Optional::get)
                .collect(Collectors.toSet());
    }
}
