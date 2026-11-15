package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaFieldAccess.AccessType;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainMutatorRulesTest {

    private static final Pattern DOMAIN_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.[^.]+\\.domain(\\..*)?$");
    private static final Set<String> CONTAINER_CHANGES = Set.of("add", "addAll", "addFirst", "addLast", "remove", "removeAll", "removeIf",
            "removeFirst", "removeLast", "retainAll", "clear", "put", "putAll", "putIfAbsent", "replace", "replaceAll", "compute", "computeIfAbsent",
            "computeIfPresent", "merge", "set", "sort", "offer", "offerFirst", "offerLast", "poll", "pollFirst", "pollLast", "push", "pop");
    private static final Map<JavaMethod, Optional<String>> CHANGES_BY_METHOD = new ConcurrentHashMap<>();

    @ArchTest
    static final ArchRule controllers_change_no_domain_object = classes()
            .that().resideInAPackage("cz.novanadeje.app.*.interfaces..")
            .should(changeNoDomainObject())
            .because("backend.md, REST: an aggregate changes only inside a use case, where the application service holds its transaction, "
                    + "locks and events; a controller reads domain values and hands every change to an application service");

    private static ArchCondition<JavaClass> changeNoDomainObject() {
        return new ArchCondition<>("call or reference no mutator of a domain class and write no field of one (a mutator writes a field of a "
                + "domain class it reaches through its receiver, parameters and their fields, or changes a collection or map such a field holds "
                + "on the line that reads it, directly or through the domain methods it calls, an override's included, or is a transition, or "
                + "returns what a transition it reaches made, as its kind or a supertype in the domain; a transition is an instance method of an "
                + "entity returning its own kind or a subtype, alone or inside a generic type, and an entity a class or record, no enum, with a field id of a domain record named …Id or …Reference, "
                + "or one a domain interface named …Repository both takes and returns, an id record aside)") {
            @Override
            public void check(JavaClass controller, ConditionEvents events) {
                for (JavaAccess<?> access : controller.getAccessesFromSelf()) {
                    if (access instanceof JavaFieldAccess fieldAccess && fieldAccess.getAccessType() == AccessType.SET && isDomain(access.getTargetOwner())) {
                        events.add(SimpleConditionEvent.violated(controller, access.getOrigin().getFullName() + " writes the field "
                                + access.getTarget().getFullName() + " in " + access.getSourceCodeLocation()));
                    } else if (access.getTarget() instanceof CodeUnitAccessTarget target && isDomain(access.getTargetOwner())) {
                        changeMadeBy(target).ifPresent(change -> events.add(SimpleConditionEvent.violated(controller, access.getOrigin().getFullName()
                                + " calls the mutator " + target.getFullName() + ", which " + change + ", in " + access.getSourceCodeLocation())));
                    }
                }
            }
        };
    }

    private static Optional<String> changeMadeBy(CodeUnitAccessTarget target) {
        return target.resolveMember()
                .filter(JavaMethod.class::isInstance)
                .map(JavaMethod.class::cast)
                .flatMap(DomainMutatorRulesTest::changeMadeBy);
    }

    private static Optional<String> changeMadeBy(JavaMethod method) {
        return CHANGES_BY_METHOD.computeIfAbsent(method, DomainMutatorRulesTest::firstChangeMadeBy);
    }

    private static Optional<String> firstChangeMadeBy(JavaMethod start) {
        if (isTransition(start)) {
            return Optional.of("returns its own kind " + start.getReturnType().getName());
        }
        return firstWriteReachedFrom(start, stateReachableFrom(start));
    }

    private static boolean isTransition(JavaMethod method) {
        JavaClass owner = method.getOwner();
        return !method.getModifiers().contains(JavaModifier.STATIC) && isEntity(owner)
                && method.getReturnType().getAllInvolvedRawTypes().stream()
                .anyMatch(returned -> returned.isAssignableTo(owner.getName()));
    }

    private static boolean isEntity(JavaClass type) {
        return !type.isInterface() && !type.isEnum() && (holdsItsOwnId(type) || isStoredByARepository(type));
    }

    private static boolean holdsItsOwnId(JavaClass type) {
        return type.getAllFields().stream()
                .filter(field -> field.getName().equals("id"))
                .map(JavaField::getRawType)
                .anyMatch(DomainMutatorRulesTest::isIdRecord);
    }

    private static boolean isStoredByARepository(JavaClass type) {
        return !isIdRecord(type) && type.getDirectDependenciesToSelf().stream()
                .map(dependency -> dependency.getOriginClass())
                .filter(origin -> origin.isInterface() && isDomain(origin) && origin.getSimpleName().endsWith("Repository"))
                .anyMatch(repository -> repository.getMethods().stream().anyMatch(method -> method.getParameterTypes().stream()
                        .anyMatch(parameter -> parameter.getAllInvolvedRawTypes().contains(type)))
                        && repository.getMethods().stream().anyMatch(method -> method.getReturnType().getAllInvolvedRawTypes().contains(type)));
    }

    private static boolean isIdRecord(JavaClass type) {
        return type.isRecord() && isDomain(type) && (type.getSimpleName().endsWith("Id") || type.getSimpleName().endsWith("Reference"));
    }

    private static Optional<String> firstWriteReachedFrom(JavaMethod start, Set<JavaClass> reachable) {
        Set<JavaMethod> seen = new HashSet<>(Set.of(start));
        Deque<JavaMethod> pending = new ArrayDeque<>(List.of(start));
        while (!pending.isEmpty()) {
            JavaMethod method = pending.poll();
            String through = method.equals(start) ? "" : " through " + method.getFullName();
            Optional<String> change = fieldWriteIn(method, reachable)
                    .or(() -> heldContainerChangeIn(method, reachable))
                    .or(() -> transitionReturnedBy(start, method));
            if (change.isPresent()) {
                return change.map(found -> found + through);
            }
            Stream.concat(overridesOf(method), calledDomainMethodsOf(method))
                    .filter(seen::add)
                    .forEach(pending::add);
        }
        return Optional.empty();
    }

    private static Optional<String> transitionReturnedBy(JavaMethod start, JavaMethod reached) {
        return Optional.of(reached)
                .filter(method -> isTransition(method) && start.getReturnType().getAllInvolvedRawTypes().stream()
                        .anyMatch(returned -> isDomain(returned) && method.getOwner().isAssignableTo(returned.getName())))
                .map(transition -> "returns what the transition " + transition.getFullName() + " made");
    }

    private static Optional<String> fieldWriteIn(JavaMethod method, Set<JavaClass> reachable) {
        return method.getFieldAccesses().stream()
                .filter(access -> access.getAccessType() == AccessType.SET && isOfOneOf(access.getTargetOwner(), reachable))
                .findFirst()
                .map(write -> "writes " + write.getTarget().getFullName());
    }

    private static Optional<String> heldContainerChangeIn(JavaMethod method, Set<JavaClass> reachable) {
        Set<Integer> linesReadingAHeldContainer = method.getFieldAccesses().stream()
                .filter(access -> access.getAccessType() == AccessType.GET && isOfOneOf(access.getTargetOwner(), reachable)
                        && access.getTarget().resolveMember().map(field -> isContainer(field.getRawType())).orElse(false))
                .map(JavaAccess::getLineNumber)
                .collect(Collectors.toSet());
        return method.getAccessesFromSelf().stream()
                .filter(access -> access.getTarget() instanceof CodeUnitAccessTarget && CONTAINER_CHANGES.contains(access.getName())
                        && isContainer(access.getTargetOwner()) && linesReadingAHeldContainer.contains(access.getLineNumber()))
                .findFirst()
                .map(change -> "changes a collection or map it holds through " + change.getTarget().getFullName() + " on line " + change.getLineNumber());
    }

    private static boolean isContainer(JavaClass type) {
        return type.isAssignableTo(Collection.class) || type.isAssignableTo(Map.class) || type.isAssignableTo(Iterator.class);
    }

    private static boolean isOfOneOf(JavaClass owner, Set<JavaClass> reachable) {
        return reachable.stream().anyMatch(type -> type.isAssignableTo(owner.getName()) || owner.isAssignableTo(type.getName()));
    }

    private static Set<JavaClass> stateReachableFrom(JavaMethod start) {
        Deque<JavaClass> pending = new ArrayDeque<>(start.getParameterTypes().stream()
                .flatMap(parameter -> parameter.getAllInvolvedRawTypes().stream())
                .toList());
        if (!start.getModifiers().contains(JavaModifier.STATIC)) {
            pending.add(start.getOwner());
        }
        Set<JavaClass> reachable = new HashSet<>();
        while (!pending.isEmpty()) {
            JavaClass type = pending.poll();
            if (isDomain(type) && reachable.add(type)) {
                pending.addAll(type.getAllSubclasses());
                type.getAllFields().stream()
                        .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                        .flatMap(field -> field.getType().getAllInvolvedRawTypes().stream())
                        .forEach(pending::add);
            }
        }
        return reachable;
    }

    private static Stream<JavaMethod> calledDomainMethodsOf(JavaCodeUnit codeUnit) {
        return codeUnit.getAccessesFromSelf().stream()
                .filter(access -> access.getTarget() instanceof CodeUnitAccessTarget && isDomain(access.getTargetOwner()))
                .flatMap(access -> ((CodeUnitAccessTarget) access.getTarget()).resolveMember().stream())
                .filter(JavaMethod.class::isInstance)
                .map(JavaMethod.class::cast);
    }

    private static Stream<JavaMethod> overridesOf(JavaMethod method) {
        return method.getOwner().getAllSubclasses().stream()
                .flatMap(subclass -> subclass.getMethods().stream())
                .filter(candidate -> candidate.getName().equals(method.getName())
                        && candidate.getRawParameterTypes().equals(method.getRawParameterTypes()));
    }

    private static boolean isDomain(JavaClass type) {
        return DOMAIN_PACKAGE.matcher(type.getPackageName()).matches();
    }

    @Nested
    @DisplayName("Given today's domain")
    class GivenTodaysDomain {

        private static final JavaClasses SITE = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackagesOf(AppApplication.class);

        @Test
        @DisplayName("when the mutators are found, then a change by a field write, through a field's object, through a held set and map, an "
                + "entity's transition, a record aggregate's, an aggregate's without an id field, a domain function returning what a transition made and the known over-reports of a read that adds a "
                + "held list's element to a local on the same line are among them, and a copy, a filtered list and an accessor are not")
        void should_find_the_known_state_changes_when_found_given_todays_domain() {
            assertThat(Map.ofEntries(
                    Map.entry("cz.novanadeje.app.donors.domain.Donor.changeEmail", true),
                    Map.entry("cz.novanadeje.app.donors.domain.Donor.grantFirstAdministration", true),
                    Map.entry("cz.novanadeje.app.donations.domain.donor.DonorRecord.learnSenderAccountFrom", true),
                    Map.entry("cz.novanadeje.app.donations.domain.donor.DonorRecord.reconnectSenderAccount", true),
                    Map.entry("cz.novanadeje.app.donations.domain.donation.Donation.withoutPairingSources", true),
                    Map.entry("cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey.withdrawn", true),
                    Map.entry("cz.novanadeje.app.content.domain.about.AboutSection.show", true),
                    Map.entry("cz.novanadeje.app.operations.domain.alerts.OperationalAlert.resolvedAt", true),
                    Map.entry("cz.novanadeje.app.operations.domain.backup.BackupKey.words", true),
                    Map.entry("cz.novanadeje.app.operations.domain.backup.BackupKey.matches", true),
                    Map.entry("cz.novanadeje.app.content.domain.people.PeopleOrder.apply", true),
                    Map.entry("cz.novanadeje.app.donors.domain.Donor.sessionRoles", false),
                    Map.entry("cz.novanadeje.app.donations.domain.donation.DonationList.inYear", false),
                    Map.entry("cz.novanadeje.app.donors.domain.Donor.email", false)))
                    .allSatisfy((method, mutator) -> assertThat(changeMadeBy(methodNamed(method)))
                            .as(method).matches(change -> change.isPresent() == mutator));
        }

        private static JavaMethod methodNamed(String fullName) {
            String owner = fullName.substring(0, fullName.lastIndexOf('.'));
            String name = fullName.substring(fullName.lastIndexOf('.') + 1);
            List<JavaMethod> named = SITE.get(owner).getMethods().stream().filter(method -> method.getName().equals(name)).toList();
            assertThat(named).as(fullName + " names one method").hasSize(1);
            return named.getFirst();
        }
    }

    @Nested
    @DisplayName("Given planted controllers on planted domain classes")
    class GivenPlantedControllers {

        private static JavaClasses planted;

        @BeforeAll
        static void plant(@TempDir Path folder) throws IOException {
            planted = PlantedClasses.compiled(folder, Map.ofEntries(
                    planted("planteda.domain.Gift", """
                            public class Gift {
                                private String name;
                                public int count;
                                public Gift(String name) { this.name = name; }
                                public String name() { return name; }
                                public Gift withName(String other) { return new Gift(other); }
                                public void rename(String other) { this.name = other; }
                                public String renameTwice(String other) { rename(other); rename(other); return name; }
                                public void forget() { java.util.List.of(1).forEach(each -> this.name = null); }
                                public static void renameAll(java.util.List<Gift> gifts) { gifts.forEach(gift -> gift.rename("all")); }
                                public boolean named() { return name != null && withName(name).name() != null; }
                                private final java.util.Set<String> tags = new java.util.HashSet<>();
                                private final GiftTag tag = new GiftTag();
                                public void tagWith(String label) { tags.add(label); }
                                public java.util.Set<String> tagsWith(String label) {
                                    java.util.Set<String> copy = new java.util.HashSet<>(tags);
                                    copy.add(label);
                                    return copy;
                                }
                                public void retag() { tag.rename(); }
                            }
                            """),
                    planted("planteda.domain.GiftTag", "public class GiftTag { private String label; void rename() { label = \"renamed\"; } }"),
                    planted("planteda.domain.WishId", "public record WishId(java.util.UUID value) {}"),
                    planted("planteda.domain.Wish", "public record Wish(WishId id, String text) { public Wish granted() { return new Wish(id, \"granted\"); } }"),
                    planted("planteda.domain.WishView",
                            "public record WishView(WishId wish, String text) { public WishView retitled() { return new WishView(wish, \"retitled\"); } }"),
                    planted("planteda.domain.GiftNote", """
                            public final class GiftNote {
                                private final String id;
                                public GiftNote(String id) { this.id = id; }
                                public GiftNote copied() { return new GiftNote(id); }
                            }
                            """),
                    planted("planteda.domain.Banner", "public record Banner(boolean shown) { public Banner show() { return new Banner(true); } }"),
                    planted("planteda.domain.Label", "public record Label(String text) { public Label trimmed() { return new Label(text.trim()); } }"),
                    planted("planteda.domain.BannerRepository", "public interface BannerRepository { Banner load(); void save(Banner banner); boolean has(Label label); Notice latestNotice(); "
                            + "BannerId lastId(); boolean exists(BannerId id); GiftKind kind(); void choose(GiftKind kind); Stand stand(); void place(Stand stand); }"),
                    planted("planteda.domain.Stand", "public interface Stand { default Stand turned() { return this; } }"),
                    planted("planteda.domain.Notice", "public record Notice(String text) { public Notice dismissed() { return new Notice(\"\"); } }"),
                    planted("planteda.domain.BannerId",
                            "public record BannerId(java.util.UUID value) { public BannerId successor() { return new BannerId(java.util.UUID.randomUUID()); } }"),
                    planted("planteda.domain.Promise", "public interface Promise {}"),
                    planted("planteda.domain.Pledges", """
                            public final class Pledges {
                                public static java.util.List<Pledge> withdrawAll(java.util.List<Pledge> pledges) {
                                    return pledges.stream().map(Pledge::withdrawn).toList();
                                }
                                public static Promise promiseOf(Pledge pledge) { return pledge.withdrawn(); }
                                public static Object firstAmount(java.util.List<Pledge> pledges) { return pledges.getFirst().withdrawn().amount(); }
                                public static int total(java.util.List<Pledge> pledges) {
                                    return pledges.stream().map(Pledge::withdrawn).mapToInt(Pledge::amount).sum();
                                }
                            }
                            """),
                    planted("planteda.domain.Tray", "public record Tray(int size) { public Tray emptied() { return new Tray(0); } }"),
                    planted("planteda.domain.Shelving", "public interface Shelving { Tray tidy(Tray tray); }"),
                    planted("planteda.domain.Box", "public record Box(int size) { public Box emptied() { return new Box(0); } }"),
                    planted("planteda.application.BoxRepository", "public interface BoxRepository { cz.novanadeje.app.planteda.domain.Box load(); void save(cz.novanadeje.app.planteda.domain.Box box); }"),
                    planted("planteda.domain.Bin", "public record Bin(int size) { public Bin emptied() { return new Bin(0); } }"),
                    planted("planteda.domain.BinRepository", "public abstract class BinRepository { abstract Bin load(); abstract void save(Bin bin); }"),
                    planted("planteda.domain.GiftPolicy", """
                            public final class GiftPolicy {
                                public void close(Gift gift) { gift.rename("closed"); }
                                public boolean allows(Gift gift) { return gift.named(); }
                            }
                            """),
                    planted("planteda.domain.Item", "public abstract class Item { public abstract void touch(); public abstract void touchTag(); public abstract String label(); }"),
                    planted("planteda.domain.TouchedItem", """
                            public class TouchedItem extends Item {
                                private int touches;
                                private final GiftTag tag = new GiftTag();
                                public void touch() { touches++; }
                                public void touchTag() { tag.rename(); }
                                public String label() { return "item"; }
                            }
                            """),
                    planted("planteda.domain.Tagged", "public interface Tagged { void tag(); }"),
                    planted("planteda.domain.TaggedGift", "public class TaggedGift implements Tagged { private boolean tagged; public void tag() { tagged = true; } }"),
                    planted("planteda.domain.GiftValue", "public record GiftValue(String name) { public GiftValue renamed(String other) { return new GiftValue(other); } }"),
                    planted("planteda.domain.Pledge", """
                            public class Pledge implements Promise {
                                private final PledgeId id;
                                private final int amount;
                                public Pledge(int amount) { this.id = new PledgeId(java.util.UUID.randomUUID()); this.amount = amount; }
                                public int amount() { return amount; }
                                public Pledge withdrawn() { return new Pledge(0); }
                                public java.util.Optional<Pledge> renewed() { return java.util.Optional.of(new Pledge(amount)); }
                                public Promise asPromise() { return this; }
                                public Object snapshot() { return amount; }
                            }
                            """),
                    planted("planteda.domain.PledgeId", "public record PledgeId(java.util.UUID value) {}"),
                    planted("planteda.domain.PledgeList", """
                            public final class PledgeList {
                                private final java.util.List<Pledge> pledges;
                                public PledgeList(java.util.List<Pledge> pledges) { this.pledges = java.util.List.copyOf(pledges); }
                                public PledgeList large() { return new PledgeList(pledges.stream().filter(pledge -> pledge.amount() > 100).toList()); }
                            }
                            """),
                    planted("planteda.domain.GiftKind", "public enum GiftKind { ONE, TWO; public GiftKind next() { return TWO; } }"),
                    planted("planteda.domain.GiftCursor", """
                            public final class GiftCursor {
                                private final String text;
                                private int at;
                                public GiftCursor(String text) { this.text = text; }
                                public char next() { return text.charAt(at++); }
                            }
                            """),
                    planted("planteda.domain.GiftParser", """
                            public final class GiftParser {
                                public static Gift parse(String text) {
                                    GiftCursor cursor = new GiftCursor(text);
                                    Gift gift = new Gift(String.valueOf(cursor.next()));
                                    gift.rename(String.valueOf(cursor.next()));
                                    return gift;
                                }
                            }
                            """),
                    planted("planteda.domain.GiftNumbers", """
                            public final class GiftNumbers {
                                private static long last;
                                public static long next() { return ++last; }
                            }
                            """),
                    planted("planteda.interfaces.rest.GiftController", """
                            public class GiftController {
                                void renaming(cz.novanadeje.app.planteda.domain.Gift gift) { gift.rename("new"); }
                                void renamingTwice(cz.novanadeje.app.planteda.domain.Gift gift) { gift.renameTwice("new"); }
                                void forgetting(cz.novanadeje.app.planteda.domain.Gift gift) { gift.forget(); }
                                void renamingAll(java.util.List<cz.novanadeje.app.planteda.domain.Gift> gifts) { cz.novanadeje.app.planteda.domain.Gift.renameAll(gifts); }
                                void closing(cz.novanadeje.app.planteda.domain.Gift gift) { new cz.novanadeje.app.planteda.domain.GiftPolicy().close(gift); }
                                void touching(cz.novanadeje.app.planteda.domain.Item item) { item.touch(); }
                                void tagging(cz.novanadeje.app.planteda.domain.Tagged tagged) { tagged.tag(); }
                                java.util.function.Consumer<cz.novanadeje.app.planteda.domain.Item> toucher() { return cz.novanadeje.app.planteda.domain.Item::touch; }
                                void counting(cz.novanadeje.app.planteda.domain.Gift gift) { gift.count = 2; }
                                void labelling(cz.novanadeje.app.planteda.domain.Gift gift) { gift.tagWith("label"); }
                                void retagging(cz.novanadeje.app.planteda.domain.Gift gift) { gift.retag(); }
                                void touchingTag(cz.novanadeje.app.planteda.domain.Item item) { item.touchTag(); }
                                String granting(cz.novanadeje.app.planteda.domain.Wish wish) { return wish.granted().text(); }
                                boolean showing(cz.novanadeje.app.planteda.domain.Banner banner) { return banner.show().shown(); }
                                Object promising(cz.novanadeje.app.planteda.domain.Pledge pledge) { return cz.novanadeje.app.planteda.domain.Pledges.promiseOf(pledge); }
                                int withdrawingAll(java.util.List<cz.novanadeje.app.planteda.domain.Pledge> pledges) {
                                    return cz.novanadeje.app.planteda.domain.Pledges.withdrawAll(pledges).size();
                                }
                                int withdrawing(cz.novanadeje.app.planteda.domain.Pledge pledge) { return pledge.withdrawn().amount(); }
                                boolean renewing(cz.novanadeje.app.planteda.domain.Pledge pledge) { return pledge.renewed().isPresent(); }
                                char stepping(cz.novanadeje.app.planteda.domain.GiftCursor cursor) { return cursor.next(); }
                                String reading(cz.novanadeje.app.planteda.domain.Gift gift, cz.novanadeje.app.planteda.domain.Item item) {
                                    return gift.name() + gift.named() + gift.count + item.label()
                                            + new cz.novanadeje.app.planteda.domain.GiftPolicy().allows(gift)
                                            + new cz.novanadeje.app.planteda.domain.GiftValue("value").renamed("other").name()
                                            + new cz.novanadeje.app.planteda.domain.Pledge(1).amount()
                                            + gift.tagsWith("label")
                                            + new cz.novanadeje.app.planteda.domain.GiftNote("note").copied()
                                            + new cz.novanadeje.app.planteda.domain.Label(" label ").trimmed()
                                            + new cz.novanadeje.app.planteda.domain.Notice("notice").dismissed()
                                            + cz.novanadeje.app.planteda.domain.Pledges.total(java.util.List.of())
                                            + cz.novanadeje.app.planteda.domain.Pledges.firstAmount(java.util.List.of())
                                            + new cz.novanadeje.app.planteda.domain.Pledge(1).asPromise()
                                            + new cz.novanadeje.app.planteda.domain.Pledge(1).snapshot()
                                            + ((cz.novanadeje.app.planteda.domain.Stand) new cz.novanadeje.app.planteda.domain.Stand() { }).turned()
                                            + new cz.novanadeje.app.planteda.domain.Tray(1).emptied()
                                            + new cz.novanadeje.app.planteda.domain.Box(1).emptied()
                                            + new cz.novanadeje.app.planteda.domain.Bin(1).emptied()
                                            + new cz.novanadeje.app.planteda.domain.BannerId(java.util.UUID.randomUUID()).successor()
                                            + new cz.novanadeje.app.planteda.domain.WishView(new cz.novanadeje.app.planteda.domain.WishId(java.util.UUID.randomUUID()), "wish").retitled()
                                            + new cz.novanadeje.app.planteda.domain.PledgeList(java.util.List.of()).large()
                                            + cz.novanadeje.app.planteda.domain.GiftKind.ONE.next()
                                            + cz.novanadeje.app.planteda.domain.GiftParser.parse("ab").name()
                                            + cz.novanadeje.app.planteda.domain.GiftNumbers.next();
                                }
                            }
                            """)));
        }

        @Test
        @DisplayName("when the rule checks the controller, then each change of a domain object is reported: a direct write, one through another "
                + "method, in a lambda, through a static method on its parameter, through another domain class, through an override of an abstract "
                + "method and of an interface, by a method reference, by writing a field, in a held set, in the object of a field, of a subclass's "
                + "field, and a transition of an entity class or record (one with its own id, or one a repository stores and loads) returning its own kind, "
                + "alone and in an Optional, and a domain function returning what such a transition made, as its kind or a supertype")
        void should_report_every_change_when_checked_given_a_controller_that_changes_domain_objects() {
            assertThat(reportOf(controllers_change_no_domain_object))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.renaming(").contains("Gift.rename("))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.renamingTwice(").contains("through"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.forgetting(").contains("Gift.forget("))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.renamingAll(").contains("Gift.renameAll("))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.closing(").contains("GiftPolicy.close("))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.touching(").contains("TouchedItem.touch()"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.tagging(").contains("TaggedGift.tag()"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.toucher(").contains("Item.touch()"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.counting(").contains("writes the field").contains("Gift.count"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.withdrawing(").contains("returns its own kind"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.renewing(").contains("returns its own kind"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.stepping(").contains("GiftCursor.at"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.labelling(").contains("changes a collection or map"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.retagging(").contains("GiftTag.label"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.touchingTag(").contains("GiftTag.label"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.granting(").contains("returns its own kind"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.showing(").contains("returns its own kind"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.withdrawingAll(").contains("returns what the transition"))
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.promising(").contains("returns what the transition"));
        }

        @Test
        @DisplayName("when the rule checks the controller, then reading accessors, a public field and a domain service's check, a record's copy, "
                + "a copy of a held set changed on its own line, a record holding another's id, a class whose id is no id record, a value a "
                + "repository only takes, a view it only returns, an id it takes and returns, a value a domain "
                + "interface not named …Repository, an application …Repository or a domain class named …Repository takes and returns, domain "
                + "functions that use a transition only to compute a number or an Object, an entity's method returning a supertype or an Object, an enum's next value and an interface's default method returning its own kind, both stored by a repository, a filtered copy of a list that "
                + "is no entity, creating domain objects, a parser that changes only what it creates and a static counter is not reported")
        void should_report_no_read_when_checked_given_a_controller_that_reads_and_creates_domain_objects() {
            assertThat(reportOf(controllers_change_no_domain_object)).noneSatisfy(detail -> assertThat(detail).contains("GiftController.reading("));
        }

        private static Map.Entry<String, String> planted(String relativeName, String body) {
            String className = "cz.novanadeje.app." + relativeName;
            return Map.entry(className, "package " + className.substring(0, className.lastIndexOf('.')) + ";\n" + body);
        }

        private static List<String> reportOf(ArchRule rule) {
            return rule.evaluate(planted).getFailureReport().getDetails();
        }
    }
}
