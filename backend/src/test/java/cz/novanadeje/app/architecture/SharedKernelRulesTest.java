package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
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

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class SharedKernelRulesTest {

    private static final String KERNEL_VALUES_PACKAGE = "cz.novanadeje.app.shared.domain";
    private static final String SHARED = "shared";
    private static final String SHARED_INFRASTRUCTURE = "shared infrastructure";
    private static final Pattern SHARED_ADAPTERS = Pattern.compile("^cz\\.novanadeje\\.app\\.shared\\.(infrastructure|interfaces)(\\..*)?$");
    private static final Pattern CONTEXT_OF_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.([^.]+)(\\..*)?$");
    private static final int CONTEXTS_THAT_SHARE_A_VALUE = 2;
    private static final Map<String, String> VALUES_OF_ONE_CONTEXT_BY_DESIGN = Map.of();
    private static final DescribedPredicate<JavaClass> KERNEL_VALUES = DescribedPredicate.describe(
            "are the shared kernel's value objects (records and enums of " + KERNEL_VALUES_PACKAGE + ")",
            type -> type.getPackageName().equals(KERNEL_VALUES_PACKAGE) && type.isTopLevelClass() && (type.isRecord() || type.isEnum()));

    @ArchTest
    static final ArchRule kernel_values_are_used_by_at_least_two_contexts = kernelValuesSharedByContexts(VALUES_OF_ONE_CONTEXT_BY_DESIGN);

    @ArchTest
    static void every_listed_value_is_a_kernel_value(JavaClasses classes) {
        assertThat(listingsThatNameNoKernelValue(classes, VALUES_OF_ONE_CONTEXT_BY_DESIGN))
                .as("the reviewed list names only records and enums of " + KERNEL_VALUES_PACKAGE + ", so an entry left behind by a rename or a move is found")
                .isEmpty();
    }

    @Test
    @DisplayName("Given a reviewed list naming a kernel value and a value that is gone, when the listings are checked, then only the gone one is reported")
    void should_report_a_listing_that_names_no_kernel_value_when_checked_given_a_gone_value(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.shared.domain.ListedValue", """
                        package cz.novanadeje.app.shared.domain;
                        public record ListedValue(String text) {}
                        """));

        assertThat(listingsThatNameNoKernelValue(planted, Map.of(
                "cz.novanadeje.app.shared.domain.ListedValue", "planted: serves one context by design",
                "cz.novanadeje.app.shared.domain.Gone", "planted: renamed long ago")))
                .containsExactly("cz.novanadeje.app.shared.domain.Gone");
    }

    @Test
    @DisplayName("Given planted kernel values used by one context, by two contexts, by one context and the kernel, by one context and shared infrastructure, and listed ones used by one and by two contexts, when the rule checks them, then the unlisted value of one context and the listed value of two are reported")
    void should_report_a_value_of_one_context_and_a_stale_listing_when_checked_given_planted_values(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.shared.domain.LonelyValue", """
                        package cz.novanadeje.app.shared.domain;
                        public record LonelyValue(String text) {}
                        """,
                "cz.novanadeje.app.shared.domain.PairedValue", """
                        package cz.novanadeje.app.shared.domain;
                        public enum PairedValue { ONE }
                        """,
                "cz.novanadeje.app.shared.domain.KernelHolder", """
                        package cz.novanadeje.app.shared.domain;
                        public record KernelHolder(LonelyValue lonely) {}
                        """,
                "cz.novanadeje.app.shared.domain.ListedValue", """
                        package cz.novanadeje.app.shared.domain;
                        public record ListedValue(String text) {}
                        """,
                "cz.novanadeje.app.shared.domain.OutgrownValue", """
                        package cz.novanadeje.app.shared.domain;
                        public record OutgrownValue(String text) {}
                        """,
                "cz.novanadeje.app.shared.domain.AdapterContract", """
                        package cz.novanadeje.app.shared.domain;
                        public record AdapterContract(String text) {}
                        """,
                "cz.novanadeje.app.shared.infrastructure.live.PlantedHub", """
                        package cz.novanadeje.app.shared.infrastructure.live;
                        import cz.novanadeje.app.shared.domain.AdapterContract;
                        class PlantedHub { AdapterContract last; }
                        """,
                "cz.novanadeje.app.planteda.domain.Gift", """
                        package cz.novanadeje.app.planteda.domain;
                        import cz.novanadeje.app.shared.domain.*;
                        public record Gift(LonelyValue lonely, PairedValue paired, KernelHolder holder, ListedValue listed, OutgrownValue outgrown, AdapterContract contract) {}
                        """,
                "cz.novanadeje.app.plantedb.application.GiftView", """
                        package cz.novanadeje.app.plantedb.application;
                        import cz.novanadeje.app.shared.domain.*;
                        public record GiftView(PairedValue paired, KernelHolder holder, OutgrownValue outgrown) {}
                        """));
        ArchRule rule = kernelValuesSharedByContexts(Map.of(
                "cz.novanadeje.app.shared.domain.ListedValue", "planted: serves one context by design",
                "cz.novanadeje.app.shared.domain.OutgrownValue", "planted: served one context once"));

        assertThat(rule.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("shared.domain.LonelyValue is used by fewer than two parties: [planteda]"))
                .anySatisfy(detail -> assertThat(detail).contains("shared.domain.OutgrownValue is listed as serving one context but is used by [planteda, plantedb]"));
    }

    private static ArchRule kernelValuesSharedByContexts(Map<String, String> valuesOfOneContextByDesign) {
        return classes()
                .that(KERNEL_VALUES)
                .should(beSharedByContextsUnlessListed(valuesOfOneContextByDesign))
                .because("backend.md, Contexts and layers: shared holds only stable concepts that contexts share, so a value one context uses "
                        + "alone lives in that context; a value one context shares with shared infrastructure (its contract with the live stream, "
                        + "the mail watch) counts as shared, and the reviewed list names why any other serves one by design");
    }

    private static ArchCondition<JavaClass> beSharedByContextsUnlessListed(Map<String, String> valuesOfOneContextByDesign) {
        return new ArchCondition<>("be used by at least two parties (a context each, shared infrastructure one), or by fewer when the reviewed list names the reason") {
            @Override
            public void check(JavaClass value, ConditionEvents events) {
                Set<String> contexts = partiesUsing(value);
                boolean shared = contexts.size() >= CONTEXTS_THAT_SHARE_A_VALUE;
                if (valuesOfOneContextByDesign.containsKey(value.getName())) {
                    events.add(new SimpleConditionEvent(value, !shared,
                            "%s is listed as serving one context but is used by %s".formatted(value.getName(), contexts)));
                } else {
                    events.add(new SimpleConditionEvent(value, shared,
                            "%s is used by fewer than two parties: %s".formatted(value.getName(), contexts)));
                }
            }
        };
    }

    private static Set<String> partiesUsing(JavaClass value) {
        Set<String> parties = new TreeSet<>();
        for (Dependency dependency : value.getDirectDependenciesToSelf()) {
            partyOf(dependency.getOriginClass()).ifPresent(parties::add);
        }
        return parties;
    }

    private static Optional<String> partyOf(JavaClass type) {
        if (SHARED_ADAPTERS.matcher(type.getPackageName()).matches()) {
            return Optional.of(SHARED_INFRASTRUCTURE);
        }
        return contextOf(type).filter(context -> !context.equals(SHARED));
    }

    private static Set<String> listingsThatNameNoKernelValue(JavaClasses classes, Map<String, String> listed) {
        Set<String> gone = new TreeSet<>();
        for (String name : listed.keySet()) {
            if (!classes.contain(name) || !KERNEL_VALUES.test(classes.get(name))) {
                gone.add(name);
            }
        }
        return gone;
    }

    private static Optional<String> contextOf(JavaClass type) {
        Matcher context = CONTEXT_OF_PACKAGE.matcher(type.getPackageName());
        return context.matches() ? Optional.of(context.group(1)) : Optional.empty();
    }
}
