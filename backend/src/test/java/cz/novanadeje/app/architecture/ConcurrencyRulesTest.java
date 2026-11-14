package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
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
import org.springframework.scheduling.TaskScheduler;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Timer;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executor;
import java.util.concurrent.ForkJoinTask;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.BaseStream;
import java.util.stream.Collectors;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.equivalentTo;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ConcurrencyRulesTest {

    private static final Pattern PLANTED_ORIGIN = Pattern.compile("cz\\.novanadeje\\.app\\.planteda\\.\\w+\\.(Planted\\w+)");

    private static final DescribedPredicate<JavaClass> THREAD_MACHINERY = assignableTo(Executor.class)
            .or(assignableTo(ThreadFactory.class))
            .or(assignableTo(Thread.Builder.class))
            .or(assignableTo(TaskScheduler.class))
            .or(assignableTo(Timer.class))
            .or(equivalentTo(Executors.class))
            .or(equivalentTo(Semaphore.class))
            .or(equivalentTo(LockSupport.class))
            .or(equivalentTo(Qualifier.class))
            .as("an Executor, ExecutorService, Executors, ThreadFactory, Thread.Builder, TaskScheduler, Timer, Semaphore, LockSupport or @Qualifier");

    private static final DescribedPredicate<JavaAccess<?>> A_THREAD_START = codeUnitOf(Thread.class, Set.of("<init>", "ofVirtual", "ofPlatform", "startVirtualThread")::contains)
            .as("a new Thread, a Thread subclass, Thread::new, Thread.ofVirtual, Thread.ofPlatform or Thread.startVirtualThread");

    private static final DescribedPredicate<JavaAccess<?>> A_SLEEP = codeUnitOf(Thread.class, "sleep"::equals)
            .or(codeUnitOf(TimeUnit.class, "sleep"::equals))
            .as("Thread.sleep or TimeUnit.sleep");

    private static final DescribedPredicate<JavaAccess<?>> A_SHARED_POOL_TASK = codeUnitOf(Collection.class, "parallelStream"::equals)
            .or(codeUnitOf(BaseStream.class, "parallel"::equals))
            .or(codeUnitOf(CompletionStage.class, name -> name.endsWith("Async")))
            .or(codeUnitOf(Arrays.class, name -> name.startsWith("parallel")))
            .or(codeUnitOf(ForkJoinTask.class, Set.of("fork", "invoke", "invokeAll")::contains))
            .as("a parallel stream, an Arrays.parallel… call, a forked ForkJoinTask or a CompletableFuture or CompletionStage method ending in Async");

    @ArchTest
    static final ArchRule application_and_domain_leave_threads_to_adapters = noClasses()
            .that().resideInAnyPackage("..application..", "..domain..")
            .should().dependOnClassesThat(THREAD_MACHINERY)
            .orShould().accessTargetWhere(A_THREAD_START)
            .orShould().accessTargetWhere(A_SLEEP)
            .orShould().accessTargetWhere(A_SHARED_POOL_TASK)
            .because("fan-out, pacing and the choice of thread are a transport's concern: an adapter behind a port decides how many run at once "
                    + "and on which executor, so a use case states what to do and never which thread does it, nor sleeps on its caller's");

    @Test
    @DisplayName("Given planted application and domain classes that each fan out, pace, cap, sleep, run on a shared pool, start a thread or pick an executor in one way, when the rule checks them, then each is reported and the same code in an adapter, a read of the current thread or sequential work is not")
    void should_report_thread_machinery_when_checked_given_planted_application_and_domain_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.ofEntries(
                planted("application", "PlantedExecutor", """
                        import java.util.concurrent.Executor;

                        class PlantedExecutor {

                            private final Executor rounds;

                            PlantedExecutor(Executor rounds) {
                                this.rounds = rounds;
                            }
                        }
                        """),
                planted("application", "PlantedExecutors", """
                        import java.util.concurrent.Callable;
                        import java.util.concurrent.Executors;

                        class PlantedExecutors {

                            Callable<Object> task(Runnable each) {
                                return Executors.callable(each);
                            }
                        }
                        """),
                planted("application", "PlantedPacing", """
                        import java.util.concurrent.Semaphore;

                        class PlantedPacing {

                            private final Semaphore slots = new Semaphore(8);

                            boolean slot() {
                                return slots.tryAcquire();
                            }
                        }
                        """),
                planted("application", "PlantedPause", """
                        import java.util.concurrent.locks.LockSupport;

                        class PlantedPause {

                            void pause() {
                                LockSupport.parkNanos(50_000_000L);
                            }
                        }
                        """),
                planted("application", "PlantedHandOff", """
                        import org.springframework.beans.factory.annotation.Qualifier;

                        class PlantedHandOff {

                            PlantedHandOff(@Qualifier("applicationTaskExecutor") Object rounds) {
                            }
                        }
                        """),
                planted("domain", "PlantedFactory", """
                        import java.util.concurrent.ThreadFactory;

                        class PlantedFactory {

                            Thread made(ThreadFactory factory, Runnable work) {
                                return factory.newThread(work);
                            }
                        }
                        """),
                planted("domain", "PlantedBuilderParameter", """
                        class PlantedBuilderParameter {

                            void use(Thread.Builder builder) {
                            }
                        }
                        """),
                planted("application", "PlantedTimer", """
                        import java.util.Timer;

                        class PlantedTimer {

                            Object timer() {
                                return new Timer();
                            }
                        }
                        """),
                planted("application", "PlantedScheduler", """
                        import org.springframework.scheduling.TaskScheduler;

                        class PlantedScheduler {

                            private final TaskScheduler scheduler;

                            PlantedScheduler(TaskScheduler scheduler) {
                                this.scheduler = scheduler;
                            }
                        }
                        """),
                planted("domain", "PlantedVirtualBuilder", """
                        class PlantedVirtualBuilder {

                            Object builder() {
                                return Thread.ofVirtual();
                            }
                        }
                        """),
                planted("domain", "PlantedPlatformBuilder", """
                        class PlantedPlatformBuilder {

                            Object builder() {
                                return Thread.ofPlatform();
                            }
                        }
                        """),
                planted("domain", "PlantedVirtualStart", """
                        class PlantedVirtualStart {

                            void started(Runnable work) {
                                Thread.startVirtualThread(work);
                            }
                        }
                        """),
                planted("domain", "PlantedThreadCreation", """
                        class PlantedThreadCreation {

                            void created(Runnable work) {
                                new Thread(work).start();
                            }
                        }
                        """),
                planted("domain", "PlantedThreadReference", """
                        import java.util.function.Function;

                        class PlantedThreadReference {

                            Function<Runnable, Thread> threads() {
                                return Thread::new;
                            }
                        }
                        """),
                planted("application", "PlantedThreadSubclass", """
                        class PlantedThreadSubclass extends Thread {
                        }
                        """),
                planted("application", "PlantedThreadSleep", """
                        class PlantedThreadSleep {

                            void pause() throws InterruptedException {
                                Thread.sleep(50);
                            }
                        }
                        """),
                planted("application", "PlantedTimeUnitSleep", """
                        import java.util.concurrent.TimeUnit;

                        class PlantedTimeUnitSleep {

                            void pause() throws InterruptedException {
                                TimeUnit.MILLISECONDS.sleep(50);
                            }
                        }
                        """),
                planted("application", "PlantedParallelStream", """
                        import java.util.List;

                        class PlantedParallelStream {

                            long count(List<String> names) {
                                return names.parallelStream().count();
                            }
                        }
                        """),
                planted("domain", "PlantedParallelSort", """
                        import java.util.Arrays;

                        class PlantedParallelSort {

                            void sort(long[] amounts) {
                                Arrays.parallelSort(amounts);
                            }
                        }
                        """),
                planted("application", "PlantedForkedTask", """
                        import java.util.concurrent.RecursiveTask;

                        class PlantedForkedTask {

                            Long total(RecursiveTask<Long> sum) {
                                return sum.fork().join();
                            }
                        }
                        """),
                planted("domain", "PlantedParallelOnStream", """
                        import java.util.List;

                        class PlantedParallelOnStream {

                            long count(List<String> names) {
                                return names.stream().parallel().count();
                            }
                        }
                        """),
                planted("application", "PlantedRunAsync", """
                        import java.util.concurrent.CompletableFuture;

                        class PlantedRunAsync {

                            Object run(Runnable work) {
                                return CompletableFuture.runAsync(work);
                            }
                        }
                        """),
                planted("application", "PlantedSupplyAsync", """
                        import java.util.concurrent.CompletableFuture;

                        class PlantedSupplyAsync {

                            Object supply() {
                                return CompletableFuture.supplyAsync(() -> 1);
                            }
                        }
                        """),
                planted("application", "PlantedInterruption", """
                        class PlantedInterruption {

                            boolean stopping() {
                                return Thread.currentThread().isInterrupted();
                            }
                        }
                        """),
                planted("application", "PlantedSequentialWork", """
                        import java.util.List;
                        import java.util.concurrent.CompletableFuture;
                        import java.util.concurrent.TimeUnit;

                        class PlantedSequentialWork {

                            long count(List<String> names) {
                                return names.stream().count() + TimeUnit.SECONDS.toMillis(1);
                            }

                            Object done() {
                                return CompletableFuture.completedFuture(1).thenApply(value -> value + 1);
                            }
                        }
                        """),
                planted("infrastructure", "PlantedAdapter", """
                        import org.springframework.beans.factory.annotation.Qualifier;
                        import org.springframework.scheduling.TaskScheduler;

                        import java.util.List;
                        import java.util.Timer;
                        import java.util.concurrent.CompletableFuture;
                        import java.util.concurrent.Executor;
                        import java.util.concurrent.ExecutorService;
                        import java.util.concurrent.Executors;
                        import java.util.concurrent.Semaphore;
                        import java.util.concurrent.TimeUnit;
                        import java.util.concurrent.locks.LockSupport;

                        class PlantedAdapter {

                            private final Semaphore slots = new Semaphore(8);
                            private final Executor rounds;
                            private final TaskScheduler scheduler;

                            PlantedAdapter(@Qualifier("applicationTaskExecutor") Executor rounds, TaskScheduler scheduler) {
                                this.rounds = rounds;
                                this.scheduler = scheduler;
                            }

                            void send(Runnable each, List<String> names) throws InterruptedException {
                                LockSupport.parkNanos(1L);
                                Thread.sleep(1);
                                TimeUnit.MILLISECONDS.sleep(1);
                                new Thread(each).start();
                                new Timer().cancel();
                                CompletableFuture.runAsync(each);
                                names.parallelStream().count();
                                try (ExecutorService sends = Executors.newVirtualThreadPerTaskExecutor()) {
                                    sends.submit(each);
                                }
                            }
                        }
                        """)));

        assertThat(reportedClasses(application_and_domain_leave_threads_to_adapters.evaluate(planted).getFailureReport().getDetails()))
                .containsExactlyInAnyOrder("PlantedExecutor", "PlantedExecutors", "PlantedPacing", "PlantedPause", "PlantedHandOff", "PlantedFactory",
                        "PlantedBuilderParameter", "PlantedTimer", "PlantedScheduler", "PlantedVirtualBuilder", "PlantedPlatformBuilder",
                        "PlantedVirtualStart", "PlantedThreadCreation", "PlantedThreadReference", "PlantedThreadSubclass", "PlantedThreadSleep",
                        "PlantedTimeUnitSleep", "PlantedParallelStream", "PlantedParallelOnStream", "PlantedRunAsync", "PlantedSupplyAsync",
                        "PlantedParallelSort", "PlantedForkedTask");
    }

    private static Map.Entry<String, String> planted(String layer, String simpleName, String body) {
        String packageName = "cz.novanadeje.app.planteda." + layer;
        return Map.entry(packageName + "." + simpleName, "package " + packageName + ";\n\n" + body);
    }

    private static Set<String> reportedClasses(List<String> details) {
        return details.stream()
                .map(PLANTED_ORIGIN::matcher)
                .filter(Matcher::find)
                .map(origin -> origin.group(1))
                .collect(Collectors.toSet());
    }

    private static DescribedPredicate<JavaAccess<?>> codeUnitOf(Class<?> owner, Predicate<String> named) {
        return DescribedPredicate.describe("a code unit of " + owner.getSimpleName(),
                access -> access.getTarget() instanceof CodeUnitAccessTarget target
                        && access.getTargetOwner().isAssignableTo(owner)
                        && named.test(target.getName()));
    }
}
