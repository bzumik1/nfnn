package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

public record AdminActionPerformed(UUID adminId, String action, Optional<UUID> subjectId, String details, Optional<Facts> facts, Instant performedAt) {

    public static final UUID SERVER = new UUID(0, 0);
    public static final int MAX_ACTION_LENGTH = 64;
    public static final int MAX_DETAILS_LENGTH = 2000;

    public AdminActionPerformed {
        if (adminId == null || subjectId == null || facts == null || performedAt == null) {
            throw new IllegalArgumentException("An admin action names the admin, its subject and facts (even when absent) and its time");
        }
        action = requireText(action, "action", MAX_ACTION_LENGTH);
        details = requireText(details, "details", MAX_DETAILS_LENGTH);
        if (facts.isPresent() && !facts.get().belongTo(action)) {
            throw new IllegalArgumentException("The summary key of an admin action's facts is its action or a variant of it");
        }
    }

    public AdminActionPerformed(UUID adminId, String action, Optional<UUID> subjectId, String details, Instant performedAt) {
        this(adminId, action, subjectId, details, Optional.empty(), performedAt);
    }

    public AdminActionPerformed(UUID adminId, String action, Optional<UUID> subjectId, String details, Facts facts, Instant performedAt) {
        this(adminId, action, subjectId, details, Optional.of(facts), performedAt);
    }

    private static String requireText(String value, String name, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("An admin action needs " + name);
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException("The " + name + " of an admin action is at most " + maxLength + " characters");
        }
        return trimmed;
    }

    public record Facts(String summaryKey, Map<String, String> values) {

        public static final int MAX_VALUES = 16;
        public static final int MAX_VALUE_NAME_LENGTH = 32;
        public static final int MAX_SUMMARY_KEY_LENGTH = MAX_ACTION_LENGTH + 1 + MAX_VALUE_NAME_LENGTH;

        private static final Pattern SUMMARY_KEY = Pattern.compile("[A-Z][A-Z_]{0,63}(?:\\.[a-z][A-Za-z]{0,31})?");
        private static final Pattern VALUE_NAME = Pattern.compile("[a-z][A-Za-z]{0,31}");
        private static final char VARIANT_SEPARATOR = '.';

        public Facts {
            if (summaryKey == null || summaryKey.length() > MAX_SUMMARY_KEY_LENGTH || !SUMMARY_KEY.matcher(summaryKey).matches()) {
                throw new IllegalArgumentException("The summary key of admin action facts is an action, optionally with a variant after a dot");
            }
            if (values == null) {
                throw new IllegalArgumentException("Admin action facts need their values, even when there are none");
            }
            if (values.size() > MAX_VALUES) {
                throw new IllegalArgumentException("Admin action facts hold at most " + MAX_VALUES + " values");
            }
            int length = 0;
            for (Map.Entry<String, String> value : values.entrySet()) {
                if (value.getKey() == null || value.getKey().length() > MAX_VALUE_NAME_LENGTH || !VALUE_NAME.matcher(value.getKey()).matches()) {
                    throw new IllegalArgumentException("The name of an admin action fact is a lowercase word in camel case");
                }
                if (value.getValue() == null) {
                    throw new IllegalArgumentException("An admin action fact has a value");
                }
                length += value.getKey().length() + value.getValue().length();
            }
            if (length > MAX_DETAILS_LENGTH) {
                throw new IllegalArgumentException("Admin action facts are together at most " + MAX_DETAILS_LENGTH + " characters, as the details are");
            }
            values = Map.copyOf(values);
        }

        public static Facts of(String summaryKey) {
            return new Facts(summaryKey, Map.of());
        }

        public static Facts of(String summaryKey, Map<String, String> values) {
            return new Facts(summaryKey, values);
        }

        boolean belongTo(String action) {
            return summaryKey.equals(action)
                    || summaryKey.length() > action.length() && summaryKey.startsWith(action) && summaryKey.charAt(action.length()) == VARIANT_SEPARATOR;
        }
    }
}
