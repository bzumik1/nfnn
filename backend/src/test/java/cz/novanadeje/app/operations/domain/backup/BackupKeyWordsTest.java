package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackupKeyWordsTest {

    @Test
    @DisplayName("Given a list that is not 2048 words long, when a wordlist is made of it, then it is refused")
    void should_refuse_when_made_given_a_list_of_another_length() {
        List<String> tooShort = distinctWords().subList(0, 2047);

        assertThatThrownBy(() -> new BackupKeyWords(tooShort)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("2048");
    }

    @Test
    @DisplayName("Given two words that start with the same four letters, when a wordlist is made of them, then it is refused")
    void should_refuse_when_made_given_two_words_with_one_prefix() {
        List<String> words = new ArrayList<>(distinctWords());
        words.set(1, words.getFirst() + "x");

        assertThatThrownBy(() -> new BackupKeyWords(words)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("four letters");
    }

    private static List<String> distinctWords() {
        return IntStream.range(0, 2048).mapToObj(BackupKeyWordsTest::word).toList();
    }

    private static String word(int index) {
        char[] letters = new char[4];
        int rest = index;
        for (int i = 3; i >= 0; i--) {
            letters[i] = (char) ('a' + rest % 26);
            rest /= 26;
        }
        return new String(letters);
    }
}
