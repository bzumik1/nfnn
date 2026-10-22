package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class CounterpartyNamesTest {

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"ABC s.r.o.", "ABC s. r. o.", "ABC S.R.O", "ABC SRO", "ABC, spol. s r.o.", "Novák a spol.", "Strojírny a.s.",
            "STROJIRNY AS", "Klub z.s.", "Klub z. s.", "Pomoc o.p.s.", "POMOC OPS", "Novák v.o.s.", "Investice k.s.", "Hospic z.ú.",
            "Hospic z. u.", "Energie SE", "Bytové družstvo Lípa", "BYTOVE DRUZSTVO", "Nadace Dobrý den", "Nadační fond Nová naděje",
            "Spolek přátel", "Studio K s.r.o.", "Tiskárna M a.s.", "Stavby Novák, společnost s ručením omezeným", "STAVBY NOVAK SPOLECNOST S RUCENIM",
            "Strojírny, akciová společnost", "Hospic sv. Jana, zapsaný ústav", "Lesy ČR, s.p.", "Lesy CR SP", "ABC, s. p.", "Základní škola, p.o.",
            "SVJ Lipová 5", "Obec Lipová", "Město Nový Bor"})
    @DisplayName("Given a name with a Czech legal form written with or without spaces, dots, capitals or diacritics, when read, then it looks like a legal entity")
    void should_look_like_legal_entity_when_read_given_czech_legal_form(String name) {
        assertThat(CounterpartyNames.looksLikeLegalEntity(name)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"Nováková Jana", "NOVAK JAN", "Jan Novák", "NOVAK JAN ING.", "Ing. Jan Novák, Ph.D.", "Tomáš Kasal", "Sroková Eva",
            "Jan Sron", "Jan Spolný", "Aspen Petr", "Zsolt Novák", "Opsatová Eva", "Vosáhlo Petr", "Kšír Ondřej", "Zuzana Nová", "Seifert Jan",
            "SEIFERT JAN", "Jan K. Sedláček", "Pospíšil Jan", "Obecný Petr", "Městský Jan"})
    @DisplayName("Given a person's name, even one that starts or ends with the letters of a legal form, when read, then it does not look like a legal entity")
    void should_not_look_like_legal_entity_when_read_given_persons_name(String name) {
        assertThat(CounterpartyNames.looksLikeLegalEntity(name)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"Novák A. S.", "Jan de Vos", "Petr Se"})
    @DisplayName("Given a person's name whose initials or surname spell a legal form, when read, then it is taken for a legal entity, which only withholds an offer")
    void should_look_like_legal_entity_when_read_given_known_false_positive(String name) {
        assertThat(CounterpartyNames.looksLikeLegalEntity(name)).isTrue();
    }

    @Test
    @DisplayName("Given an absent or blank name, when checked against either donor type, then it fits")
    void should_fit_when_checked_given_absent_or_blank_name() {
        for (DonorType type : DonorType.values()) {
            assertThat(CounterpartyNames.fitsDonorType(type, Optional.empty())).isTrue();
            assertThat(CounterpartyNames.fitsDonorType(type, Optional.of("   "))).isTrue();
        }
    }

    @Test
    @DisplayName("Given a person donor, when checked against a person's name and a legal entity's name, then only the person's name fits")
    void should_fit_only_persons_name_when_checked_given_person_donor() {
        assertThat(CounterpartyNames.fitsDonorType(DonorType.PERSON, Optional.of("Nováková Jana"))).isTrue();
        assertThat(CounterpartyNames.fitsDonorType(DonorType.PERSON, Optional.of("ABC s.r.o."))).isFalse();
    }

    @Test
    @DisplayName("Given a company donor, when checked against a person's name and a legal entity's name, then only the legal entity's name fits")
    void should_fit_only_legal_entity_name_when_checked_given_company_donor() {
        assertThat(CounterpartyNames.fitsDonorType(DonorType.COMPANY, Optional.of("Nováková Jana"))).isFalse();
        assertThat(CounterpartyNames.fitsDonorType(DonorType.COMPANY, Optional.of("ABC s.r.o."))).isTrue();
    }

    @Test
    @DisplayName("Given a missing name or donor type, when checked, then it is refused")
    void should_refuse_when_checked_given_missing_parts() {
        assertThatIllegalArgumentException().isThrownBy(() -> CounterpartyNames.looksLikeLegalEntity(null));
        assertThatIllegalArgumentException().isThrownBy(() -> CounterpartyNames.fitsDonorType(null, Optional.of("Nováková Jana")));
        assertThatIllegalArgumentException().isThrownBy(() -> CounterpartyNames.fitsDonorType(DonorType.PERSON, null));
    }
}
