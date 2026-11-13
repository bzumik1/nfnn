package cz.novanadeje.app.architecture;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.PropertyResolver;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.codeUnits;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class RuntimeConventionRulesTest {

    private static final String RESTARTER = "cz.novanadeje.app.operations.infrastructure.settings.ExitingApplicationRestarter";
    private static final String VALUE_ANNOTATION = "org.springframework.beans.factory.annotation.Value";

    private static final DescribedPredicate<JavaAccess<?>> A_RANDOM_UUID = callsOrReferences(
            "a random or name-based UUID", UUID.class, Set.of("randomUUID", "nameUUIDFromBytes")::contains);

    private static final DescribedPredicate<JavaAccess<?>> AN_ENVIRONMENT_READ = callsOrReferences(
            "", System.class, Set.of("getenv", "getProperty", "getProperties", "setProperty", "clearProperty")::contains)
            .or(callsOrReferences("", Integer.class, "getInteger"::equals))
            .or(callsOrReferences("", Long.class, "getLong"::equals))
            .or(callsOrReferences("", Boolean.class, "getBoolean"::equals))
            .as("a read or change of the process environment or the system properties");

    private static final DescribedPredicate<JavaAccess<?>> A_DEFAULT_HTTP_CLIENT = callsOrReferences(
            "an HTTP client with the default settings (no connect timeout, redirects as the JDK decides)", HttpClient.class, "newHttpClient"::equals);

    private static final DescribedPredicate<JavaAccess<?>> A_CACHE_FROM_A_SPEC = callsOrReferences(
            "a cache built from a specification, whose bound the code does not show", Caffeine.class, "from"::equals);

    private static final DescribedPredicate<JavaAccess<?>> AN_EXIT = callsOrReferences("", System.class, "exit"::equals)
            .or(callsOrReferences("", Runtime.class, Set.of("exit", "halt")::contains))
            .as("an exit of the JVM");

    private static final DescribedPredicate<JavaAccess<?>> A_NEW_CACHE = callsOrReferences("", Caffeine.class, "newBuilder"::equals).as("a new cache");
    private static final DescribedPredicate<JavaAccess<?>> A_CACHE_BOUND = callsOrReferences("", Caffeine.class, Set.of("maximumSize", "maximumWeight")::contains)
            .as("a maximum size or weight");
    private static final DescribedPredicate<JavaAccess<?>> A_NEW_HTTP_CLIENT = callsOrReferences("", HttpClient.class, "newBuilder"::equals).as("a new HTTP client");
    private static final DescribedPredicate<JavaAccess<?>> A_CONNECT_TIMEOUT = callsOrReferences("", HttpClient.Builder.class, "connectTimeout"::equals)
            .as("a connect timeout");
    private static final DescribedPredicate<JavaAccess<?>> NO_REDIRECT = DescribedPredicate.describe("HttpClient.Redirect.NEVER",
            access -> access instanceof JavaFieldAccess field && field.getTargetOwner().isEquivalentTo(HttpClient.Redirect.class)
                    && field.getTarget().getName().equals(HttpClient.Redirect.NEVER.name()));
    private static final DescribedPredicate<JavaAccess<?>> A_NEW_HTTP_REQUEST = callsOrReferences("", HttpRequest.class, "newBuilder"::equals).as("a new HTTP request");
    private static final DescribedPredicate<JavaAccess<?>> A_REQUEST_TIMEOUT = callsOrReferences("", HttpRequest.Builder.class, "timeout"::equals)
            .as("a request timeout");

    @ArchTest
    static final ArchRule ids_come_from_uuid_v7 = noClasses()
            .that().doNotHaveFullyQualifiedName(UuidV7.class.getName())
            .should().accessTargetWhere(A_RANDOM_UUID)
            .because("backend.md, Domain: ids are records over UUID, generated by UuidV7, so they sort by time and an index stays compact");

    @ArchTest
    static final ArchRule configuration_comes_from_bound_records = noClasses()
            .should().accessTargetWhere(AN_ENVIRONMENT_READ)
            .orShould().dependOnClassesThat().haveFullyQualifiedName(VALUE_ANNOTATION)
            .because("backend.md, Configuration: @ConfigurationProperties records validated at startup, so a missing or wrong value stops the start, never a request");

    @ArchTest
    static final ArchRule the_spring_environment_is_read_only_by_adapters = noClasses()
            .that().resideOutsideOfPackage("..infrastructure..")
            .should().dependOnClassesThat().areAssignableTo(PropertyResolver.class)
            .because("backend.md, Configuration: a value reaches the application as a bound, validated record, so only an adapter reads the environment");

    @ArchTest
    static final ArchRule http_clients_are_never_built_with_the_defaults = noClasses()
            .should().accessTargetWhere(A_DEFAULT_HTTP_CLIENT)
            .because("reliability.md: every external call has a timeout, which the builder's connectTimeout sets and the default client lacks");

    @ArchTest
    static final ArchRule caches_show_their_bound = noClasses()
            .should().accessTargetWhere(A_CACHE_FROM_A_SPEC)
            .because("reliability.md: resources are bounded, and the bound rule reads it from the builder's maximumSize or maximumWeight");

    @ArchTest
    static final ArchRule only_the_restarter_exits_the_jvm = noClasses()
            .that().doNotHaveFullyQualifiedName(RESTARTER)
            .should().accessTargetWhere(AN_EXIT)
            .because("an exit skips the graceful shutdown that drains requests and awaits a running import (reliability.md); the restarter exits through SpringApplication.exit");

    @ArchTest
    static final ArchRule every_cache_is_bounded = codeUnits()
            .should(alsoMake(A_NEW_CACHE, A_CACHE_BOUND))
            .because("reliability.md: resources are bounded, so no cache grows with what visitors send");

    @ArchTest
    static final ArchRule every_http_client_has_a_connect_timeout_and_follows_no_redirect = codeUnits()
            .should(alsoMake(A_NEW_HTTP_CLIENT, A_CONNECT_TIMEOUT))
            .andShould(alsoMake(A_NEW_HTTP_CLIENT, NO_REDIRECT))
            .because("reliability.md and security.md, Outbound requests: every external call has a timeout, and redirects are none or re-checked");

    @ArchTest
    static final ArchRule every_http_request_has_a_timeout = codeUnits()
            .should(alsoMake(A_NEW_HTTP_REQUEST, A_REQUEST_TIMEOUT))
            .because("reliability.md: every external call has a timeout, so a silent server never holds the scheduler thread");

    @Test
    @DisplayName("Given planted classes that make a random UUID, read the environment or a system property, take @Value or the Spring environment outside an adapter, exit, build an unbounded cache, a cache from a specification, a default client and clients without timeouts or with redirects, when the rules check them, then each is reported and the bounded, timed ones are not")
    void should_report_every_runtime_hazard_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.application.PlantedSettingsReader", """
                package cz.novanadeje.app.planteda.application;

                import org.springframework.core.env.Environment;

                class PlantedSettingsReader {

                    String token(Environment environment) {
                        return environment.getProperty("app.anything");
                    }
                }
                """, "cz.novanadeje.app.planteda.infrastructure.PlantedRuntime", """
                package cz.novanadeje.app.planteda.infrastructure;

                import com.github.benmanes.caffeine.cache.Cache;
                import com.github.benmanes.caffeine.cache.Caffeine;
                import java.net.URI;
                import java.net.http.HttpClient;
                import java.net.http.HttpRequest;
                import java.time.Duration;
                import java.util.UUID;
                import java.util.function.Supplier;
                import org.springframework.beans.factory.annotation.Value;

                class PlantedRuntime {

                    @Value("${app.anything}")
                    String injected;

                    UUID randomId() {
                        return UUID.randomUUID();
                    }

                    Supplier<UUID> randomIds() {
                        return UUID::randomUUID;
                    }

                    String environment() {
                        return System.getenv("FIO_TOKEN");
                    }

                    Integer systemProperty() {
                        return Integer.getInteger("app.anything");
                    }

                    HttpClient defaults() {
                        return HttpClient.newHttpClient();
                    }

                    Cache<String, String> fromSpec() {
                        return Caffeine.from("maximumSize=10").build();
                    }

                    void exit() {
                        System.exit(1);
                    }

                    Cache<String, String> unbounded() {
                        return Caffeine.newBuilder().build();
                    }

                    Cache<String, String> bounded() {
                        return Caffeine.newBuilder().maximumSize(10).build();
                    }

                    HttpClient followsRedirects() {
                        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NORMAL).build();
                    }

                    HttpClient waitsForever() {
                        return HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
                    }

                    HttpClient reviewed() {
                        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
                    }

                    HttpRequest untimed(URI address) {
                        return HttpRequest.newBuilder(address).GET().build();
                    }

                    HttpRequest timed(URI address) {
                        return HttpRequest.newBuilder(address).timeout(Duration.ofSeconds(5)).GET().build();
                    }
                }
                """));

        assertThat(ids_come_from_uuid_v7.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2).anySatisfy(detail -> assertThat(detail).contains("randomId(")).anySatisfy(detail -> assertThat(detail).contains("randomIds"));
        assertThat(configuration_comes_from_bound_records.evaluate(planted).getFailureReport().getDetails())
                .anySatisfy(detail -> assertThat(detail).contains("environment"))
                .anySatisfy(detail -> assertThat(detail).contains("systemProperty"))
                .anySatisfy(detail -> assertThat(detail).contains("injected"));
        assertThat(only_the_restarter_exits_the_jvm.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("exit()"));
        assertThat(every_cache_is_bounded.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("unbounded"));
        assertThat(every_http_client_has_a_connect_timeout_and_follows_no_redirect.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2).anySatisfy(detail -> assertThat(detail).contains("followsRedirects")).anySatisfy(detail -> assertThat(detail).contains("waitsForever"));
        assertThat(every_http_request_has_a_timeout.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("untimed"));
        assertThat(http_clients_are_never_built_with_the_defaults.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("defaults"));
        assertThat(caches_show_their_bound.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("fromSpec"));
        assertThat(the_spring_environment_is_read_only_by_adapters.evaluate(planted).getFailureReport().getDetails())
                .isNotEmpty().allSatisfy(detail -> assertThat(detail).contains("PlantedSettingsReader"));
    }

    private static ArchCondition<JavaCodeUnit> alsoMake(DescribedPredicate<JavaAccess<?>> trigger, DescribedPredicate<JavaAccess<?>> required) {
        return new ArchCondition<>("make " + required.getDescription() + " wherever they make " + trigger.getDescription()) {
            @Override
            public void check(JavaCodeUnit codeUnit, ConditionEvents events) {
                boolean triggered = codeUnit.getAccessesFromSelf().stream().anyMatch(trigger);
                boolean satisfied = codeUnit.getAccessesFromSelf().stream().anyMatch(required);
                if (triggered && !satisfied) {
                    events.add(SimpleConditionEvent.violated(codeUnit, codeUnit.getFullName() + " makes " + trigger.getDescription()
                            + " without " + required.getDescription()));
                }
            }
        };
    }
}
