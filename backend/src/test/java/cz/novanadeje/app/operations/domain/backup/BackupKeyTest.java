package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

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
    @DisplayName("Given a key, when three of its words are checked as written on paper, then they match")
    void should_match_words_when_checked_given_words_of_key() {
        BackupKey key = new BackupKey(AGE_KEYGEN_KEY);

        assertThat(key.matches(List.of(new BackupKeyWordCheck(2, "komora"), new BackupKeyWordCheck(13, "MOTI"), new BackupKeyWordCheck(24, " studna ")))).isTrue();
        assertThat(key.words()).hasSize(24).startsWith("divoch", "komora").endsWith("moudrost", "studna");
    }

    @Test
    @DisplayName("Given a key, when a word at another position or a mistyped word is checked, then they do not match")
    void should_not_match_words_when_checked_given_wrong_word() {
        BackupKey key = new BackupKey(AGE_KEYGEN_KEY);

        assertThat(key.matches(List.of(new BackupKeyWordCheck(2, "komora"), new BackupKeyWordCheck(13, "motivace"), new BackupKeyWordCheck(24, "moudrost")))).isFalse();
        assertThat(key.matches(List.of(new BackupKeyWordCheck(2, "komoda"), new BackupKeyWordCheck(13, "motivace"), new BackupKeyWordCheck(24, "studna")))).isFalse();
        assertThat(key.matches(List.of(new BackupKeyWordCheck(2, "kom"), new BackupKeyWordCheck(13, "motivace"), new BackupKeyWordCheck(24, "studna")))).isFalse();
    }

    @Test
    @DisplayName("Given no checked words, when they are checked, then they do not match")
    void should_not_match_words_when_checked_given_none() {
        assertThat(new BackupKey(AGE_KEYGEN_KEY).matches(List.of())).isFalse();
    }

    @Test
    @DisplayName("Given a key, when it is read from its 24 words, then it is the same key")
    void should_read_key_when_parsed_given_its_words() {
        assertThat(BackupKey.parse("divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon "
                + "motivace naivita zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat moudrost studna")).isEqualTo(new BackupKey(AGE_KEYGEN_KEY));
        assertThat(BackupKey.parse(AGE_KEYGEN_KEY.toLowerCase())).isEqualTo(new BackupKey(AGE_KEYGEN_KEY));
    }

    @Test
    @DisplayName("Given no text, when it is parsed, then it is refused")
    void should_refuse_text_when_parsed_given_null() {
        assertThatThrownBy(() -> BackupKey.parse(null)).isInstanceOf(InvalidBackupKey.class);
        assertThatThrownBy(() -> BackupKey.parse("slovo ".repeat(BackupKey.MAX_PARSED_LENGTH))).isInstanceOf(InvalidBackupKey.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {AGE_KEYGEN_KEY, " age-secret-key-1r45a984exxafc85yzsygy9r6xjtd4e9aky65zcrgpdq89e7anw8qkt6gwh ", "AGE-SECRET-KEY-1"})
    @DisplayName("Given a value that starts like a backup key, when it is looked at, then it looks like one")
    void should_look_like_key_when_looked_at_given_key_prefix(String value) {
        assertThat(BackupKey.looksLikeOne(value)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"xkeysib-0123456789abcdef", "AGE1R45A984EXXAFC85", ""})
    @DisplayName("Given a password or a token, when it is looked at, then it does not look like a backup key")
    void should_not_look_like_key_when_looked_at_given_other_secret(String value) {
        assertThat(BackupKey.looksLikeOne(value)).isFalse();
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
