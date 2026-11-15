package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.Console;
import java.io.IOException;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.nio.file.Path;
import java.text.DateFormat;
import java.text.DateFormatSymbols;
import java.text.DecimalFormatSymbols;
import java.text.MessageFormat;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Formatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class LocaleRulesTest {

    private static final Set<String> CASE_CHANGES = Set.of("toLowerCase", "toUpperCase");

    private static final DescribedPredicate<JavaAccess<?>> A_CASE_CHANGE_IN_THE_DEFAULT_LOCALE = DescribedPredicate.describe(
            "String.toLowerCase() or String.toUpperCase() without a Locale",
            access -> access.getTarget() instanceof CodeUnitAccessTarget target
                    && access.getTargetOwner().isEquivalentTo(String.class)
                    && CASE_CHANGES.contains(target.getName())
                    && target.getRawParameterTypes().isEmpty());

    private static final Set<String> PRINTING = Set.of("printf", "format");

    private static final List<Class<?>> LOCALE_CARRIERS = List.of(Locale.class, DecimalFormatSymbols.class, DateFormatSymbols.class);

    private static final DescribedPredicate<JavaAccess<?>> TEXT_FORMATTED_IN_THE_DEFAULT_LOCALE = inTheDefaultLocale(
            "String.format, String.formatted, a new Formatter, printf or format of a PrintStream, PrintWriter or Console, "
                    + "or MessageFormat's constructor or static format, without a Locale",
            target -> ownedBy(target, String.class) && Set.of("format", "formatted").contains(target.getName())
                    || ownedBy(target, Formatter.class) && isConstructor(target)
                    || ownedByAnyOf(target, PrintStream.class, PrintWriter.class, Console.class) && PRINTING.contains(target.getName())
                    || ownedBy(target, MessageFormat.class) && (isConstructor(target) || target.getName().equals("format") && isStatic(target)));

    private static final DescribedPredicate<JavaAccess<?>> NUMBERS_FORMATTED_IN_THE_DEFAULT_LOCALE = inTheDefaultLocale(
            "a NumberFormat, DecimalFormat or DecimalFormatSymbols made without a Locale or DecimalFormatSymbols",
            target -> ownedByAnyOf(target, NumberFormat.class, DecimalFormatSymbols.class) && isFactory(target));

    private static final DescribedPredicate<JavaAccess<?>> DATES_FORMATTED_IN_THE_DEFAULT_LOCALE = inTheDefaultLocale(
            "DateTimeFormatter.ofPattern, DateTimeFormatterBuilder.toFormatter, or a DateFormat, SimpleDateFormat or DateFormatSymbols "
                    + "made without a Locale or DateFormatSymbols",
            target -> ownedBy(target, DateTimeFormatter.class) && target.getName().equals("ofPattern")
                    || ownedBy(target, DateTimeFormatterBuilder.class) && target.getName().equals("toFormatter")
                    || ownedByAnyOf(target, DateFormat.class, DateFormatSymbols.class) && isFactory(target));

    @ArchTest
    static final ArchRule text_formatting_names_its_locale = noClasses()
            .should().accessTargetWhere(TEXT_FORMATTED_IN_THE_DEFAULT_LOCALE)
            .because("these format numbers in the JVM's default locale (ar-EG writes %d as Arabic-Indic digits), "
                    + "so a TOTP code, an IBAN's check digits or a receipt number would differ from machine to machine; "
                    + "use String.format(Locale.ROOT, …) or a locale chosen for the reader");

    @ArchTest
    static final ArchRule number_formats_name_their_locale = noClasses()
            .should().accessTargetWhere(NUMBERS_FORMATTED_IN_THE_DEFAULT_LOCALE)
            .because("a number format made without a locale takes the JVM's default digits and separators; "
                    + "name Locale.ROOT, the reader's locale or the DecimalFormatSymbols of one");

    @ArchTest
    static final ArchRule date_formats_name_their_locale = noClasses()
            .should().accessTargetWhere(DATES_FORMATTED_IN_THE_DEFAULT_LOCALE)
            .because("a date format made without a locale writes month and day names, era and week fields in the JVM's default locale, "
                    + "and the rule cannot see which pattern letters a pattern holds; name Locale.ROOT or the reader's locale");

    @ArchTest
    static final ArchRule case_changes_name_their_locale = noClasses()
            .should().accessTargetWhere(A_CASE_CHANGE_IN_THE_DEFAULT_LOCALE)
            .because("the default locale changes what a case change gives (a Turkish locale lowers I to a dotless ı), "
                    + "so a header, a key or an address compared after one would differ from machine to machine; name Locale.ROOT");

    @Test
    @DisplayName("Given a planted class that changes case without a locale, by a call and by a method reference, when the rule checks it, then both are reported and a change with Locale.ROOT is not")
    void should_report_every_case_change_without_a_locale_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.PlantedHeaders", """
                package cz.novanadeje.app.planteda.infrastructure;

                import java.util.Locale;
                import java.util.function.Function;

                class PlantedHeaders {

                    boolean isJson(String contentType) {
                        return contentType.toLowerCase().startsWith("application/json");
                    }

                    Function<String, String> upper() {
                        return String::toUpperCase;
                    }

                    String named(String header) {
                        return header.toLowerCase(Locale.ROOT);
                    }
                }
                """));

        assertThat(case_changes_name_their_locale.evaluate(planted).getFailureReport().getDetails())
                .hasSize(2)
                .anySatisfy(detail -> assertThat(detail).contains("isJson"))
                .anySatisfy(detail -> assertThat(detail).contains("upper"))
                .noneSatisfy(detail -> assertThat(detail).contains("named"));
    }

    @Test
    @DisplayName("Given a planted class that formats text by every default-locale path, by a call and by a method reference, when the rule checks it, then each is reported and the calls naming a locale are not")
    void should_report_every_text_formatting_without_a_locale_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.domain.PlantedCodes", """
                package cz.novanadeje.app.planteda.domain;

                import java.io.PrintStream;
                import java.io.PrintWriter;
                import java.io.StringWriter;
                import java.text.MessageFormat;
                import java.util.Formatter;
                import java.util.Locale;
                import java.util.function.BiFunction;

                class PlantedCodes {

                    String padded(int code) {
                        return String.format("%06d", code);
                    }

                    String serial(int code) {
                        return "%06d".formatted(code);
                    }

                    BiFunction<String, Object[], String> formatter() {
                        return String::format;
                    }

                    String appended(int code) {
                        return new Formatter(new StringBuilder()).format("%d", code).toString();
                    }

                    void printed(PrintStream out, int code) {
                        out.printf("%d", code);
                    }

                    void written(PrintWriter out, int code) {
                        out.format("%d", code);
                    }

                    String message(int code) {
                        return MessageFormat.format("{0,number}", code);
                    }

                    String pattern(int code) {
                        return new MessageFormat("{0,number}").format(new Object[] {code});
                    }

                    String rooted(int code) {
                        PrintWriter writer = new PrintWriter(new StringWriter());
                        writer.printf(Locale.ROOT, "%d", code);
                        new MessageFormat("{0,number}", Locale.ROOT).format(new Object[] {code});
                        return String.format(Locale.ROOT, "%06d", code) + new Formatter(new StringBuilder(), Locale.ROOT).format("%d", code);
                    }
                }
                """));

        assertThat(text_formatting_names_its_locale.evaluate(planted).getFailureReport().getDetails())
                .hasSize(8)
                .anySatisfy(detail -> assertThat(detail).contains("padded"))
                .anySatisfy(detail -> assertThat(detail).contains("serial"))
                .anySatisfy(detail -> assertThat(detail).contains("formatter"))
                .anySatisfy(detail -> assertThat(detail).contains("appended"))
                .anySatisfy(detail -> assertThat(detail).contains("printed"))
                .anySatisfy(detail -> assertThat(detail).contains("written"))
                .anySatisfy(detail -> assertThat(detail).contains("message"))
                .anySatisfy(detail -> assertThat(detail).contains("pattern"))
                .noneSatisfy(detail -> assertThat(detail).contains("rooted"));
    }

    @Test
    @DisplayName("Given a planted class that makes number formats without a locale, by a factory, a constructor and a method reference, when the rule checks it, then each is reported and those naming a locale or symbols are not")
    void should_report_every_number_format_without_a_locale_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.PlantedAmounts", """
                package cz.novanadeje.app.planteda.infrastructure;

                import java.text.DecimalFormat;
                import java.text.DecimalFormatSymbols;
                import java.text.NumberFormat;
                import java.util.Locale;
                import java.util.function.Supplier;

                class PlantedAmounts {

                    String grouped(long amount) {
                        return NumberFormat.getNumberInstance().format(amount);
                    }

                    String patterned(long amount) {
                        return new DecimalFormat("#,##0").format(amount);
                    }

                    String symbols(long amount) {
                        return new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance()).format(amount);
                    }

                    Supplier<NumberFormat> integers() {
                        return NumberFormat::getIntegerInstance;
                    }

                    String rooted(long amount) {
                        return NumberFormat.getNumberInstance(Locale.ROOT).format(amount)
                                + new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.ROOT)).format(amount);
                    }
                }
                """));

        assertThat(number_formats_name_their_locale.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains("grouped"))
                .anySatisfy(detail -> assertThat(detail).contains("patterned"))
                .anySatisfy(detail -> assertThat(detail).contains("symbols"))
                .anySatisfy(detail -> assertThat(detail).contains("integers"))
                .noneSatisfy(detail -> assertThat(detail).contains("rooted"));
    }

    @Test
    @DisplayName("Given a planted class that makes date formats without a locale, by a pattern, a builder, a legacy format and a method reference, when the rule checks it, then each is reported and those naming a locale are not")
    void should_report_every_date_format_without_a_locale_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of("cz.novanadeje.app.planteda.infrastructure.PlantedDates", """
                package cz.novanadeje.app.planteda.infrastructure;

                import java.text.DateFormat;
                import java.text.SimpleDateFormat;
                import java.time.format.DateTimeFormatter;
                import java.time.format.DateTimeFormatterBuilder;
                import java.util.Locale;
                import java.util.function.Function;

                class PlantedDates {

                    DateTimeFormatter month() {
                        return DateTimeFormatter.ofPattern("LLLL yyyy");
                    }

                    DateTimeFormatter built() {
                        return new DateTimeFormatterBuilder().appendPattern("EEEE").toFormatter();
                    }

                    DateFormat legacy() {
                        return new SimpleDateFormat("MMMM");
                    }

                    DateFormat styled() {
                        return DateFormat.getDateInstance();
                    }

                    Function<String, DateTimeFormatter> patterns() {
                        return DateTimeFormatter::ofPattern;
                    }

                    DateTimeFormatter rooted() {
                        new SimpleDateFormat("MMMM", Locale.ROOT);
                        new DateTimeFormatterBuilder().appendPattern("EEEE").toFormatter(Locale.ROOT);
                        return DateTimeFormatter.ofPattern("LLLL yyyy", Locale.ROOT);
                    }
                }
                """));

        assertThat(date_formats_name_their_locale.evaluate(planted).getFailureReport().getDetails())
                .hasSize(5)
                .anySatisfy(detail -> assertThat(detail).contains("month"))
                .anySatisfy(detail -> assertThat(detail).contains("built"))
                .anySatisfy(detail -> assertThat(detail).contains("legacy"))
                .anySatisfy(detail -> assertThat(detail).contains("styled"))
                .anySatisfy(detail -> assertThat(detail).contains("patterns"))
                .noneSatisfy(detail -> assertThat(detail).contains("rooted"));
    }

    private static DescribedPredicate<JavaAccess<?>> inTheDefaultLocale(String description, Predicate<CodeUnitAccessTarget> localeSensitive) {
        return DescribedPredicate.describe(description, access -> access.getTarget() instanceof CodeUnitAccessTarget target
                && localeSensitive.test(target)
                && target.getRawParameterTypes().stream().noneMatch(LocaleRulesTest::carriesALocale));
    }

    private static boolean carriesALocale(JavaClass parameterType) {
        return LOCALE_CARRIERS.stream().anyMatch(parameterType::isEquivalentTo);
    }

    private static boolean ownedBy(CodeUnitAccessTarget target, Class<?> owner) {
        return target.getOwner().isAssignableTo(owner);
    }

    private static boolean ownedByAnyOf(CodeUnitAccessTarget target, Class<?>... owners) {
        return Set.of(owners).stream().anyMatch(owner -> ownedBy(target, owner));
    }

    private static boolean isConstructor(CodeUnitAccessTarget target) {
        return target.getName().equals(JavaConstructor.CONSTRUCTOR_NAME);
    }

    private static boolean isStatic(CodeUnitAccessTarget target) {
        return target.resolveMember().map(member -> member.getModifiers().contains(JavaModifier.STATIC)).orElse(false);
    }

    private static boolean isFactory(CodeUnitAccessTarget target) {
        return isConstructor(target) || target.getName().startsWith("get") && target.getName().endsWith("Instance") && isStatic(target);
    }
}
