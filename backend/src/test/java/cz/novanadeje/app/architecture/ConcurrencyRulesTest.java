package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorCallTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Qualifier;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.locks.LockSupport;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.equivalentTo;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ConcurrencyRulesTest {

    private static final Set<String> THREAD_STARTS = Set.of("ofVirtual", "ofPlatform", "startVirtualThread");

    private static final DescribedPredicate<JavaClass> THREAD_MACHINERY = assignableTo(Executor.class)
            .or(assignableTo(ThreadFactory.class))
            .or(assignableTo(Thread.Builder.class))
            .or(equivalentTo(Executors.class))
            .or(equivalentTo(Semaphore.class))
            .or(equivalentTo(LockSupport.class))
            .or(equivalentTo(Qualifier.class))
            .as("an Executor, ExecutorService, Executors, ThreadFactory, Thread.Builder, Semaphore, LockSupport or @Qualifier");

    private static final DescribedPredicate<JavaAccess<?>> A_THREAD_CREATION = DescribedPredicate.describe(
            "a new Thread, Thread.ofVirtual, Thread.ofPlatform or Thread.startVirtualThread",
            access -> access.getTargetOwner().isAssignableTo(Thread.class)
                    && (access.getTarget() instanceof ConstructorCallTarget
                    || access.getTarget() instanceof CodeUnitAccessTarget target && (target.getName().equals("<init>") || THREAD_STARTS.contains(target.getName()))));

    @ArchTest
    static final ArchRule application_and_domain_leave_threads_to_adapters = noClasses()
            .that().resideInAnyPackage("..application..", "..domain..")
            .should().dependOnClassesThat(THREAD_MACHINERY)
            .orShould().accessTargetWhere(A_THREAD_CREATION)
            .because("fan-out, pacing and the choice of thread are a transport's concern: an adapter behind a port decides how many run at once "
                    + "and on which executor, so a use case states what to do and never which thread does it");

    @Test
    @DisplayName("Given planted application and domain classes that fan out, pace, cap, start threads and pick an executor by qualifier, when the rule checks them, then each is reported and the same code in an adapter or a read of the current thread is not")
    void should_report_thread_machinery_when_checked_given_planted_application_and_domain_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.application.PlantedFanOut", """
                        package cz.novanadeje.app.planteda.application;

                        import java.util.concurrent.ExecutorService;
                        import java.util.concurrent.Executors;

                        class PlantedFanOut {

                            void send(Runnable each) {
                                try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
                                    sends.submit(each);
                                }
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedPacing", """
                        package cz.novanadeje.app.planteda.application;

                        import java.util.concurrent.Semaphore;

                        class PlantedPacing {

                            private final Semaphore slots = new Semaphore(8);

                            boolean slot() {
                                return slots.tryAcquire();
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedPause", """
                        package cz.novanadeje.app.planteda.application;

                        import java.util.concurrent.locks.LockSupport;

                        class PlantedPause {

                            void pause() {
                                LockSupport.parkNanos(50_000_000L);
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedHandOff", """
                        package cz.novanadeje.app.planteda.application;

                        import org.springframework.beans.factory.annotation.Qualifier;

                        class PlantedHandOff {

                            PlantedHandOff(@Qualifier("applicationTaskExecutor") Object rounds) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedThreads", """
                        package cz.novanadeje.app.planteda.domain;

                        class PlantedThreads {

                            void started(Runnable work) {
                                Thread.ofVirtual().start(work);
                            }

                            void created(Runnable work) {
                                new Thread(work).start();
                            }

                            void virtual(Runnable work) {
                                Thread.startVirtualThread(work);
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedFactory", """
                        package cz.novanadeje.app.planteda.domain;

                        import java.util.concurrent.ThreadFactory;

                        class PlantedFactory {

                            Thread made(ThreadFactory factory, Runnable work) {
                                return factory.newThread(work);
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.PlantedInterruption", """
                        package cz.novanadeje.app.planteda.application;

                        class PlantedInterruption {

                            boolean stopping() {
                                return Thread.currentThread().isInterrupted();
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.PlantedAdapter", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        import org.springframework.beans.factory.annotation.Qualifier;

                        import java.util.concurrent.Executor;
                        import java.util.concurrent.ExecutorService;
                        import java.util.concurrent.Executors;
                        import java.util.concurrent.Semaphore;
                        import java.util.concurrent.locks.LockSupport;

                        class PlantedAdapter {

                            private final Semaphore slots = new Semaphore(8);
                            private final Executor rounds;

                            PlantedAdapter(@Qualifier("applicationTaskExecutor") Executor rounds) {
                                this.rounds = rounds;
                            }

                            void send(Runnable each) {
                                LockSupport.parkNanos(1L);
                                new Thread(each).start();
                                try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
                                    sends.submit(each);
                                }
                            }
                        }
                        """));

        assertThat(application_and_domain_leave_threads_to_adapters.evaluate(planted).getFailureReport().getDetails())
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFanOut").contains("Executors"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFanOut").contains("ExecutorService"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedPacing").contains("Semaphore"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedPause").contains("LockSupport"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedHandOff").contains("Qualifier"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedThreads.started"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedThreads.created"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedThreads.virtual"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedFactory").contains("ThreadFactory"))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedInterruption"))
                .noneSatisfy(detail -> assertThat(detail).contains("PlantedAdapter"));
    }
}
