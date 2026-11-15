package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaFieldAccess;
import com.tngtech.archunit.core.domain.JavaFieldAccess.AccessType;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
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
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class DomainMutatorRulesTest {

    private static final Pattern DOMAIN_PACKAGE = Pattern.compile("^cz\\.novanadeje\\.app\\.[^.]+\\.domain(\\..*)?$");
    private static final Map<String, Optional<String>> CHANGES_BY_METHOD = new ConcurrentHashMap<>();

    @ArchTest
    static final ArchRule controllers_change_no_domain_object = classes()
            .that().resideInAPackage("cz.novanadeje.app.*.interfaces..")
            .should(changeNoDomainObject())
            .because("backend.md, Domain: an aggregate changes only inside a use case, where the application service holds its transaction, "
                    + "locks and events; a controller reads domain values and hands every change to an application service");

    private static ArchCondition<JavaClass> changeNoDomainObject() {
        return new ArchCondition<>("call or reference no mutator of a domain class and write no field of one (a mutator writes a field "
                + "of a domain class it reaches through its receiver, parameters and their fields, directly or through the domain methods it calls, an override's "
                + "included, or is a transition: an instance method of an entity, a class that is no record or enum and holds a domain record "
                + "named …Id or …Reference, returning its own kind, alone or inside a generic type)") {
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
                .flatMap(method -> CHANGES_BY_METHOD.computeIfAbsent(method.getFullName(), name -> firstChangeMadeBy(method)));
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
                .anyMatch(returned -> isDomain(returned) && (owner.isAssignableTo(returned.getName()) || returned.isAssignableTo(owner.getName())));
    }

    private static boolean isEntity(JavaClass type) {
        return !type.isInterface() && !type.isRecord() && !type.isEnum() && type.getAllFields().stream()
                .filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
                .map(field -> field.getRawType())
                .anyMatch(fieldType -> fieldType.isRecord() && isDomain(fieldType) && (fieldType.getSimpleName().endsWith("Id") || fieldType.getSimpleName().endsWith("Reference")));
    }

    private static Optional<String> firstWriteReachedFrom(JavaMethod start, Set<JavaClass> reachable) {
        Set<String> seen = new HashSet<>(Set.of(start.getFullName()));
        Deque<JavaMethod> pending = new ArrayDeque<>(List.of(start));
        while (!pending.isEmpty()) {
            JavaMethod method = pending.poll();
            for (JavaFieldAccess write : method.getFieldAccesses()) {
                if (write.getAccessType() == AccessType.SET && writesAFieldOfOneOf(write, reachable)) {
                    String through = method.equals(start) ? "" : " through " + method.getFullName();
                    return Optional.of("writes " + write.getTarget().getFullName() + through);
                }
            }
            Stream.concat(overridesOf(method), calledDomainMethodsOf(method))
                    .filter(next -> seen.add(next.getFullName()))
                    .forEach(pending::add);
        }
        return Optional.empty();
    }

    private static boolean writesAFieldOfOneOf(JavaFieldAccess write, Set<JavaClass> reachable) {
        JavaClass owner = write.getTargetOwner();
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
                type.getAllRawSuperclasses().forEach(pending::add);
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
                            }
                            """),
                    planted("planteda.domain.GiftPolicy", """
                            public final class GiftPolicy {
                                public void close(Gift gift) { gift.rename("closed"); }
                                public boolean allows(Gift gift) { return gift.named(); }
                            }
                            """),
                    planted("planteda.domain.Item", "public abstract class Item { public abstract void touch(); public abstract String label(); }"),
                    planted("planteda.domain.TouchedItem", """
                            public class TouchedItem extends Item {
                                private int touches;
                                public void touch() { touches++; }
                                public String label() { return "item"; }
                            }
                            """),
                    planted("planteda.domain.Tagged", "public interface Tagged { void tag(); }"),
                    planted("planteda.domain.TaggedGift", "public class TaggedGift implements Tagged { private boolean tagged; public void tag() { tagged = true; } }"),
                    planted("planteda.domain.GiftValue", "public record GiftValue(String name) { public GiftValue renamed(String other) { return new GiftValue(other); } }"),
                    planted("planteda.domain.Pledge", """
                            public class Pledge {
                                private final PledgeId id;
                                private final int amount;
                                public Pledge(int amount) { this.id = new PledgeId(java.util.UUID.randomUUID()); this.amount = amount; }
                                public int amount() { return amount; }
                                public Pledge withdrawn() { return new Pledge(0); }
                                public java.util.Optional<Pledge> renewed() { return java.util.Optional.of(new Pledge(amount)); }
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
                                int withdrawing(cz.novanadeje.app.planteda.domain.Pledge pledge) { return pledge.withdrawn().amount(); }
                                boolean renewing(cz.novanadeje.app.planteda.domain.Pledge pledge) { return pledge.renewed().isPresent(); }
                                char stepping(cz.novanadeje.app.planteda.domain.GiftCursor cursor) { return cursor.next(); }
                                String reading(cz.novanadeje.app.planteda.domain.Gift gift, cz.novanadeje.app.planteda.domain.Item item) {
                                    return gift.name() + gift.named() + gift.count + item.label()
                                            + new cz.novanadeje.app.planteda.domain.GiftPolicy().allows(gift)
                                            + new cz.novanadeje.app.planteda.domain.GiftValue("value").renamed("other").name()
                                            + new cz.novanadeje.app.planteda.domain.Pledge(1).amount()
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
                + "method and of an interface, by a method reference, by writing a field, and a transition of an entity (a class holding a domain …Id or …Reference) "
                + "returning its own kind, alone and in an Optional")
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
                    .anySatisfy(detail -> assertThat(detail).contains("GiftController.stepping(").contains("GiftCursor.at"));
        }

        @Test
        @DisplayName("when the rule checks the controller, then reading accessors, a public field and a domain service's check, a record's copy, "
                + "an enum's next value, a filtered copy of a list that is no entity, creating domain objects, a parser that changes only what it creates and a static counter is not reported")
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
