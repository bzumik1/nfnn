package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.AdminActionFacts;
import cz.novanadeje.app.donors.application.AdminActionView;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.shared.domain.FoundationZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Component
class AdminActionSummaries {

    private static final String PREFIX = "admin.action.";
    private static final Locale CZECH = Locale.forLanguageTag("cs");
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\w+)}");
    private static final Pattern EMAIL_ADDRESS = Pattern.compile("[^\\s@]+@[^\\s@]+");
    private static final long HELLERS_PER_CROWN = 100;
    private static final long BYTES_PER_KILOBYTE = 1024;
    private static final long BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;

    private static final Logger log = LoggerFactory.getLogger(AdminActionSummaries.class);

    private final MessageSource messages;

    AdminActionSummaries(MessageSource messages) {
        this.messages = messages;
    }

    String summary(AdminActionView view, Locale requested) {
        return sentence(view, requested).orElse(view.details());
    }

    Optional<String> sentence(AdminActionView view, Locale requested) {
        Locale locale = Locale.ENGLISH.getLanguage().equals(requested.getLanguage()) ? Locale.ENGLISH : CZECH;
        return view.facts().flatMap(facts -> templateOf(facts, locale).flatMap(template -> filled(template, facts, view, locale)));
    }

    Optional<String> sentenceOnADevice(AdminActionView view) {
        return view.facts().map(AdminActionFacts::onADevice)
                .flatMap(facts -> templateOf(facts, CZECH)
                        .filter(template -> placeholdersOf(template).noneMatch(AdminActionFacts.NEVER_ON_A_DEVICE::contains))
                        .flatMap(template -> filled(template, facts, view, CZECH)))
                .filter(sentence -> !EMAIL_ADDRESS.matcher(sentence).find());
    }

    private Optional<String> templateOf(AdminActionFacts facts, Locale locale) {
        return Optional.ofNullable(messages.getMessage(PREFIX + "summary." + facts.summaryKey(), null, null, locale));
    }

    private Optional<String> filled(String template, AdminActionFacts facts, AdminActionView view, Locale locale) {
        try {
            return Optional.of(fill(template, facts, view, locale));
        } catch (RuntimeException unwritable) {
            log.warn("The summary of admin action {} could not be written: {}", view.id(), unwritable.getClass().getName());
            return Optional.empty();
        }
    }

    private static Stream<String> placeholdersOf(String template) {
        return PLACEHOLDER.matcher(template).results().map(placeholder -> placeholder.group(1));
    }

    private String fill(String template, AdminActionFacts facts, AdminActionView view, Locale locale) {
        Matcher placeholders = PLACEHOLDER.matcher(template);
        return placeholders.replaceAll(placeholder -> Matcher.quoteReplacement(
                facts.value(placeholder.group(1)).map(value -> format(placeholder.group(1), value, view, locale)).orElse("")));
    }

    private String format(String name, String value, AdminActionView view, Locale locale) {
        return switch (name) {
            case AdminActionFacts.DONOR -> view.donor().map(donor -> donorName(donor, locale)).orElseGet(() -> text("donor.missing", locale));
            case "amount" -> withValue("format.amount", crowns(Long.parseLong(value), locale), locale);
            case "booked", "on" -> DateTimeFormatter.ofPattern(text("format.day", locale), locale).format(LocalDate.parse(value));
            case "until" -> DateTimeFormatter.ofPattern(text("format.time", locale), locale).format(Instant.parse(value).atZone(FoundationZone.ZONE));
            case "month" -> DateTimeFormatter.ofPattern(text("format.month", locale), locale).format(YearMonth.parse(value));
            case "bytes" -> size(Long.parseLong(value), locale);
            case "method", "platform", "browser" -> messages.getMessage(PREFIX + name + "." + value, null, value, locale);
            case "sections" -> labels("section.", value, locale);
            case "settings" -> labels("setting.", value, locale);
            case "previous" -> messages.getMessage(PREFIX + "level." + value, null, value, locale);
            case "fromOrder", "toOrder" -> labels("projectOrder.", value, locale);
            default -> value;
        };
    }

    private String donorName(Donor donor, Locale locale) {
        return donor.isErased() ? text("donor.erased", locale) : donor.name();
    }

    private static String crowns(long amountMinor, Locale locale) {
        NumberFormat format = NumberFormat.getNumberInstance(locale);
        int fractionDigits = amountMinor % HELLERS_PER_CROWN == 0 ? 0 : 2;
        format.setMinimumFractionDigits(fractionDigits);
        format.setMaximumFractionDigits(fractionDigits);
        return format.format(amountMinor / (double) HELLERS_PER_CROWN);
    }

    private String size(long bytes, Locale locale) {
        NumberFormat format = NumberFormat.getNumberInstance(locale);
        format.setMinimumFractionDigits(1);
        format.setMaximumFractionDigits(1);
        return bytes < BYTES_PER_MEGABYTE
                ? withValue("format.kilobytes", format.format(bytes / (double) BYTES_PER_KILOBYTE), locale)
                : withValue("format.megabytes", format.format(bytes / (double) BYTES_PER_MEGABYTE), locale);
    }

    private String labels(String prefix, String codes, Locale locale) {
        return Arrays.stream(codes.split(","))
                .map(code -> messages.getMessage(PREFIX + prefix + code, null, code, locale))
                .collect(Collectors.joining(", "));
    }

    private String withValue(String key, String value, Locale locale) {
        return text(key, locale).replace("{value}", value);
    }

    private String text(String key, Locale locale) {
        return messages.getMessage(PREFIX + key, null, locale);
    }
}
