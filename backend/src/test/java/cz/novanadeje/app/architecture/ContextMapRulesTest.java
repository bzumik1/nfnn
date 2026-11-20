package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.PayloadApplicationEvent;
import org.springframework.context.event.EventListener;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EventObject;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
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
    private static final Pattern NAME_IN_A_CELL = Pattern.compile("`([A-Z][A-Za-z]+)`");
    private static final Path OVERVIEW = Path.of("..", "docs", "system-overview.md");
    private static final String MAP_SECTION = "## Context map";
    private static final String NO_EDGES = "none";
    private static final String ARROW = " → ";
    private static final String BOTH_WAYS = " ↔ ";

    private static final List<Class<?>> HEARING_EVERY_EVENT = List.of(EventObject.class, ApplicationEvent.class, PayloadApplicationEvent.class);

    private static final Map<String, String> KERNEL_INTERFACES = Map.of(
            "StoredRecord", "a marker of the application records a stale write answers with, implemented by records of every context, never by an adapter",
            "WritePrecondition", "a sealed value of the If-Match a write names, implemented only by its own records in shared/application/version");

    @ArchTest
    static void the_edges_between_contexts_are_the_context_map_of_the_overview(JavaClasses classes) {
        assertThat(edgeDifferences(classes, overview()))
                .as("differences between the edges the code has and the rows of docs/system-overview.md, Context map")
                .isEmpty();
    }

    @ArchTest
    static void every_pair_of_contexts_with_edges_both_ways_carries_its_reason_in_the_overview(JavaClasses classes) {
        assertThat(pairDifferences(edgesOf(classes), overview()))
                .as("differences between the pairs of contexts that depend on each other and the reasons in docs/system-overview.md, Context map")
                .isEmpty();
    }

    @ArchTest
    static void every_shared_interface_is_a_port_or_a_listed_kernel_value(JavaClasses classes) {
        assertThat(kernelInterfaceDifferences(classes, KERNEL_INTERFACES))
                .as("shared interfaces that are neither a port with an implementation in infrastructure nor a listed kernel value")
                .isEmpty();
    }

    @Test
    @DisplayName("Given planted contexts that meet through a shared event built by a constructor, a factory, a constructor reference and an optional factory, heard by its parameter, by a payload, by the listener annotation's classes and by a listener of every application event, and through ports implemented in one context, in two, and used only by their adapters, when the edges are derived, then each publisher-to-listener and user-to-implementer edge between two contexts is found and nothing else")
    void should_derive_each_edge_between_contexts_when_read_given_planted_events_and_ports(@TempDir Path folder) throws IOException {
        assertThat(edgesOf(plantedContexts(folder))).containsExactlyInAnyOrder(
                "donors -> donations: PlantedGiftsChanged",
                "donors -> operations: PlantedGiftsChanged",
                "donors -> content: PlantedGiftsChanged",
                "donors -> contact: PlantedGiftsChanged",
                "donors -> contact: PlantedUnlisted",
                "operations -> contact: PlantedGiftsChanged",
                "operations -> donations: PlantedGiftsChanged",
                "operations -> content: PlantedGiftsChanged",
                "contact -> donations: PlantedGiftsChanged",
                "contact -> operations: PlantedGiftsChanged",
                "contact -> content: PlantedGiftsChanged",
                "content -> donations: PlantedSignatoryLookup",
                "contact -> donations: PlantedAlertRecipients",
                "contact -> operations: PlantedAlertRecipients");
    }

    @Test
    @DisplayName("Given an overview whose rows miss an edge, declare one the code lacks, miss a shared event and name one that does not exist, when the edges are compared, then each difference is reported, and an overview without the section reports every name")
    void should_report_each_edge_difference_when_compared_given_a_planted_overview(@TempDir Path folder) throws IOException {
        JavaClasses planted = plantedContexts(folder);
        String overview = """
                # System overview

                ## Context map

                | Event | Built in | Heard in | Edges |
                |---|---|---|---|
                | `PlantedGiftsChanged` | donors, operations, contact | donations, operations, content | contact, donors → content, donors → contact, operations → contact, donors → donations, donors → operations, operations → donations, operations → content, contact → donations, contact → operations, contact → donors |
                | `PlantedRemoved` | content | none | none |

                | Port | Implemented in | Used by | Edges |
                |---|---|---|---|
                | `PlantedSignatoryLookup` (`people`) | donations | content | content → donations |
                | `PlantedAlertRecipients` (`alert`), `PlantedOnlyWrapped` (`people`) | donations, operations | contact | contact → donations, contact → operations |

                ## content

                | `PlantedUnlisted` | content | none | none |
                """;

        assertThat(edgeDifferences(planted, overview)).containsExactlyInAnyOrder(
                "PlantedGiftsChanged: the overview declares contact -> donors, which the code does not have",
                "PlantedOnlyWrapped: the overview declares contact -> donations, which the code does not have",
                "PlantedOnlyWrapped: the overview declares contact -> operations, which the code does not have",
                "PlantedRemoved: the overview has a row, but no shared event or port has this name",
                "PlantedUnlisted: no row in the overview's context map");
        assertThat(edgeDifferences(planted, overview.replace(", donors → contact, operations → contact", "")))
                .contains("PlantedGiftsChanged: the code has donors -> contact, which the overview does not declare");
        assertThat(edgeDifferences(planted, "# System overview\n\n## content\n"))
                .contains("PlantedGiftsChanged: no row in the overview's context map", "PlantedSignatoryLookup: no row in the overview's context map");
    }

    @Test
    @DisplayName("Given edges both ways between two contexts, one way between others and both ways with shared, and an overview whose pairs table names one two-way pair, a one-way pair and one without its reason, when the pairs are compared, then the pair without a row, the row of the one-way pair and the blank reason are reported and shared is never a pair")
    void should_report_each_pair_difference_when_compared_given_planted_edges() {
        Set<String> edges = Set.of("donors -> donations: A", "donations -> donors: B", "content -> donations: C", "operations -> donors: D",
                "donors -> operations: E", "shared -> donors: F", "donors -> shared: G", "content -> contact: H", "contact -> content: I");
        String overview = """
                # System overview

                ## Context map

                | Pair | Why both ways |
                |---|---|
                | donors ↔ donations | planted: a partnership, its ends in either order |
                | content ↔ donations | planted: split long ago |
                | contact ↔ content |  |

                ## content
                """;

        assertThat(pairDifferences(edges, overview)).containsExactlyInAnyOrder(
                "donors ↔ operations: the contexts depend on each other, but the overview's pairs table gives no reason",
                "content ↔ donations: the overview's pairs table has a reason, but the contexts no longer depend on each other",
                "contact ↔ content: the overview's pairs table gives no reason");
    }

    @Test
    @DisplayName("Given a shared interface with an implementation in infrastructure, one without, a listed kernel value and a listing that is gone or became a port, when the shared interfaces are checked, then the unlisted one without an implementation and both stale listings are reported")
    void should_report_an_unlisted_interface_and_stale_listings_when_checked_given_planted_interfaces(@TempDir Path folder) throws IOException {
        JavaClasses planted = plantedContexts(folder);

        assertThat(kernelInterfaceDifferences(planted, Map.of(
                "PlantedMarker", "planted: a marker every context implements",
                "PlantedSignatoryLookup", "planted: listed although donations implements it",
                "PlantedGone", "planted: removed long ago")))
                .containsExactlyInAnyOrder(
                        "PlantedUnimplemented: a shared interface with no implementation in infrastructure that the kernel list does not name",
                        "PlantedSignatoryLookup: listed as a kernel value, but it is a port now",
                        "PlantedGone: listed as a kernel value, but no shared interface has this name");
    }

    private static JavaClasses plantedContexts(Path folder) throws IOException {
        return PlantedClasses.compiled(folder, sources(
                "cz.novanadeje.app.shared.application.event.PlantedGiftsChanged", """
                        package cz.novanadeje.app.shared.application.event;
                        public record PlantedGiftsChanged(int count) {
                            public static PlantedGiftsChanged of(int count) { return new PlantedGiftsChanged(count); }
                            public static java.util.Optional<PlantedGiftsChanged> ofAny(int count) {
                                return count == 0 ? java.util.Optional.empty() : java.util.Optional.of(new PlantedGiftsChanged(count));
                            }
                        }
                        """,
                "cz.novanadeje.app.shared.application.event.PlantedUnlisted", """
                        package cz.novanadeje.app.shared.application.event;
                        public record PlantedUnlisted(int count) { }
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
                "cz.novanadeje.app.shared.application.people.PlantedUnimplemented", """
                        package cz.novanadeje.app.shared.application.people;
                        public interface PlantedUnimplemented { void run(); }
                        """,
                "cz.novanadeje.app.shared.application.version.PlantedMarker", """
                        package cz.novanadeje.app.shared.application.version;
                        public interface PlantedMarker { }
                        """,
                "cz.novanadeje.app.shared.application.alert.PlantedAlertRecipients", """
                        package cz.novanadeje.app.shared.application.alert;
                        public interface PlantedAlertRecipients { java.util.List<String> recipients(); }
                        """,
                "cz.novanadeje.app.donors.application.PlantedPublisher", """
                        package cz.novanadeje.app.donors.application;
                        class PlantedPublisher {
                            Object announce() { return new cz.novanadeje.app.shared.application.event.PlantedGiftsChanged(1); }
                            Object unheard() { return new cz.novanadeje.app.shared.application.event.PlantedUnlisted(1); }
                        }
                        """,
                "cz.novanadeje.app.operations.application.PlantedFactoryPublisher", """
                        package cz.novanadeje.app.operations.application;
                        class PlantedFactoryPublisher {
                            Object announce() { return cz.novanadeje.app.shared.application.event.PlantedGiftsChanged.ofAny(2); }
                            Object announceOne() { return cz.novanadeje.app.shared.application.event.PlantedGiftsChanged.of(1); }
                        }
                        """,
                "cz.novanadeje.app.contact.application.PlantedReferencePublisher", """
                        package cz.novanadeje.app.contact.application;
                        class PlantedReferencePublisher {
                            java.util.List<Object> announce(java.util.List<Integer> counts) {
                                return counts.stream().<Object>map(cz.novanadeje.app.shared.application.event.PlantedGiftsChanged::new).toList();
                            }
                            java.util.List<String> recipients(cz.novanadeje.app.shared.application.alert.PlantedAlertRecipients alerts) {
                                return alerts.recipients();
                            }
                        }
                        """,
                "cz.novanadeje.app.donations.infrastructure.events.PlantedListener", """
                        package cz.novanadeje.app.donations.infrastructure.events;
                        class PlantedListener {
                            @org.springframework.transaction.event.TransactionalEventListener
                            void on(cz.novanadeje.app.shared.application.event.PlantedGiftsChanged changed) { }
                        }
                        """,
                "cz.novanadeje.app.operations.infrastructure.events.PlantedPushListener", """
                        package cz.novanadeje.app.operations.infrastructure.events;
                        class PlantedPushListener {
                            @org.springframework.context.event.EventListener
                            void on(org.springframework.context.PayloadApplicationEvent<cz.novanadeje.app.shared.application.event.PlantedGiftsChanged> changed) { }
                        }
                        """,
                "cz.novanadeje.app.content.infrastructure.events.PlantedNamedListener", """
                        package cz.novanadeje.app.content.infrastructure.events;
                        class PlantedNamedListener {
                            @org.springframework.transaction.event.TransactionalEventListener(classes = cz.novanadeje.app.shared.application.event.PlantedGiftsChanged.class)
                            void refresh() { }
                        }
                        """,
                "cz.novanadeje.app.contact.infrastructure.events.PlantedEveryEventListener", """
                        package cz.novanadeje.app.contact.infrastructure.events;
                        class PlantedEveryEventListener {
                            @org.springframework.context.event.EventListener
                            void any(org.springframework.context.ApplicationEvent event) { }
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
                "cz.novanadeje.app.donations.infrastructure.report.PlantedReportRecipients", """
                        package cz.novanadeje.app.donations.infrastructure.report;
                        class PlantedReportRecipients implements cz.novanadeje.app.shared.application.alert.PlantedAlertRecipients {
                            public java.util.List<String> recipients() { return java.util.List.of(); }
                        }
                        """,
                "cz.novanadeje.app.operations.infrastructure.alerts.PlantedOperatorRecipients", """
                        package cz.novanadeje.app.operations.infrastructure.alerts;
                        class PlantedOperatorRecipients implements cz.novanadeje.app.shared.application.alert.PlantedAlertRecipients {
                            private final cz.novanadeje.app.shared.application.alert.PlantedAlertRecipients fallback = null;
                            public java.util.List<String> recipients() { return fallback.recipients(); }
                        }
                        """,
                "cz.novanadeje.app.content.application.PlantedRemoval", """
                        package cz.novanadeje.app.content.application;
                        class PlantedRemoval {
                            private final cz.novanadeje.app.shared.application.people.PlantedSignatoryLookup signatory = null;
                            boolean mayRemove(java.util.UUID person) { return !signatory.signs(person); }
                        }
                        """,
                "cz.novanadeje.app.content.application.PlantedMarkedRecord", """
                        package cz.novanadeje.app.content.application;
                        record PlantedMarkedRecord(int version) implements cz.novanadeje.app.shared.application.version.PlantedMarker { }
                        """));
    }

    private static Map<String, String> sources(String... namesAndSources) {
        return IntStream.range(0, namesAndSources.length / 2).boxed()
                .collect(Collectors.toMap(index -> namesAndSources[2 * index], index -> namesAndSources[2 * index + 1]));
    }

    private static String overview() {
        try {
            return Files.readString(OVERVIEW, StandardCharsets.UTF_8);
        } catch (IOException unreadable) {
            throw new UncheckedIOException("docs/system-overview.md cannot be read", unreadable);
        }
    }

    static Set<String> edgesOf(JavaClasses classes) {
        return Stream.concat(eventEdgesOf(classes), portEdgesOf(classes)).collect(Collectors.toCollection(TreeSet::new));
    }

    private static List<String> edgeDifferences(JavaClasses classes, String overview) {
        Map<String, Set<String>> declared = declaredEdgesByName(overview);
        Map<String, Set<String>> derived = new TreeMap<>();
        sharedNames(classes).forEach(name -> derived.put(name, new TreeSet<>()));
        edgesOf(classes).forEach(edge -> derived.get(edge.substring(edge.indexOf(": ") + 2)).add(edge.substring(0, edge.indexOf(": "))));
        List<String> differences = new ArrayList<>();
        derived.forEach((name, edges) -> {
            if (!declared.containsKey(name)) {
                differences.add(name + ": no row in the overview's context map");
                return;
            }
            edges.stream().filter(edge -> !declared.get(name).contains(edge))
                    .forEach(edge -> differences.add(name + ": the code has " + edge + ", which the overview does not declare"));
            declared.get(name).stream().filter(edge -> !edges.contains(edge))
                    .forEach(edge -> differences.add(name + ": the overview declares " + edge + ", which the code does not have"));
        });
        declared.keySet().stream().filter(name -> !derived.containsKey(name))
                .forEach(name -> differences.add(name + ": the overview has a row, but no shared event or port has this name"));
        return differences;
    }

    private static List<String> pairDifferences(Set<String> edges, String overview) {
        Set<String> pairs = twoWayPairsOf(edges);
        Map<String, String> reasons = declaredPairReasons(overview);
        List<String> differences = new ArrayList<>();
        pairs.stream().filter(pair -> !reasons.containsKey(pair))
                .forEach(pair -> differences.add(pair + ": the contexts depend on each other, but the overview's pairs table gives no reason"));
        reasons.forEach((pair, reason) -> {
            if (!pairs.contains(pair)) {
                differences.add(pair + ": the overview's pairs table has a reason, but the contexts no longer depend on each other");
            } else if (reason.isBlank()) {
                differences.add(pair + ": the overview's pairs table gives no reason");
            }
        });
        return differences;
    }

    private static List<String> kernelInterfaceDifferences(JavaClasses classes, Map<String, String> kernelInterfaces) {
        Set<String> interfaces = classes.stream().filter(ContextMapRulesTest::isSharedPortCandidate).map(JavaClass::getSimpleName).collect(Collectors.toSet());
        Set<String> ports = sharedPorts(classes).map(JavaClass::getSimpleName).collect(Collectors.toSet());
        List<String> differences = new ArrayList<>();
        interfaces.stream().filter(name -> !ports.contains(name) && !kernelInterfaces.containsKey(name)).sorted()
                .forEach(name -> differences.add(name + ": a shared interface with no implementation in infrastructure that the kernel list does not name"));
        kernelInterfaces.keySet().stream().sorted().forEach(name -> {
            if (ports.contains(name)) {
                differences.add(name + ": listed as a kernel value, but it is a port now");
            } else if (!interfaces.contains(name)) {
                differences.add(name + ": listed as a kernel value, but no shared interface has this name");
            }
        });
        return differences;
    }

    private static Set<String> twoWayPairsOf(Set<String> edges) {
        Set<String> directions = edges.stream().map(edge -> edge.substring(0, edge.indexOf(':'))).collect(Collectors.toSet());
        return directions.stream()
                .map(direction -> direction.split(" -> "))
                .filter(ends -> !ends[0].equals(SHARED) && !ends[1].equals(SHARED) && directions.contains(ends[1] + " -> " + ends[0]))
                .map(ends -> ends[0].compareTo(ends[1]) < 0 ? ends[0] + BOTH_WAYS + ends[1] : ends[1] + BOTH_WAYS + ends[0])
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private static Map<String, Set<String>> declaredEdgesByName(String overview) {
        Map<String, Set<String>> declared = new TreeMap<>();
        for (List<String> cells : rowsOf(overview)) {
            List<String> names = NAME_IN_A_CELL.matcher(cells.getFirst()).results().map(match -> match.group(1)).toList();
            if (names.isEmpty() || cells.size() < 2) {
                continue;
            }
            Set<String> edges = edgesInACell(cells.getLast());
            names.forEach(name -> declared.put(name, edges));
        }
        return declared;
    }

    private static Map<String, String> declaredPairReasons(String overview) {
        Map<String, String> reasons = new LinkedHashMap<>();
        rowsOf(overview).stream().filter(cells -> cells.size() == 2 && cells.getFirst().split(BOTH_WAYS.strip()).length == 2)
                .forEach(cells -> {
                    String[] ends = cells.getFirst().split(BOTH_WAYS.strip());
                    String first = ends[0].strip();
                    String second = ends[1].strip();
                    reasons.put(first.compareTo(second) < 0 ? first + BOTH_WAYS + second : second + BOTH_WAYS + first, cells.getLast());
                });
        return reasons;
    }

    private static Set<String> edgesInACell(String cell) {
        Set<String> edges = new TreeSet<>();
        if (cell.equals(NO_EDGES)) {
            return edges;
        }
        List<String> sources = new ArrayList<>();
        for (String part : cell.split(", ")) {
            if (part.contains(ARROW)) {
                String[] ends = part.split(ARROW);
                sources.add(ends[0].strip());
                sources.forEach(source -> edges.add(source + " -> " + ends[1].strip()));
                sources.clear();
            } else {
                sources.add(part.strip());
            }
        }
        return edges;
    }

    private static List<List<String>> rowsOf(String overview) {
        int start = overview.indexOf("\n" + MAP_SECTION + "\n");
        if (start < 0) {
            return List.of();
        }
        int end = overview.indexOf("\n## ", start + MAP_SECTION.length() + 1);
        return overview.substring(start, end < 0 ? overview.length() : end).lines()
                .filter(line -> line.startsWith("| ") && !line.startsWith("|---") && line.lastIndexOf('|') > 0)
                .map(line -> Arrays.stream(line.substring(1, line.lastIndexOf('|')).split("\\|", -1)).map(String::strip).toList())
                .toList();
    }

    private static Stream<String> sharedNames(JavaClasses classes) {
        return Stream.concat(classes.stream().filter(ContextMapRulesTest::isSharedEvent), sharedPorts(classes)).map(JavaClass::getSimpleName);
    }

    private static Stream<JavaClass> sharedPorts(JavaClasses classes) {
        return classes.stream().filter(type -> isSharedPortCandidate(type) && !implementationsOf(classes, type).isEmpty());
    }

    private static Stream<String> eventEdgesOf(JavaClasses classes) {
        List<JavaMethod> listeners = classes.stream().flatMap(type -> type.getMethods().stream())
                .filter(method -> method.isMetaAnnotatedWith(EventListener.class)).toList();
        return classes.stream().filter(ContextMapRulesTest::isSharedEvent).flatMap(event -> {
            Set<String> builders = buildersOf(event).collect(Collectors.toSet());
            Set<String> hearers = listeners.stream().filter(listener -> hears(listener, event)).map(JavaMethod::getOwner)
                    .map(ContextMapRulesTest::contextOf).flatMap(Optional::stream).collect(Collectors.toSet());
            return builders.stream().flatMap(from -> hearers.stream().filter(to -> !to.equals(from)).map(to -> edge(from, to, event)));
        });
    }

    private static Stream<String> portEdgesOf(JavaClasses classes) {
        return sharedPorts(classes).flatMap(port -> {
            Set<JavaClass> implementations = implementationsOf(classes, port);
            Set<String> implementers = implementations.stream().map(ContextMapRulesTest::contextOf).flatMap(Optional::stream).collect(Collectors.toSet());
            Set<String> users = port.getDirectDependenciesToSelf().stream().map(Dependency::getOriginClass)
                    .filter(origin -> !origin.getPackageName().startsWith(SHARED_APPLICATION))
                    .filter(origin -> implementations.stream().noneMatch(implementation -> partOf(origin, implementation)))
                    .map(ContextMapRulesTest::contextOf).flatMap(Optional::stream).collect(Collectors.toSet());
            return users.stream().flatMap(from -> implementers.stream().filter(to -> !to.equals(from)).map(to -> edge(from, to, port)));
        });
    }

    private static boolean hears(JavaMethod listener, JavaClass event) {
        Set<JavaClass> named = eventsNamedByListenerAnnotations(listener.getAnnotations(), new HashSet<>()).collect(Collectors.toSet());
        Stream<JavaClass> heard = named.isEmpty() ? eventsTakenAsParameters(listener) : named.stream();
        return heard.anyMatch(type -> event.isAssignableTo(type.getName()) || HEARING_EVERY_EVENT.stream().anyMatch(type::isEquivalentTo));
    }

    private static Stream<JavaClass> eventsNamedByListenerAnnotations(Set<? extends JavaAnnotation<?>> annotations, Set<String> visited) {
        return annotations.stream()
                .filter(annotation -> annotation.getRawType().isEquivalentTo(EventListener.class)
                        || annotation.getRawType().isMetaAnnotatedWith(EventListener.class))
                .flatMap(annotation -> Stream.concat(
                        annotation.getProperties().values().stream().flatMap(ContextMapRulesTest::classesOf),
                        visited.add(annotation.getRawType().getName())
                                ? eventsNamedByListenerAnnotations(annotation.getRawType().getAnnotations(), visited)
                                : Stream.empty()));
    }

    private static Stream<JavaClass> classesOf(Object value) {
        if (value instanceof JavaClass[] classes) {
            return Arrays.stream(classes);
        }
        return value instanceof JavaClass single ? Stream.of(single) : Stream.empty();
    }

    private static Stream<JavaClass> eventsTakenAsParameters(JavaMethod method) {
        return method.getParameters().stream()
                .map(JavaParameter::getType)
                .flatMap(type -> type.toErasure().isEquivalentTo(PayloadApplicationEvent.class) ? payloadsOf(type) : Stream.of(type.toErasure()));
    }

    private static Stream<JavaClass> payloadsOf(JavaType payloadEvent) {
        Set<JavaClass> payloads = payloadEvent.getAllInvolvedRawTypes().stream()
                .filter(involved -> !involved.getName().equals(payloadEvent.toErasure().getName())).collect(Collectors.toSet());
        return payloads.isEmpty() ? Stream.of(payloadEvent.toErasure()) : payloads.stream();
    }

    private static boolean isSharedEvent(JavaClass type) {
        return type.isRecord() && type.isTopLevelClass() && type.getPackageName().equals(SHARED_EVENTS);
    }

    private static boolean isSharedPortCandidate(JavaClass type) {
        return type.isInterface() && !type.isAnnotation() && !type.getSimpleName().equals("package-info") && type.isTopLevelClass() && type.getPackageName().startsWith(SHARED_APPLICATION + ".")
                && !type.getPackageName().equals(SHARED_EVENTS);
    }

    private static Set<JavaClass> implementationsOf(JavaClasses classes, JavaClass port) {
        return classes.stream()
                .filter(type -> !type.isInterface() && type.isAssignableTo(port.getName()) && type.getPackageName().contains(".infrastructure"))
                .collect(Collectors.toSet());
    }

    private static Stream<String> buildersOf(JavaClass event) {
        Stream<JavaAccess<?>> constructions = Stream.concat(event.getConstructorCallsToSelf().stream(), event.getConstructorReferencesToSelf().stream());
        Stream<JavaAccess<?>> factories = Stream.concat(
                event.getMethodCallsToSelf().stream().filter(call -> call.getTarget().resolveMember().filter(method -> isFactoryOf(method, event)).isPresent()),
                event.getMethodReferencesToSelf().stream().filter(reference -> reference.getTarget().resolveMember().filter(method -> isFactoryOf(method, event)).isPresent()));
        return Stream.concat(constructions, factories).map(JavaAccess::getOriginOwner).filter(origin -> !partOf(origin, event))
                .map(ContextMapRulesTest::contextOf).flatMap(Optional::stream);
    }

    private static boolean isFactoryOf(JavaMethod method, JavaClass event) {
        return method.getModifiers().contains(JavaModifier.STATIC) && method.getReturnType().getAllInvolvedRawTypes().contains(event);
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
