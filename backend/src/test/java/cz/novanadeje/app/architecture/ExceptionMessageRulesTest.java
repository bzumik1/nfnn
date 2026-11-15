package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ExceptionMessageRulesTest {

    @ArchTest
    static final ArchRule throwables_compute_no_message_when_it_is_read = noMethods()
            .that().haveNameMatching("getMessage|getLocalizedMessage|toString")
            .and().haveRawParameterTypes(new Class<?>[0])
            .should().beDeclaredInClassesThat().areAssignableTo(Throwable.class)
            .because("backend.md, Logging: the message a throwable's own method builds when it is read never passes a constructor, "
                    + "so the scan of ExceptionMessageValues would not see an open value in it");

    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");

    private static final Pattern PACKAGE = Pattern.compile("^package ([a-z.]+);", Pattern.MULTILINE);
    private static final Pattern TYPE = Pattern.compile("^(?:public )?(?:abstract |final )?(?:class|record|interface) ([A-Za-z]+)", Pattern.MULTILINE);

    private static final String PLANTED_FAILURE = """
            package planted.domain;

            public class PlantedFailure extends RuntimeException {

                public PlantedFailure(String message) {
                    super(message);
                }

                public PlantedFailure(String code, String slug) {
                    super("No article " + slug);
                }
            }
            """;

    private static final String PLANTED_KIND = """
            package planted.domain;

            public abstract class PlantedKind extends RuntimeException {

                private final String code;

                protected PlantedKind(String code, String message) {
                    super(message);
                    this.code = code;
                }

                public String code() {
                    return code;
                }
            }
            """;

    private static final String PLANTED_REFUSAL = """
            package planted.domain;

            public class PlantedRefusal extends PlantedKind {

                public PlantedRefusal(String message) {
                    super("planted/refused", message);
                }
            }
            """;

    private static final String PLANTED_CONFLICT = """
            package planted.domain;

            public class PlantedConflict extends PlantedKind {

                public PlantedConflict(String code, String message) {
                    super(code, message);
                }
            }
            """;

    private static final String PLANTED_DELEGATING = """
            package planted.domain;

            public class PlantedDelegating extends RuntimeException {

                public PlantedDelegating(String message) {
                    this(message, 0);
                }

                private PlantedDelegating(String message, int attempt) {
                    super(message);
                }
            }
            """;

    private static final String PLANTED_FLEXIBLE_FAILURE = """
            package planted.domain;

            import java.util.Objects;

            public class PlantedFlexibleFailure extends RuntimeException {

                public PlantedFlexibleFailure(String message) {
                    Objects.requireNonNull(message);
                    super(message);
                }
            }
            """;

    private static final String PLANTED_REASSIGNING_FAILURE = """
            package planted.domain;

            public class PlantedReassigningFailure extends RuntimeException {

                public PlantedReassigningFailure(String message, String raw) {
                    message = raw;
                    super(message);
                }
            }
            """;

    private static final String PLANTED_ADAPTER_FAILURE = """
            package planted.infrastructure;

            import planted.domain.PlantedFailure;

            class PlantedAdapterFailure extends PlantedFailure {

                PlantedAdapterFailure(String message) {
                    super(message);
                }
            }
            """;

    private static final String PLANTED_SECRET = """
            package planted.domain;

            import java.security.SecureRandom;
            import java.util.Base64;

            public record PlantedSecret(String value) {

                private static final SecureRandom RANDOM = new SecureRandom();

                public static PlantedSecret generate() {
                    byte[] bytes = new byte[32];
                    RANDOM.nextBytes(bytes);
                    return new PlantedSecret(Base64.getUrlEncoder().encodeToString(bytes));
                }
            }
            """;

    private static final String PLANTED_AMBIENT = """
            package planted.domain;

            public final class PlantedAmbient {

                private static String current = "none";

                private PlantedAmbient() {
                }

                public static void set(String value) {
                    current = value;
                }

                public static String current() {
                    return current;
                }
            }
            """;

    private static final String PLANTED_DESCRIPTIONS = """
            package planted.domain;

            public class PlantedDescription {

                public String describe() {
                    return "fixed";
                }
            }

            final class PlantedLeakingDescription extends PlantedDescription {

                private final String raw;

                PlantedLeakingDescription(String raw, int ignored) {
                    this.raw = raw;
                }

                @Override
                public String describe() {
                    return raw;
                }
            }
            """;

    private static final String PLANTED_CODE = """
            package planted.domain;

            public final class PlantedCode {

                private final int length;

                private PlantedCode(int length) {
                    this.length = length;
                }

                public static PlantedCode from(String raw) {
                    if (raw.isBlank()) {
                        throw new IllegalArgumentException("Bad code " + raw);
                    }
                    return new PlantedCode(raw.length());
                }

                static PlantedCode fixed() {
                    return from("fixed");
                }
            }
            """;

    private static final String PLANTED_TOKEN = """
            package planted.domain;

            public class PlantedToken {

                public PlantedToken(String raw) {
                    if (raw.isBlank()) {
                        throw new IllegalArgumentException("Bad token " + raw);
                    }
                }

                static PlantedToken fixed() {
                    return new PlantedToken("fixed");
                }
            }
            """;

    private static final String PLANTED_HOLDERS = """
            package planted.application;

            import java.util.UUID;

            class PlantedBase {

                protected final String text;

                PlantedBase(String text, int ignored) {
                    this.text = text;
                }
            }

            final class PlantedDerived extends PlantedBase {

                PlantedDerived(String text, int ignored) {
                    super(text, ignored);
                }
            }

            class PlantedHandle {
            }

            record PlantedCycleA(PlantedCycleB next, String text) {
            }

            record PlantedCycleB(PlantedCycleA previous) {
            }

            interface PlantedNamedThing {

                default String name() {
                    return "fixed";
                }
            }

            record PlantedNamedRecord(String name) implements PlantedNamedThing {
            }

            class PlantedCounted {

                private final int count;

                PlantedCounted(int count, int ignored) {
                    this.count = count;
                }
            }

            final class PlantedNamedCount extends PlantedCounted {

                private final String name;

                PlantedNamedCount(String name, int ignored) {
                    super(1, ignored);
                    this.name = name;
                }

                @Override
                public String toString() {
                    return name;
                }
            }

            record PlantedLabelled(String label) {

                PlantedLabelled(UUID id) {
                    this(id.toString());
                }
            }
            """;

    private static final String PLANTED_MUTABLES = """
            package planted.application;

            import java.util.ArrayList;
            import java.util.List;

            class PlantedMutables {

                private final List<String> names = new ArrayList<>();
                private final String[] parts = new String[1];

                void remember(String raw) {
                    names.add(raw);
                    parts[0] = raw;
                }

                void refusesTheList() {
                    throw new IllegalStateException("Bad " + names);
                }

                void refusesTheArray() {
                    throw new IllegalStateException("Bad " + String.join(",", parts));
                }
            }
            """;

    private static final String PLANTED_REASON = """
            package planted.domain;

            public class PlantedReason extends RuntimeException {

                public PlantedReason(String reason) {
                    super("Refused: " + reason);
                }
            }
            """;

    private static final String PLANTED_LEAKED_REASON = """
            package planted.domain;

            public class PlantedLeakedReason extends RuntimeException {

                public PlantedLeakedReason(String reason) {
                    super("Refused: " + reason);
                }
            }
            """;

    private static final String PLANTED_NAME = """
            package planted.domain;

            public record PlantedName(String value) {
            }
            """;

    private static final String PLANTED_LABEL = """
            package planted.domain;

            public record PlantedLabel(String label) {

                public PlantedLabel {
                    if (label.isBlank()) {
                        throw new IllegalArgumentException("Blank label " + label);
                    }
                }

                static PlantedLabel named() {
                    return new PlantedLabel("Name");
                }
            }
            """;

    private static final String PLANTED_CHECK = """
            package planted.domain;

            interface PlantedCheck {

                void check(String label);
            }
            """;

    private static final String PLANTED_OVERRIDING_CHECK = """
            package planted.domain;

            class PlantedOverridingCheck implements PlantedCheck {

                @Override
                public void check(String label) {
                    throw new IllegalStateException("Failed " + label);
                }

                void run() {
                    check("Name");
                }
            }
            """;

    private static final String PLANTED_ADAPTER = """
            package planted.infrastructure;

            import planted.domain.PlantedAmbient;
            import planted.domain.PlantedConflict;
            import planted.domain.PlantedFailure;
            import planted.domain.PlantedLeakedReason;
            import planted.domain.PlantedReason;

            class PlantedAdapter {

                void forwardsTheValueThroughItsOwnFailure(String header) {
                    throw new PlantedAdapterFailure("bad header " + header);
                }

                void remembersTheHeader(String header) {
                    PlantedAmbient.set(header);
                }

                void refuses(String header) {
                    if (header.isBlank()) {
                        throw new PlantedReason("the header is blank");
                    }
                    if (header.length() > 10) {
                        throw new PlantedReason("the header is longer than " + 10 + " characters, it has " + header.length());
                    }
                    throw new PlantedLeakedReason("the header " + header + " is unknown");
                }

                void namesTheValueOutsideTheTwoLayers(String header) {
                    throw new IllegalArgumentException("Bad header " + header);
                }

                void forwardsTheValue(String header) {
                    throw new PlantedFailure("bad header " + header);
                }

                void namesTheCodeOnly(String rawCode) {
                    throw new PlantedConflict(rawCode, "fixed");
                }
            }
            """;

    private static final String PLANTED_MESSAGES = """
            package planted.application;

            import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
            import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
            import cz.novanadeje.app.shared.domain.Money;
            import planted.domain.PlantedAmbient;
            import planted.domain.PlantedDelegating;
            import planted.domain.PlantedDescription;
            import planted.domain.PlantedFailure;
            import planted.domain.PlantedFlexibleFailure;
            import planted.domain.PlantedName;
            import planted.domain.PlantedReassigningFailure;
            import planted.domain.PlantedRefusal;
            import planted.domain.PlantedSecret;

            import java.math.BigDecimal;
            import java.util.List;
            import java.util.Locale;
            import java.util.Map;
            import java.util.Objects;
            import java.util.Optional;
            import java.util.UUID;
            import java.util.function.Consumer;

            class PlantedMessages {

                enum Kind { ONE, TWO }

                private final String label;
                private String mutableLabel = "Name";
                private final Map<UUID, String> names = Map.of();

                PlantedMessages(String label) {
                    this.label = label;
                }

                void concatenatesAParameter(String symbol) {
                    throw new IllegalArgumentException("Bad symbol " + symbol);
                }

                void concatenatesAField() {
                    throw new IllegalStateException("Bad " + label);
                }

                void concatenatesAFieldOthersMayChange() {
                    throw new IllegalStateException("Bad " + mutableLabel);
                }

                void concatenatesAValueObject(PlantedName name) {
                    throw new IllegalArgumentException("Bad name " + name);
                }

                void readsAValueObject(PlantedName name) {
                    throw new IllegalArgumentException("Bad name " + name.value());
                }

                void formatsAParameter(String tag) {
                    throw new IllegalArgumentException(String.format(Locale.ROOT, "Bad tag %s", tag));
                }

                void formatsWithFormatted(String code) {
                    throw new IllegalArgumentException("Bad code %s".formatted(code));
                }

                void appendsToABuilder(String account) {
                    throw new IllegalArgumentException(new StringBuilder("Bad account ").append(account).toString());
                }

                void joinsAList(List<String> names) {
                    throw new IllegalArgumentException("Bad names " + String.join(", ", names));
                }

                void passesTheValueAsTheMessage(String email) {
                    throw new IllegalArgumentException(email);
                }

                void passesTheValueToAForwardingFailure(String iban) {
                    throw new PlantedFailure(iban);
                }

                void capturesAValueInALambda(Optional<String> found, String slug) {
                    found.orElseThrow(() -> new IllegalStateException("Missing " + slug));
                }

                void feedsAPrivateHelperAValue(String name) {
                    requireText(name, name);
                }

                private void requireText(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                void feedsAHelperAConstantAndAValue(String value) {
                    requireField(value, "Name");
                    requireField(value, value);
                }

                void requireField(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                Consumer<String> referencesAHelper() {
                    requireReferenced("Name");
                    return this::requireReferenced;
                }

                private void requireReferenced(String label) {
                    throw new IllegalArgumentException(label + " is required");
                }

                @Deprecated
                void requireAnnotated(String label) {
                    throw new IllegalArgumentException(label + " is required");
                }

                void callsTheAnnotatedHelper() {
                    requireAnnotated("Name");
                }

                void passesTheValueThroughTwoForwardingFailures(String raw) {
                    throw new PlantedRefusal(raw);
                }

                void passesTheValueThroughADelegatingConstructor(String raw) {
                    throw new PlantedDelegating(raw);
                }

                void choosesTheValueInATernary(boolean fixed, String raw) {
                    throw new IllegalArgumentException(fixed ? "fixed" : raw);
                }

                void wrapsTheValueInAnArray(String raw) {
                    throw new IllegalArgumentException(String.format(Locale.ROOT, "Bad %s", new Object[] {raw}));
                }

                void wrapsTheValueInANewObject(String raw) {
                    throw new IllegalArgumentException("Bad " + new PlantedName(raw));
                }

                void describesItself() {
                    throw new IllegalStateException("Bad " + describe());
                }

                void holdsItsDescriptionInALocal() {
                    String description = describe();
                    throw new IllegalStateException("Bad " + description);
                }

                private String describe() {
                    return label;
                }

                void appendsTheValueToALocal(String raw) {
                    String message = "Bad ";
                    message += raw;
                    throw new IllegalArgumentException(message);
                }

                void concatenatesAnAmount(Money amount) {
                    throw new IllegalArgumentException("Bad amount " + amount);
                }

                void concatenatesADecimal(BigDecimal amount) {
                    throw new IllegalArgumentException("Bad amount " + amount);
                }

                void parsesTheValue(String raw) {
                    throw new IllegalArgumentException("Bad number " + Long.parseLong(raw));
                }

                void takesACharacterOfTheValue(String raw) {
                    throw new IllegalArgumentException("Bad first character " + raw.charAt(0));
                }

                void capturesAValueInAMappingLambda(List<UUID> ids, String name) {
                    throw new IllegalArgumentException("Bad " + ids.stream().map(id -> name).toList());
                }

                void returnsAValueFromALambdaBlock(List<UUID> ids, String name) {
                    throw new IllegalArgumentException("Bad " + ids.stream().map(id -> {
                        return name;
                    }).toList());
                }

                void requiresWithAMessage(Object value, String raw) {
                    Objects.requireNonNull(value, "Missing " + raw);
                }

                void requiresWithAMessageSupplier(Object value, String raw) {
                    Objects.requireNonNull(value, () -> "Missing " + raw);
                }

                void reassignsALoopVariable(List<String> names) {
                    for (String name : names) {
                        if (name.isBlank()) {
                            name = "blank";
                        }
                        throw new IllegalArgumentException("Bad " + name);
                    }
                }

                void concatenatesAnInheritedValue(PlantedDerived derived) {
                    throw new IllegalArgumentException("Bad " + derived);
                }

                void concatenatesAStatelessHandle(PlantedHandle handle) {
                    throw new IllegalArgumentException("Bad " + handle);
                }

                void concatenatesTheFirstOfACycle(PlantedCycleA first) {
                    throw new IllegalArgumentException("Bad " + first);
                }

                void concatenatesTheSecondOfACycle(PlantedCycleB second) {
                    throw new IllegalArgumentException("Bad " + second);
                }

                void namesAGeneratedSecret() {
                    throw new IllegalStateException("Bad link " + PlantedSecret.generate().value());
                }

                void namesAGeneratedSecretThroughALocal() {
                    PlantedSecret secret = PlantedSecret.generate();
                    throw new IllegalStateException("Bad link " + secret.value());
                }

                void namesAnAmountAFactoryBuilds(long amountMinor) {
                    throw new IllegalArgumentException("Bad amount " + Money.czk(amountMinor));
                }

                void namesAnAmountItBuilds(long amountMinor) {
                    throw new IllegalArgumentException("Bad amount " + new Money(amountMinor, cz.novanadeje.app.shared.domain.Currency.CZK));
                }

                void namesAStaticFieldOthersMayChange() {
                    throw new IllegalStateException("Bad " + PlantedAmbient.current());
                }

                void mapsIdsThroughAMethodReference(List<UUID> ids) {
                    throw new IllegalStateException("Bad " + ids.stream().map(names::get).toList());
                }

                void mapsIdsThroughAConstructorReference(List<UUID> ids) {
                    throw new IllegalStateException("Bad " + ids.stream().map(PlantedLabelled::new).toList());
                }

                void requiresWithAMethodReference(Object value) {
                    Objects.requireNonNull(value, this::describe);
                }

                void namesAnOverriddenDescription(PlantedDescription description) {
                    throw new IllegalStateException("Bad " + description.describe());
                }

                void namesADefaultARecordOverrides(PlantedNamedThing thing) {
                    throw new IllegalStateException("Bad " + thing.name());
                }

                void namesTheStartOfACycleFirst() {
                    throw new IllegalStateException("Bad " + startOfACycle(true));
                }

                void namesTheMiddleOfACycleSecond() {
                    throw new IllegalStateException("Bad " + middleOfACycle(true));
                }

                private String startOfACycle(boolean again) {
                    return again ? middleOfACycle(false) : label;
                }

                private String middleOfACycle(boolean again) {
                    return startOfACycle(again);
                }

                void passesTheValueToAFailureCheckingFirst(String raw) {
                    throw new PlantedFlexibleFailure("Bad " + raw);
                }

                void passesTheValueToAFailureThatReassignsIt(String raw) {
                    throw new PlantedReassigningFailure("fixed", raw);
                }

                void concatenatesANonFinalBase(PlantedCounted counted) {
                    throw new IllegalArgumentException("Bad " + counted);
                }

                void namesAContentDigest(ContentDigest digest) {
                    throw new IllegalStateException("Bad digest " + digest);
                }

                void namesAReceiptFingerprint(ReceiptFingerprint fingerprint) {
                    throw new IllegalStateException("Bad fingerprint " + fingerprint);
                }

                void switchesTheMessageToTheValue(Kind kind, String raw) {
                    throw new IllegalArgumentException(switch (kind) {
                        case ONE -> "One";
                        case TWO -> raw;
                    });
                }

                void yieldsTheValueInASwitch(Kind kind, String raw) {
                    throw new IllegalArgumentException(switch (kind) {
                        case ONE -> "One";
                        case TWO -> {
                            yield raw;
                        }
                    });
                }
            }
            """;

    private static final String PLANTED_CLOSED_MESSAGES = """
            package planted.application;

            import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
            import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
            import planted.domain.PlantedConflict;

            import java.time.Duration;
            import java.time.LocalDate;
            import java.util.List;
            import java.util.Locale;
            import java.util.Objects;
            import java.util.UUID;

            class PlantedClosedMessages {

                private static final String PREFIX = "app.planted.";
                private static final int MAX_LENGTH = 10;

                private final String field;

                enum Kind { ONE, TWO }

                enum Labelled {
                    NAME("Name");

                    Labelled(String label) {
                        if (label.isBlank()) {
                            throw new IllegalArgumentException("Blank label " + label);
                        }
                    }
                }

                record Named(String value) {
                }

                private PlantedClosedMessages(String field) {
                    this.field = field;
                }

                static PlantedClosedMessages named() {
                    return new PlantedClosedMessages("name");
                }

                void namesAConstant() {
                    throw new IllegalArgumentException(PREFIX + "ttl must be positive");
                }

                void namesALength(String value) {
                    throw new IllegalArgumentException("A value holds at most " + MAX_LENGTH + " characters, but holds " + value.length());
                }

                void namesClosedValues(Duration ttl, LocalDate day, UUID id, Kind kind, int count) {
                    throw new IllegalStateException("ttl " + ttl + " day " + day + " id " + id + " kind " + kind + " name " + kind.name() + " count " + count);
                }

                void namesAClass(Object value) {
                    throw new IllegalStateException("Unexpected " + value.getClass().getSimpleName());
                }

                void keepsACause(String value, RuntimeException cause) {
                    throw new IllegalStateException("Could not read the value", cause);
                }

                void namesAFieldFedOnlyConstants() {
                    throw new IllegalStateException("The " + field + " is missing");
                }

                void feedsHelpersConstants(String name) {
                    requireLabelled(name, "Name");
                    requireLabelled(name, MAX_LENGTH > 5 ? "Long name" : "Short name");
                    requireNamed(name, "Name");
                }

                private void requireLabelled(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                void requireNamed(String value, String label) {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException(label + " is required");
                    }
                }

                void castsAConstant() {
                    throw new IllegalStateException("Bad " + (Object) PREFIX);
                }

                void parenthesisesAClosedValue(int count) {
                    throw new IllegalStateException(("Bad count " + count));
                }

                void choosesBetweenConstants(boolean flag) {
                    throw new IllegalStateException(flag ? "One" : "Two");
                }

                void wrapsAClosedValueInAnArray(int count) {
                    throw new IllegalStateException(String.format(Locale.ROOT, "Bad %d", new Object[] {count}));
                }

                void wrapsAConstantInANewObject() {
                    throw new IllegalStateException("Bad " + new Named("fixed") + " " + new Named("fixed").toString() + " " + new Named("fixed").value());
                }

                void holdsAConstantInALocal() {
                    String label = "Name";
                    throw new IllegalArgumentException(label + " is required");
                }

                void switchesALocalToConstants(Kind kind) {
                    String label = switch (kind) {
                        case ONE -> "One";
                        case TWO -> {
                            yield "Two";
                        }
                    };
                    throw new IllegalArgumentException(label + " is required");
                }

                void switchesTheMessageToConstants(Kind kind) {
                    throw new IllegalArgumentException(switch (kind) {
                        case ONE -> "One";
                        case TWO -> "Two";
                    });
                }

                void mapsIdsInALambda(List<UUID> ids) {
                    throw new IllegalStateException("Bad " + ids.stream().map(id -> id.toString()).toList());
                }

                void requiresWithAFixedMessage(Object value) {
                    Objects.requireNonNull(value, "Missing value");
                }

                void namesIdsOfAFixedShape(ReceiptNumber number, ReceiptSigningKeyId keyId) {
                    throw new IllegalStateException("Receipt " + number + " key " + keyId + " number " + number.value());
                }

                void namesAWordAHelperChooses(int status) {
                    throw new IllegalStateException("Status " + wordOf(status) + " " + PlantedClosedMessages.wordOf(status));
                }

                private static String wordOf(int status) {
                    return status > 0 ? "positive" : "other";
                }

                void namesAWordARecursiveHelperChooses(int status) {
                    throw new IllegalStateException("Status " + wordAfter(status));
                }

                private static String wordAfter(int status) {
                    return status > 0 ? wordAfter(status - 1) : "settled";
                }

                void mapsIdsThroughAClosedMethodReference(List<UUID> ids) {
                    throw new IllegalStateException("Bad " + ids.stream().map(UUID::version).toList());
                }

                void namesWhetherTheValueMatches(String raw) {
                    throw new IllegalArgumentException("Bad " + "x".equals(raw) + " " + Boolean.valueOf(raw));
                }

                void namesTheTypeAHelperFinds(Object value) {
                    throw new IllegalStateException("Unexpected " + typeOf(value).getSimpleName() + " of kind " + Kind.valueOf(value.toString()));
                }

                private static Class<?> typeOf(Object value) {
                    return value.getClass();
                }

                void namesTheCodeOfAConflict(String rawCode) {
                    throw new PlantedConflict(rawCode, "fixed");
                }
            }
            """;

    private static final String PLANTED_OUTSIDE_IN_A_LAYER_FOLDER = """
            package planted.infrastructure;

            class PlantedOutside {

                void namesTheValue(String raw) {
                    throw new IllegalArgumentException("Bad " + raw);
                }
            }
            """;

    @Test
    @DisplayName("Given the main sources, when the exception messages of domain and application code are read, then none is built from an open value")
    void should_build_no_exception_message_from_an_open_value_when_read_given_the_main_sources() {
        List<Path> sources = ExceptionMessageValues.javaSources(MAIN_SOURCES);

        assertThat(sources).isNotEmpty();
        ExceptionMessageValues.Scan scan = ExceptionMessageValues.scan(sources);
        assertThat(scan.reports()).isEmpty();
        assertThat(scan.checkedSitesByLayer()).as("message sites checked per layer")
                .hasEntrySatisfying("domain", count -> assertThat(count).isPositive())
                .hasEntrySatisfying("application", count -> assertThat(count).isPositive());
    }

    @Test
    @DisplayName("Given planted throwables that override getMessage, getLocalizedMessage or toString and a plain class overriding toString, when the rule checks them, then exactly the throwables are reported")
    void should_report_every_throwable_computing_its_message_when_checked_given_planted_overrides(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.plantedm.domain.PlantedOverrides", """
                        package cz.novanadeje.app.plantedm.domain;

                        class PlantedOverrides {

                            static class PlantedMessage extends RuntimeException {

                                private final String raw = "raw";

                                @Override
                                public String getMessage() {
                                    return "Bad " + raw;
                                }
                            }

                            static class PlantedLocalizedMessage extends RuntimeException {

                                @Override
                                public String getLocalizedMessage() {
                                    return "Bad";
                                }
                            }

                            static class PlantedDescribedFailure extends Exception {

                                @Override
                                public String toString() {
                                    return "Bad";
                                }
                            }

                            static class PlantedValue {

                                @Override
                                public String toString() {
                                    return "Value";
                                }
                            }
                        }
                        """));

        assertThat(throwables_compute_no_message_when_it_is_read.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedMessage.getMessage()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedLocalizedMessage.getLocalizedMessage()"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedDescribedFailure.toString()"));
    }

    static Stream<Arguments> idsOfAFixedShape() {
        return Stream.of(
                Arguments.of(ReceiptNumber.class, "2026-000001", "ABCD-EFGHIJ"),
                Arguments.of(ReceiptSigningKeyId.class, "21fe31df", "21FE31DF"));
    }

    @Test
    @DisplayName("Given the ids the rule counts closed by their fixed shape, when they are listed, then each one has its free-text check below")
    void should_check_every_closed_id_when_listed_given_the_ids_of_a_fixed_shape() {
        assertThat(idsOfAFixedShape().map(arguments -> ((Class<?>) arguments.get()[0]).getName()))
                .containsExactlyInAnyOrderElementsOf(ExceptionMessageValues.CLOSED_SITE_TYPES);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("idsOfAFixedShape")
    @DisplayName("Given an id the rule counts closed by its fixed shape, when it is built from free text or uppercase letters, then its constructor refuses it")
    void should_refuse_free_text_when_built_given_an_id_of_a_fixed_shape(Class<?> type, String valid, String uppercase) throws ReflectiveOperationException {
        assertThat(type.isRecord()).as("%s is a record", type.getSimpleName()).isTrue();
        assertThat(type.getRecordComponents()).extracting(RecordComponent::getType).containsExactly(String.class);
        Constructor<?> constructor = type.getDeclaredConstructor(String.class);

        assertThat(constructor.newInstance(valid)).isNotNull();
        for (String refused : List.of("a b", uppercase)) {
            assertThatThrownBy(() -> constructor.newInstance(refused)).as("%s(%s)", type.getSimpleName(), refused)
                    .isInstanceOf(InvocationTargetException.class)
                    .cause().isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    @DisplayName("Given planted messages built from open values in every way, when they are read, then each one is reported")
    void should_report_every_planted_message_when_read_given_messages_built_from_open_values(@TempDir Path root) {
        List<Path> sources = planted(root, PLANTED_FAILURE, PLANTED_KIND, PLANTED_REFUSAL, PLANTED_CONFLICT, PLANTED_DELEGATING,
                PLANTED_CODE, PLANTED_TOKEN, PLANTED_REASON, PLANTED_LEAKED_REASON, PLANTED_NAME, PLANTED_LABEL, PLANTED_CHECK,
                PLANTED_OVERRIDING_CHECK, PLANTED_ADAPTER, PLANTED_HOLDERS, PLANTED_MUTABLES, PLANTED_MESSAGES, PLANTED_FLEXIBLE_FAILURE,
                PLANTED_REASSIGNING_FAILURE, PLANTED_ADAPTER_FAILURE, PLANTED_SECRET, PLANTED_AMBIENT, PLANTED_DESCRIPTIONS);

        assertThat(ExceptionMessageValues.scan(sources).reports()).extracting(ExceptionMessageRulesTest::siteOf).containsExactlyInAnyOrder(
                "PlantedFailure.<init>",
                "PlantedLeakedReason.<init>",
                "PlantedLabel.<init>",
                "PlantedOverridingCheck.check",
                "PlantedMessages.concatenatesAParameter",
                "PlantedMessages.concatenatesAField",
                "PlantedMessages.concatenatesAFieldOthersMayChange",
                "PlantedMessages.concatenatesAValueObject",
                "PlantedMessages.readsAValueObject",
                "PlantedMessages.formatsAParameter",
                "PlantedMessages.formatsWithFormatted",
                "PlantedMessages.appendsToABuilder",
                "PlantedMessages.joinsAList",
                "PlantedMessages.passesTheValueAsTheMessage",
                "PlantedMessages.passesTheValueToAForwardingFailure",
                "PlantedMessages.capturesAValueInALambda",
                "PlantedMessages.requireText",
                "PlantedMessages.requireField",
                "PlantedMessages.requireReferenced",
                "PlantedMessages.requireAnnotated",
                "PlantedCode.from",
                "PlantedToken.<init>",
                "PlantedAdapter.forwardsTheValue",
                "PlantedMutables.refusesTheList",
                "PlantedMutables.refusesTheArray",
                "PlantedMessages.passesTheValueThroughTwoForwardingFailures",
                "PlantedMessages.passesTheValueThroughADelegatingConstructor",
                "PlantedMessages.choosesTheValueInATernary",
                "PlantedMessages.wrapsTheValueInAnArray",
                "PlantedMessages.wrapsTheValueInANewObject",
                "PlantedMessages.describesItself",
                "PlantedMessages.holdsItsDescriptionInALocal",
                "PlantedMessages.appendsTheValueToALocal",
                "PlantedMessages.concatenatesAnAmount",
                "PlantedMessages.concatenatesADecimal",
                "PlantedMessages.parsesTheValue",
                "PlantedMessages.takesACharacterOfTheValue",
                "PlantedMessages.capturesAValueInAMappingLambda",
                "PlantedMessages.returnsAValueFromALambdaBlock",
                "PlantedMessages.requiresWithAMessage",
                "PlantedMessages.requiresWithAMessageSupplier",
                "PlantedMessages.reassignsALoopVariable",
                "PlantedMessages.concatenatesAnInheritedValue",
                "PlantedMessages.concatenatesAStatelessHandle",
                "PlantedMessages.concatenatesTheFirstOfACycle",
                "PlantedMessages.concatenatesTheSecondOfACycle",
                "PlantedMessages.namesAGeneratedSecret",
                "PlantedMessages.namesAGeneratedSecretThroughALocal",
                "PlantedMessages.namesAnAmountAFactoryBuilds",
                "PlantedMessages.namesAnAmountItBuilds",
                "PlantedMessages.namesAStaticFieldOthersMayChange",
                "PlantedMessages.mapsIdsThroughAMethodReference",
                "PlantedMessages.mapsIdsThroughAConstructorReference",
                "PlantedMessages.requiresWithAMethodReference",
                "PlantedMessages.namesAnOverriddenDescription",
                "PlantedMessages.namesADefaultARecordOverrides",
                "PlantedMessages.namesTheStartOfACycleFirst",
                "PlantedMessages.namesTheMiddleOfACycleSecond",
                "PlantedMessages.passesTheValueToAFailureCheckingFirst",
                "PlantedReassigningFailure.<init>",
                "PlantedAdapter.forwardsTheValueThroughItsOwnFailure",
                "PlantedMessages.concatenatesANonFinalBase",
                "PlantedMessages.namesAContentDigest",
                "PlantedMessages.namesAReceiptFingerprint",
                "PlantedMessages.switchesTheMessageToTheValue",
                "PlantedMessages.yieldsTheValueInASwitch");
    }

    @Test
    @DisplayName("Given planted messages built from closed values only, when they are read, then none is reported")
    void should_report_nothing_when_read_given_messages_built_from_closed_values(@TempDir Path root) {
        List<Path> sources = planted(root, PLANTED_KIND, PLANTED_CONFLICT, PLANTED_CLOSED_MESSAGES);

        assertThat(ExceptionMessageValues.scan(sources).reports()).isEmpty();
    }

    @Test
    @DisplayName("Given an adapter's source in a folder named like a message layer, when it is read, then its package decides and nothing is reported")
    void should_report_nothing_when_read_given_an_adapter_in_a_folder_named_like_a_message_layer(@TempDir Path root) {
        List<Path> sources = List.of(written(root.resolve("domain"), PLANTED_OUTSIDE_IN_A_LAYER_FOLDER));

        assertThat(ExceptionMessageValues.scan(sources).reports()).isEmpty();
    }

    private static String siteOf(String report) {
        return report.substring(0, report.indexOf(' '));
    }

    private static List<Path> planted(Path root, String... sources) {
        return Arrays.stream(sources).map(source -> written(root, source)).toList();
    }

    private static Path written(Path root, String source) {
        Matcher packageName = PACKAGE.matcher(source);
        Matcher typeName = TYPE.matcher(source);
        assertThat(packageName.find() && typeName.find()).as("a planted source names its package and type").isTrue();
        try {
            Path folder = Files.createDirectories(root.resolve(packageName.group(1).replace('.', '/')));
            return Files.writeString(folder.resolve(typeName.group(1) + ".java"), source);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
