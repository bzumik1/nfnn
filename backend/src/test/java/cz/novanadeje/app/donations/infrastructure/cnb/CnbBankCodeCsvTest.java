package cz.novanadeje.app.donations.infrastructure.cnb;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CnbBankCodeCsvTest {

    static final String HEADER = "Kód platebního styku;Poskytovatel platebních služeb;BIC kód (SWIFT);Systém CERTIS";

    @Test
    @DisplayName("Given the list as the ČNB publishes it, when it is parsed, then every code comes with its name trimmed and sorted by code")
    void should_read_every_code_when_parsed_given_published_list() throws IOException {
        BankCodeList list = CnbBankCodeCsv.parse(published());

        assertThat(list.banks()).hasSize(47);
        assertThat(list.banks()).first().isEqualTo(bank("0100", "Komerční banka, a.s."));
        assertThat(list.banks()).contains(bank("0800", "Česká spořitelna, a.s."), bank("2100", "ČSOB Hypoteční banka, a.s."));
        assertThat(list.banks()).allSatisfy(bank -> assertThat(bank.name().value()).isEqualTo(bank.name().value().strip()));
        assertThat(list.banks()).extracting(bank -> bank.code().value()).isSorted();
    }

    @Test
    @DisplayName("Given a list without a byte order mark, with LF line ends and a final line end, when it is parsed, then it is read alike")
    void should_read_when_parsed_given_no_bom_and_lf() {
        assertThat(CnbBankCodeCsv.parse(utf8(HEADER + "\n" + rows(20, "\n") + "\n")).banks()).hasSize(20);
    }

    @Test
    @DisplayName("Given a wrong header, when it is parsed, then the whole list is refused")
    void should_refuse_when_parsed_given_wrong_header() {
        assertRefused("Kód;Poskytovatel;BIC;CERTIS\r\n" + rows(20, "\r\n"));
        assertRefused(rows(20, "\r\n"));
    }

    @Test
    @DisplayName("Given a row with a missing field, an extra field, a wrong code or an empty name, when it is parsed, then the whole list is refused")
    void should_refuse_when_parsed_given_malformed_row() {
        for (String row : new String[]{"0999;Banka;BIC", "0999;Banka;BIC;A;navíc", "999;Banka;BIC;A", "0999; ;BIC;A", "0999;Banka\u0007;BIC;A", ""}) {
            assertRefused(HEADER + "\r\n" + rows(20, "\r\n") + "\r\n" + row + "\r\n" + "0998;Banka;;A");
        }
    }

    @Test
    @DisplayName("Given one code twice, too few or too many rows, when it is parsed, then the whole list is refused")
    void should_refuse_when_parsed_given_duplicate_or_count_out_of_range() {
        assertRefused(HEADER + "\r\n" + rows(20, "\r\n") + "\r\n0000;Jiná banka;;A");
        assertRefused(HEADER + "\r\n" + rows(19, "\r\n"));
        assertRefused(HEADER + "\r\n" + rows(501, "\r\n"));
        assertRefused("");
    }

    @Test
    @DisplayName("Given bytes that are not UTF-8, when it is parsed, then the whole list is refused")
    void should_refuse_when_parsed_given_not_utf8() {
        assertThatThrownBy(() -> CnbBankCodeCsv.parse((HEADER + "\r\n" + rows(20, "\r\n")).getBytes(StandardCharsets.ISO_8859_1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    static byte[] published() throws IOException {
        try (InputStream in = CnbBankCodeCsvTest.class.getResourceAsStream("/donations/bank-codes/kody_bank_CR.csv")) {
            return in.readAllBytes();
        }
    }

    static String rows(int count, String lineEnd) {
        return IntStream.range(0, count).mapToObj(index -> "%04d;Banka %d, a.s. ;BANKCZPP;A".formatted(index, index)).collect(Collectors.joining(lineEnd));
    }

    private static void assertRefused(String csv) {
        assertThatThrownBy(() -> CnbBankCodeCsv.parse(utf8(csv))).isInstanceOf(IllegalArgumentException.class);
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static CzechBank bank(String code, String name) {
        return new CzechBank(new BankCode(code), new BankName(name));
    }
}
