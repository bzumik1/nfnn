package cz.novanadeje.fio;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import static cz.novanadeje.fio.Fixtures.DOCUMENTATION_EXAMPLE_WITH_EPOCH_DATES;
import static cz.novanadeje.fio.Fixtures.PERIODS_STATEMENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

class FioStatementParserTest {

    private static final String MINIMAL_INFO = """
            {"accountId":"2400222222","currency":"CZK","iban":"CZ7920100000002400222222","bic":"FIOBCZPPXXX",\
            "openingBalance":10.00,"closingBalance":11.00}""";

    private final FioStatementParser parser = new FioStatementParser();

    @Test
    void should_map_info_block_when_parsed_given_periods_statement() {
        FioStatement statement = parser.parse(Fixtures.read(PERIODS_STATEMENT));

        assertThat(statement.info()).isEqualTo(new FioAccountInfo(
                "2400222222",
                "2010",
                "CZK",
                "CZ7920100000002400222222",
                "FIOBCZPPXXX",
                new BigDecimal("195.00"),
                new BigDecimal("195.01"),
                LocalDate.of(2012, 6, 26),
                LocalDate.of(2012, 6, 30),
                1148734530L,
                1149190193L,
                1149190192L));
    }

    @Test
    void should_map_every_known_column_when_parsed_given_fully_filled_transaction() {
        FioTransaction transaction = parser.parse(Fixtures.read(PERIODS_STATEMENT)).transactions().getFirst();

        assertThat(transaction)
                .returns(1148734530L, FioTransaction::id)
                .returns(LocalDate.of(2012, 6, 26), FioTransaction::date)
                .returns(new BigDecimal("1.00"), FioTransaction::amount)
                .returns("CZK", FioTransaction::currency)
                .returns("2900233333", FioTransaction::counterpartyAccount)
                .returns("2010", FioTransaction::counterpartyBankCode)
                .returns("Fio banka, a.s.", FioTransaction::counterpartyBankName)
                .returns("Pavel, Novák", FioTransaction::counterpartyName)
                .returns("0558", FioTransaction::constantSymbol)
                .returns("1234567890", FioTransaction::variableSymbol)
                .returns("0002", FioTransaction::specificSymbol)
                .returns("Nákup: PENNY MARKET s.r.o., Jaromer, CZ", FioTransaction::userIdentification)
                .returns("Příjem převodem uvnitř banky", FioTransaction::type)
                .returns("Béďa Trávníček", FioTransaction::executedBy)
                .returns("Libovolný text, který se zobrazí příjemci platby", FioTransaction::messageForRecipient)
                .returns(2105685816L, FioTransaction::instructionId)
                .returns("15.90 EUR", FioTransaction::detail)
                .returns("Hračky pro děti v PENNY MARKET", FioTransaction::comment)
                .returns("UNCRITMMXXX", FioTransaction::bic)
                .returns("2000000003", FioTransaction::payerReference);
    }

    @Test
    void should_keep_minus_sign_and_scale_when_parsed_given_outgoing_and_small_amounts() {
        List<FioTransaction> transactions = parser.parse(Fixtures.read(PERIODS_STATEMENT)).transactions();

        assertThat(transactions).extracting(FioTransaction::amount)
                .containsExactly(new BigDecimal("1.00"), new BigDecimal("-1.00"), new BigDecimal("0.01"));
    }

    @Test
    void should_leave_optional_fields_null_when_parsed_given_null_or_blank_columns() {
        List<FioTransaction> transactions = parser.parse(Fixtures.read(PERIODS_STATEMENT)).transactions();
        FioTransaction outgoing = transactions.get(1);
        FioTransaction interest = transactions.get(2);

        assertThat(outgoing.counterpartyName()).isNull();
        assertThat(outgoing.variableSymbol()).isNull();
        assertThat(outgoing.userIdentification()).isNull();
        assertThat(outgoing.comment()).isNull();
        assertThat(interest)
                .returns(null, FioTransaction::counterpartyAccount)
                .returns(null, FioTransaction::counterpartyBankCode)
                .returns(null, FioTransaction::counterpartyBankName)
                .returns(null, FioTransaction::constantSymbol)
                .returns(null, FioTransaction::executedBy)
                .returns(null, FioTransaction::messageForRecipient)
                .returns(null, FioTransaction::detail)
                .returns(null, FioTransaction::bic)
                .returns(null, FioTransaction::payerReference)
                .returns("Připsaný úrok", FioTransaction::type)
                .returns(2107642322L, FioTransaction::instructionId);
    }

    @Test
    void should_keep_raw_columns_when_parsed_given_values_the_typed_fields_normalise() {
        FioTransaction outgoing = parser.parse(Fixtures.read(PERIODS_STATEMENT)).transactions().get(1);

        assertThat(outgoing.columns())
                .containsEntry(0, new FioColumn(0, "Datum", "2012-06-26+0200"))
                .containsEntry(1, new FioColumn(1, "Objem", "-1.00"))
                .containsEntry(7, new FioColumn(7, "Uživatelská identifikace", " "))
                .containsEntry(22, new FioColumn(22, "ID pohybu", "1148734781"))
                .doesNotContainKeys(5, 6, 10, 16, 18, 26);
        assertThat(List.copyOf(outgoing.columns().keySet())).isSorted();
    }

    @Test
    void should_keep_unknown_column_when_parsed_given_column_the_model_does_not_know() {
        FioTransaction transaction = parser.parse(Fixtures.read(PERIODS_STATEMENT)).transactions().getFirst();

        assertThat(transaction.columns()).containsEntry(30, new FioColumn(30, "Budoucí sloupec", "budoucí hodnota"));
    }

    @Test
    void should_read_dates_in_prague_time_when_parsed_given_documentation_example_with_epoch_milliseconds() {
        FioStatement statement = parser.parse(Fixtures.read(DOCUMENTATION_EXAMPLE_WITH_EPOCH_DATES));

        assertThat(statement.info().dateStart()).isEqualTo(LocalDate.of(2012, 6, 26));
        assertThat(statement.info().dateEnd()).isEqualTo(LocalDate.of(2012, 6, 30));
        assertThat(statement.transactions()).extracting(FioTransaction::date)
                .containsExactly(LocalDate.of(2012, 6, 26), LocalDate.of(2012, 6, 26), LocalDate.of(2012, 6, 30));
    }

    @Test
    void should_map_documentation_example_like_the_string_dated_fixture_when_parsed_given_epoch_milliseconds() {
        FioStatement documentationExample = parser.parse(Fixtures.read(DOCUMENTATION_EXAMPLE_WITH_EPOCH_DATES));

        assertThat(documentationExample.transactions())
                .extracting(FioTransaction::id, FioTransaction::amount, FioTransaction::counterpartyName, FioTransaction::instructionId)
                .containsExactly(
                        tuple(1148734530L, new BigDecimal("1.00"), "Pavel, Novák", 2105685816L),
                        tuple(1148734781L, new BigDecimal("-1.00"), null, 2105687343L),
                        tuple(1149190193L, new BigDecimal("0.01"), null, 2107642322L));
    }

    @ParameterizedTest
    @CsvSource({
            "2012-07-27+0200, 2012-07-27",
            "2012-07-27+02:00, 2012-07-27",
            "2012-01-15+0100, 2012-01-15",
            "2012-01-15-0500, 2012-01-15",
            "2012-01-15Z, 2012-01-15",
            "2012-01-15, 2012-01-15"
    })
    void should_take_calendar_date_when_parsed_given_date_with_or_without_offset(String raw, LocalDate expected) {
        FioStatement statement = parser.parse(statementWith(MINIMAL_INFO, transaction(replacing(0, "\"" + raw + "\""))));

        assertThat(statement.transactions().getFirst().date()).isEqualTo(expected);
    }

    @Test
    void should_leave_optional_info_null_when_parsed_given_last_download_without_movements() {
        String info = """
                {"accountId":"2400222222","bankId":"2010","currency":"CZK","iban":"CZ7920100000002400222222",\
                "bic":"FIOBCZPPXXX","openingBalance":185.05,"closingBalance":185.05,"dateStart":null,"dateEnd":null,\
                "yearList":null,"idList":null,"idFrom":null,"idTo":null,"idLastDownload":1150392361}""";

        FioStatement statement = parser.parse(statementWith(info, null));

        assertThat(statement.transactions()).isEmpty();
        assertThat(statement.info())
                .returns(null, FioAccountInfo::dateStart)
                .returns(null, FioAccountInfo::dateEnd)
                .returns(null, FioAccountInfo::idFrom)
                .returns(null, FioAccountInfo::idTo)
                .returns(1150392361L, FioAccountInfo::idLastDownload);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            ",\"transactionList\":null",
            ",\"transactionList\":{}",
            ",\"transactionList\":{\"transaction\":null}",
            ",\"transactionList\":{\"transaction\":[]}"
    })
    void should_return_no_transactions_when_parsed_given_empty_or_missing_transaction_list(String transactionList) {
        String json = "{\"accountStatement\":{\"info\":" + MINIMAL_INFO + transactionList + "}}";

        assertThat(parser.parse(json).transactions()).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "22, ID pohybu",
            "0, Datum",
            "1, Objem",
            "14, Měna",
            "8, Typ"
    })
    void should_reject_naming_the_column_when_parsed_given_transaction_without_mandatory_column(int columnId, String columnName) {
        String json = statementWith(MINIMAL_INFO, transaction(without(columnId)));

        assertThatThrownBy(() -> parser.parse(json))
                .isInstanceOf(MalformedStatementException.class)
                .hasMessageContaining("column " + columnId + " (" + columnName + ")");
    }

    @Test
    void should_reject_naming_the_column_when_parsed_given_mandatory_column_with_blank_value() {
        String json = statementWith(MINIMAL_INFO, transaction(replacing(14, "\" \"")));

        assertThatThrownBy(() -> parser.parse(json))
                .isInstanceOf(MalformedStatementException.class)
                .hasMessageContaining("column 14 (Měna)");
    }

    @ParameterizedTest
    @ValueSource(strings = {"accountId", "currency", "iban", "bic", "openingBalance", "closingBalance"})
    void should_reject_naming_the_field_when_parsed_given_info_without_mandatory_field(String field) {
        String info = MINIMAL_INFO.replaceFirst("\"" + field + "\":[^,}]+,?", "").replace(",}", "}");
        String json = statementWith(info, transaction(mandatoryColumns()));

        assertThatThrownBy(() -> parser.parse(json))
                .isInstanceOf(MalformedStatementException.class)
                .hasMessageContaining("info." + field);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "1|\"abc\"|column 1 (Objem)",
            "22|\"x1\"|column 22 (ID pohybu)",
            "17|\"x1\"|column 17 (ID pokynu)",
            "0|\"27.07.2012\"|column 0 (Datum)"
    })
    void should_reject_naming_the_column_when_parsed_given_value_of_wrong_type(int columnId, String jsonValue, String expected) {
        String json = statementWith(MINIMAL_INFO, transaction(replacing(columnId, jsonValue)));

        assertThatThrownBy(() -> parser.parse(json))
                .isInstanceOf(MalformedStatementException.class)
                .hasMessageContaining(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"<html><body>Chyba</body></html>", "{}", "[]", "{\"accountStatement\":{}}", ""})
    void should_reject_when_parsed_given_body_that_is_not_an_account_statement(String body) {
        assertThatThrownBy(() -> parser.parse(body)).isInstanceOf(MalformedStatementException.class);
    }

    private static String statementWith(String info, String transaction) {
        String transactions = transaction == null ? "" : transaction;
        return "{\"accountStatement\":{\"info\":" + info + ",\"transactionList\":{\"transaction\":[" + transactions + "]}}}";
    }

    private static String transaction(List<String> columns) {
        return "{" + String.join(",", columns) + "}";
    }

    private static List<String> mandatoryColumns() {
        return List.of(
                column(22, "ID pohybu", "1148734530"),
                column(0, "Datum", "\"2012-07-27+0200\""),
                column(1, "Objem", "1.00"),
                column(14, "Měna", "\"CZK\""),
                column(8, "Typ", "\"Příjem převodem uvnitř banky\""),
                column(17, "ID pokynu", "2105685816"));
    }

    private static List<String> without(int columnId) {
        return mandatoryColumns().stream()
                .filter(column -> !column.startsWith("\"column" + columnId + "\""))
                .collect(Collectors.toList());
    }

    private static List<String> replacing(int columnId, String jsonValue) {
        List<String> columns = new ArrayList<>(without(columnId));
        String name = mandatoryColumns().stream()
                .filter(column -> column.startsWith("\"column" + columnId + "\""))
                .map(column -> column.replaceFirst(".*\"name\":\"([^\"]*)\".*", "$1"))
                .findFirst()
                .orElseThrow();
        columns.add(column(columnId, name, jsonValue));
        return columns;
    }

    private static String column(int id, String name, String jsonValue) {
        return "\"column%d\":{\"value\":%s,\"name\":\"%s\",\"id\":%d}".formatted(id, jsonValue, name, id);
    }
}
