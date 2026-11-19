package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.event.EventListener;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ContextMapRulesTest {

    private static final String SHARED = "shared";
    private static final String SHARED_APPLICATION = "cz.novanadeje.app.shared.application";
    private static final String SHARED_EVENTS = SHARED_APPLICATION + ".event";
    private static final Pattern CONTEXT_OF_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.([a-z]+)(\\..*)?$");
    private static final Path OVERVIEW = Path.of("..", "docs", "system-overview.md");
    private static final String MAP_SECTION = "## Context map";

    private static final Set<String> CONTEXT_MAP = Set.of(
            "content -> donations: ReceiptSignatoryLookup",
            "content -> donors: AccountEmails",
            "content -> donors: AdministrationHolders",
            "content -> donors: AdministratorContacts",
            "content -> shared: AdminActionPerformed",
            "content -> shared: RowVersions",
            "donations -> content: FoundationPeople",
            "donations -> donors: AdministrationHolders",
            "donations -> donors: AdministratorContacts",
            "donations -> donors: FreshSecondFactor",
            "donations -> donors: SecondFactorRecoveryPaid",
            "donations -> donors: SenderAccountLearned",
            "donations -> operations: DonationsArrived",
            "donations -> operations: FinishedRestores",
            "donations -> operations: ImportOutageChanged",
            "donations -> operations: ReceiptSigningKeyWithdrawn",
            "donations -> operations: RecordSeals",
            "donations -> operations: YearlyReceiptsReady",
            "donations -> shared: AdminActionPerformed",
            "donations -> shared: AdminActionTrail",
            "donations -> shared: RowVersions",
            "donations -> shared: StoredDataChanged",
            "donors -> donations: DonorErased",
            "donors -> donations: DonorProfileChanged",
            "donors -> donations: DonorRegistered",
            "donors -> donations: SecondFactorRecoveryTargets",
            "donors -> operations: AdministrationRevoked",
            "donors -> operations: DeviceSignedOut",
            "donors -> operations: DonorErased",
            "donors -> shared: AdminActionPerformed",
            "donors -> shared: AdminActionTrail",
            "donors -> shared: DeviceSignedOut",
            "donors -> shared: DonorSessionsEnded",
            "donors -> shared: RowVersions",
            "operations -> donations: AlertRecipients",
            "operations -> donors: AccountEmails",
            "operations -> donors: AdministrationHolders",
            "operations -> donors: AdministratorContacts",
            "operations -> donors: FreshSecondFactor",
            "operations -> donors: SignedInDevices",
            "operations -> shared: AdminActionPerformed",
            "operations -> shared: AdminActionTrail",
            "operations -> shared: RowVersions",
            "shared -> donors: SessionLiveness",
            "shared -> operations: MailDeliveryFailed",
            "shared -> operations: MailDeliverySucceeded");

    private static final Map<String, String> TWO_WAY_PAIRS = Map.of(
            "content <-> donations",
            "the receipt signatory is one rule split across the two: donations reads the person through FoundationPeople, content asks "
                    + "ReceiptSignatoryLookup before it removes a person or changes their portrait or name (Khononov S1 waits for Jakub)",
            "donations <-> donors",
            "donors owns the account and donations the bank facts: donations copies the donor and asks for a fresh second factor and the "
                    + "administrators' addresses, donors learns the sender accounts, the recovery payments and where a recovery payment can go",
            "donations <-> operations",
            "operations holds the server's secrets, alerts and pushes, which donations uses and feeds; the backup alert reads its recipients "
                    + "from donations' report settings (AlertRecipients, Khononov S4)",
            "donors <-> operations",
            "operations keeps the push subscriptions and settings of the accounts donors owns: it deletes subscriptions on donors' lifecycle "
                    + "events and reads administrator addresses, signed-in devices and a fresh second factor");

    @ArchTest
    static void the_edges_between_contexts_are_the_declared_context_map(JavaClasses classes) {
        Set<String> derived = edgesOf(classes);

        assertThat(undeclared(derived, CONTEXT_MAP)).as("edges between contexts the context map does not declare (docs/system-overview.md, Context map)").isEmpty();
        assertThat(vanished(derived, CONTEXT_MAP)).as("edges the context map declares that the code no longer has").isEmpty();
    }

    @ArchTest
    static void every_pair_of_contexts_with_edges_both_ways_carries_its_reason(JavaClasses classes) {
        Set<String> pairs = twoWayPairsOf(edgesOf(classes));

        assertThat(pairsWithoutAReason(pairs, TWO_WAY_PAIRS)).as("pairs of contexts that depend on each other without a reason").isEmpty();
        assertThat(reasonsForPairsNoLongerTwoWay(pairs, TWO_WAY_PAIRS)).as("reasons for pairs that no longer depend on each other").isEmpty();
    }

    @ArchTest
    static void every_shared_event_and_port_has_its_row_in_the_context_map(JavaClasses classes) throws IOException {
        assertThat(sharedNamesWithoutARow(classes, Files.readString(OVERVIEW, StandardCharsets.UTF_8)))
                .as("shared events and ports without a row in docs/system-overview.md, Context map")
                .isEmpty();
    }

    @Test
    @DisplayName("Given planted contexts that meet through a shared event built by a constructor and by a factory, a shared port that a value beside it holds and a port only its adapter uses, when the edges are derived, then each publisher-to-listener and user-to-implementer edge between two contexts is found and nothing else")
    void should_derive_each_edge_between_contexts_when_read_given_planted_events_and_ports(@TempDir Path folder) throws IOException {
        JavaClasses planted = plantedContexts(folder);

        assertThat(edgesOf(planted)).containsExactlyInAnyOrder(
                "donors -> donations: PlantedGiftsChanged",
                "donors -> operations: PlantedGiftsChanged",
                "operations -> donations: PlantedGiftsChanged",
                "content -> donations: PlantedSignatoryLookup");
    }

    @Test
    @DisplayName("Given a declared map with an edge the code lacks and without one the code has, when the edges are compared, then the new edge and the vanished one are reported")
    void should_report_a_new_and_a_vanished_edge_when_compared_given_a_declared_map(@TempDir Path folder) throws IOException {
        Set<String> derived = edgesOf(plantedContexts(folder));
        Set<String> declared = Set.of("donors -> donations: PlantedGiftsChanged", "donors -> operations: PlantedGiftsChanged",
                "content -> donations: PlantedSignatoryLookup", "contact -> donors: PlantedGone");

        assertThat(undeclared(derived, declared)).containsExactly("operations -> donations: PlantedGiftsChanged");
        assertThat(vanished(derived, declared)).containsExactly("contact -> donors: PlantedGone");
    }

    @Test
    @DisplayName("Given edges both ways between two contexts, one way between others and both ways with shared, and reasons naming one two-way pair and a one-way pair, when the pairs are checked, then the two-way pair without a reason and the reason for the one-way pair are reported and shared is never a pair")
    void should_report_an_unreasoned_two_way_pair_and_a_stale_reason_when_checked_given_planted_edges() {
        Set<String> edges = Set.of("donors -> donations: A", "donations -> donors: B", "content -> donations: C", "operations -> donors: D",
                "donors -> operations: E", "shared -> donors: F", "donors -> shared: G");
        Map<String, String> reasons = Map.of("donations <-> donors", "planted: a partnership", "content <-> donations", "planted: split long ago");

        Set<String> pairs = twoWayPairsOf(edges);

        assertThat(pairs).containsExactly("donations <-> donors", "donors <-> operations");
        assertThat(pairsWithoutAReason(pairs, reasons)).containsExactly("donors <-> operations");
        assertThat(reasonsForPairsNoLongerTwoWay(pairs, reasons)).containsExactly("content <-> donations");
    }

    @Test
    @DisplayName("Given a context map section with rows for one planted event and the planted ports, and an event row outside the section, when the rows are checked, then the event without a row in the section is reported")
    void should_report_a_shared_name_without_its_row_when_checked_given_a_planted_overview(@TempDir Path folder) throws IOException {
        JavaClasses planted = plantedContexts(folder);
        String overview = """
                # System overview

                ## Context map

                | Event | Built in | Heard in | Edges |
                |---|---|---|---|
                | `PlantedGiftsChanged` | donors | donations | donors -> donations |

                | Port | Implemented in | Used by | Edges |
                |---|---|---|---|
                | `PlantedSignatoryLookup` (`people`) | donations | content | content -> donations |
                | `PlantedOnlyWrapped` (`people`) | donations | none | none |

                ## content

                | `PlantedUnheard` | content | none | none |
                """;

        assertThat(sharedNamesWithoutARow(planted, overview)).containsExactly("PlantedUnheard");
    }

    private static JavaClasses plantedContexts(Path folder) throws IOException {
        return PlantedClasses.compiled(folder, sources(
                "cz.novanadeje.app.shared.application.event.PlantedGiftsChanged", """
                        package cz.novanadeje.app.shared.application.event;
                        public record PlantedGiftsChanged(int count) {
                            public static PlantedGiftsChanged of(int count) { return new PlantedGiftsChanged(count); }
                        }
                        """,
                "cz.novanadeje.app.shared.application.event.PlantedUnheard", """
                        package cz.novanadeje.app.shared.application.event;
                        public record PlantedUnheard(int count) { }
                        """,
                "cz.novanadeje.app.shared.application.people.PlantedSignatoryLookup", """
                        package cz.novanadeje.app.shared.application.people;
                        public interface PlantedSignatoryLookup { boolean signs(java.util.UUID person); }
                        """,
                "cz.novanadeje.app.shared.application.people.PlantedLookupHolder", """
                        package cz.novanadeje.app.shared.application.people;
                        public record PlantedLookupHolder(PlantedSignatoryLookup lookup) { }
                        """,
                "cz.novanadeje.app.shared.application.people.PlantedOnlyWrapped", """
                        package cz.novanadeje.app.shared.application.people;
                        public interface PlantedOnlyWrapped { void run(); }
                        """,
                "cz.novanadeje.app.donors.application.PlantedPublisher", """
                        package cz.novanadeje.app.donors.application;
                        class PlantedPublisher {
                            Object announce() { return new cz.novanadeje.app.shared.application.event.PlantedGiftsChanged(1); }
                            Object unheard() { return new cz.novanadeje.app.shared.application.event.PlantedUnheard(1); }
                        }
                        """,
                "cz.novanadeje.app.operations.application.PlantedFactoryPublisher", """
                        package cz.novanadeje.app.operations.application;
                        class PlantedFactoryPublisher {
                            Object announce() { return cz.novanadeje.app.shared.application.event.PlantedGiftsChanged.of(2); }
                        }
                        """,
                "cz.novanadeje.app.donations.infrastructure.events.PlantedListener", """
                        package cz.novanadeje.app.donations.infrastructure.events;
                        class PlantedListener {
                            @org.springframework.transaction.event.TransactionalEventListener
                            void on(cz.novanadeje.app.shared.application.event.PlantedGiftsChanged changed) { }
                            @org.springframework.transaction.event.TransactionalEventListener
                            void signs(cz.novanadeje.app.shared.application.people.PlantedSignatoryLookup lookup) { }
                        }
                        """,
                "cz.novanadeje.app.operations.infrastructure.events.PlantedPushListener", """
                        package cz.novanadeje.app.operations.infrastructure.events;
                        class PlantedPushListener {
                            @org.springframework.context.event.EventListener
                            void on(cz.novanadeje.app.shared.application.event.PlantedGiftsChanged changed) { }
                        }
                        """,
                "cz.novanadeje.app.donations.infrastructure.persistence.PlantedSignatoryAdapter", """
                        package cz.novanadeje.app.donations.infrastructure.persistence;
                        class PlantedSignatoryAdapter implements cz.novanadeje.app.shared.application.people.PlantedSignatoryLookup,
                                cz.novanadeje.app.shared.application.people.PlantedOnlyWrapped {
                            private final cz.novanadeje.app.shared.application.people.PlantedOnlyWrapped inner = null;
                            public boolean signs(java.util.UUID person) { return false; }
                            public void run() { inner.run(); }
                        }
                        """,
                "cz.novanadeje.app.content.application.PlantedRemoval", """
                        package cz.novanadeje.app.content.application;
                        class PlantedRemoval {
                            private final cz.novanadeje.app.shared.application.people.PlantedSignatoryLookup signatory = null;
                            boolean mayRemove(java.util.UUID person) { return !signatory.signs(person); }
                        }
                        """));
    }

    private static Map<String, String> sources(String... namesAndSources) {
        return IntStream.range(0, namesAndSources.length / 2).boxed()
                .collect(Collectors.toMap(index -> namesAndSources[2 * index], index -> namesAndSources[2 * index + 1]));
    }

    static Set<String> edgesOf(JavaClasses classes) {
        return Stream.concat(eventEdgesOf(classes), portEdgesOf(classes)).collect(Collectors.toCollection(TreeSet::new));
    }

    private static List<String> undeclared(Set<String> derived, Set<String> declared) {
        return derived.stream().filter(edge -> !declared.contains(edge)).sorted().toList();
    }

    private static List<String> vanished(Set<String> derived, Set<String> declared) {
        return declared.stream().filter(edge -> !derived.contains(edge)).sorted().toList();
    }

    private static Set<String> twoWayPairsOf(Set<String> edges) {
        Set<String> directions = edges.stream().map(edge -> edge.substring(0, edge.indexOf(':'))).collect(Collectors.toSet());
        return directions.stream()
                .map(direction -> direction.split(" -> "))
                .filter(ends -> !ends[0].equals(SHARED) && !ends[1].equals(SHARED) && directions.contains(ends[1] + " -> " + ends[0]))
                .map(ends -> ends[0].compareTo(ends[1]) < 0 ? ends[0] + " <-> " + ends[1] : ends[1] + " <-> " + ends[0])
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private static List<String> pairsWithoutAReason(Set<String> pairs, Map<String, String> reasons) {
        return pairs.stream().filter(pair -> reasons.getOrDefault(pair, "").isBlank()).sorted().toList();
    }

    private static List<String> reasonsForPairsNoLongerTwoWay(Set<String> pairs, Map<String, String> reasons) {
        return reasons.keySet().stream().filter(pair -> !pairs.contains(pair)).sorted().toList();
    }

    private static List<String> sharedNamesWithoutARow(JavaClasses classes, String overview) {
        int start = overview.indexOf("\n" + MAP_SECTION + "\n");
        int end = start < 0 ? -1 : overview.indexOf("\n## ", start + MAP_SECTION.length() + 1);
        String section = start < 0 ? "" : overview.substring(start, end < 0 ? overview.length() : end);
        Set<String> firstCells = section.lines().filter(line -> line.startsWith("| "))
                .map(line -> line.split("\\|", -1)[1]).collect(Collectors.toSet());
        return Stream.concat(classes.stream().filter(ContextMapRulesTest::isSharedEvent),
                        classes.stream().filter(type -> isSharedPortCandidate(type) && !implementationsOf(classes, type).isEmpty()))
                .map(JavaClass::getSimpleName)
                .filter(name -> firstCells.stream().noneMatch(cell -> cell.contains("`" + name + "`")))
                .sorted().toList();
    }

    private static Stream<String> eventEdgesOf(JavaClasses classes) {
        return classes.stream().filter(ContextMapRulesTest::isSharedEvent).flatMap(event -> {
            Set<String> builders = buildersOf(event).collect(Collectors.toSet());
            Set<String> listeners = listenerContextsOf(classes, event).collect(Collectors.toSet());
            return builders.stream().flatMap(from -> listeners.stream().filter(to -> !to.equals(from)).map(to -> edge(from, to, event)));
        });
    }

    private static Stream<String> portEdgesOf(JavaClasses classes) {
        return classes.stream().filter(ContextMapRulesTest::isSharedPortCandidate).flatMap(port -> {
            Set<JavaClass> implementations = implementationsOf(classes, port);
            Set<String> implementers = implementations.stream().map(ContextMapRulesTest::contextOf).flatMap(Optional::stream).collect(Collectors.toSet());
            Set<String> users = port.getDirectDependenciesToSelf().stream().map(Dependency::getOriginClass)
                    .filter(origin -> !origin.getPackageName().startsWith(SHARED_APPLICATION))
                    .map(ContextMapRulesTest::contextOf).flatMap(Optional::stream).collect(Collectors.toSet());
            return users.stream().flatMap(from -> implementers.stream().filter(to -> !to.equals(from)).map(to -> edge(from, to, port)));
        });
    }

    private static boolean isSharedEvent(JavaClass type) {
        return type.isRecord() && type.isTopLevelClass() && type.getPackageName().equals(SHARED_EVENTS);
    }

    private static boolean isSharedPortCandidate(JavaClass type) {
        return type.isInterface() && type.isTopLevelClass() && type.getPackageName().startsWith(SHARED_APPLICATION + ".")
                && !type.getPackageName().equals(SHARED_EVENTS);
    }

    private static Set<JavaClass> implementationsOf(JavaClasses classes, JavaClass port) {
        return classes.stream()
                .filter(type -> !type.isInterface() && type.isAssignableTo(port.getName()) && type.getPackageName().contains(".infrastructure"))
                .collect(Collectors.toSet());
    }

    private static Stream<String> buildersOf(JavaClass event) {
        Stream<JavaClass> constructing = event.getConstructorCallsToSelf().stream().map(call -> call.getOriginOwner());
        Stream<JavaClass> factoring = event.getMethodCallsToSelf().stream()
                .filter(call -> call.getTarget().resolveMember()
                        .filter(method -> method.getModifiers().contains(JavaModifier.STATIC) && method.getRawReturnType().equals(event)).isPresent())
                .map(call -> call.getOriginOwner());
        return Stream.concat(constructing, factoring).filter(origin -> !partOf(origin, event))
                .map(ContextMapRulesTest::contextOf).flatMap(Optional::stream);
    }

    private static Stream<String> listenerContextsOf(JavaClasses classes, JavaClass event) {
        return classes.stream().flatMap(type -> type.getMethods().stream())
                .filter(method -> method.isMetaAnnotatedWith(EventListener.class) && method.getRawParameterTypes().contains(event))
                .map(JavaMethod::getOwner).map(ContextMapRulesTest::contextOf).flatMap(Optional::stream);
    }

    private static boolean partOf(JavaClass origin, JavaClass type) {
        Optional<JavaClass> current = Optional.of(origin);
        while (current.isPresent()) {
            if (current.get().equals(type)) {
                return true;
            }
            current = current.get().getEnclosingClass();
        }
        return false;
    }

    private static Optional<String> contextOf(JavaClass type) {
        Matcher matcher = CONTEXT_OF_PACKAGE.matcher(type.getPackageName());
        return matcher.matches() ? Optional.of(matcher.group(1)) : Optional.empty();
    }

    private static String edge(String from, String to, JavaClass through) {
        return from + " -> " + to + ": " + through.getSimpleName();
    }
}
