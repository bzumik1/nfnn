package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyTest {

    static final String AGE_KEYGEN_KEY = "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH";
    static final String OTHER_AGE_KEYGEN_KEY = "AGE-SECRET-KEY-1ARXU2VF0GAFA8YLTUXNPDZE0UV33WNCJJEUWM3C2RKSR7A829JTS8HRKXT";

    @ParameterizedTest
    @ValueSource(strings = {AGE_KEYGEN_KEY, OTHER_AGE_KEYGEN_KEY, "AGE-SECRET-KEY-16EE9SQK4P76QTFJDUKNZN2W04PSXA8P5PKD7HWU5W6KYHAQQNVZSRMUG2S"})
    @DisplayName("Given a key written by age-keygen, when it is read, then it is a backup key")
    void should_accept_key_when_read_given_written_by_age_keygen(String written) {
        assertThat(new BackupKey(written).value()).isEqualTo(written);
    }

    @Test
    @DisplayName("Given a key pasted in lower case with spaces around it, when it is read, then it is the same key in capitals")
    void should_normalise_key_when_read_given_lower_case_with_spaces() {
        assertThat(new BackupKey("  " + AGE_KEYGEN_KEY.toLowerCase() + "\n")).isEqualTo(new BackupKey(AGE_KEYGEN_KEY));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWJ",
            "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GW",
            "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKTB6GWH",
            "AGE-SECRET-KEY-2R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH",
            "AGE1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH",
            "age1x03z5f8x6k633vj3tm2qrlregxm25744ytaka6peqh9wv3darsfqgdzyk0",
            "R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH",
            "",
            "   "})
    @DisplayName("Given a mistyped key, a public key or no key, when it is read, then it is refused")
    void should_refuse_key_when_read_given_mistyped(String typed) {
        assertThatThrownBy(() -> new BackupKey(typed)).isInstanceOf(InvalidBackupKey.class);
    }

    @Test
    @DisplayName("Given no text, when it is read, then it is refused")
    void should_refuse_key_when_read_given_null() {
        assertThatThrownBy(() -> new BackupKey(null)).isInstanceOf(InvalidBackupKey.class);
    }

    @Test
    @DisplayName("Given a key, when its check is asked for, then it is the last four characters")
    void should_give_last_four_characters_when_check_asked() {
        assertThat(new BackupKey(AGE_KEYGEN_KEY).lastCharacters()).isEqualTo("6GWH");
    }

    @ParameterizedTest
    @ValueSource(strings = {"6GWH", "6gwh", " 6GWH "})
    @DisplayName("Given the last four characters typed in any case, when they are checked, then they match")
    void should_match_check_when_checked_given_last_four_characters(String typed) {
        assertThat(new BackupKey(AGE_KEYGEN_KEY).matchesCheck(typed)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"6GWJ", "GWH", "T6GWH", ""})
    @DisplayName("Given other characters, when they are checked, then they do not match")
    void should_not_match_check_when_checked_given_other_characters(String typed) {
        assertThat(new BackupKey(AGE_KEYGEN_KEY).matchesCheck(typed)).isFalse();
        assertThat(new BackupKey(AGE_KEYGEN_KEY).matchesCheck(null)).isFalse();
    }

    @Test
    @DisplayName("Given two keys, when their fingerprints are compared, then each key has its own stable fingerprint")
    void should_give_stable_fingerprint_when_asked() {
        BackupKey key = new BackupKey(AGE_KEYGEN_KEY);

        assertThat(key.fingerprint()).hasSize(64).isEqualTo(new BackupKey(AGE_KEYGEN_KEY.toLowerCase()).fingerprint())
                .isNotEqualTo(new BackupKey(OTHER_AGE_KEYGEN_KEY).fingerprint()).doesNotContain(AGE_KEYGEN_KEY);
    }

    @Test
    @DisplayName("Given a key, when it is printed, then the key itself is masked")
    void should_mask_key_when_printed() {
        assertThat(new BackupKey(AGE_KEYGEN_KEY).toString()).doesNotContain("R45A").doesNotContain("6GWH");
    }
}
