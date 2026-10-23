package cz.novanadeje.app.shared.infrastructure.search;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AccentFoldingTest {

    @Test
    @DisplayName("Given the accented and the plain letters, when they are compared, then each accented letter has its plain partner")
    void should_pair_every_accented_letter_when_compared_given_both_tables() {
        assertThat(AccentFolding.ACCENTED).hasSameSizeAs(AccentFolding.PLAIN);
        assertThat(AccentFolding.PLAIN).matches("[a-z]+");
    }

    @Test
    @DisplayName("Given Czech and Slovak text in any case, when it is folded, then the accents go and the letters are lower case")
    void should_drop_accents_and_lower_case_when_folded_given_czech_text() {
        assertThat(AccentFolding.fold("Příliš ŽLUŤOUČKÝ kůň úpěl ďábelské ódy")).isEqualTo("prilis zlutoucky kun upel dabelske ody");
        assertThat(AccentFolding.fold("Ľubomír Kŕdeľ, Müller, Öhler")).isEqualTo("lubomir krdel, muller, ohler");
        assertThat(AccentFolding.fold("100% jana_novakova@example.cz")).isEqualTo("100% jana_novakova@example.cz");
    }
}
