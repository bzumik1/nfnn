package cz.novanadeje.fio;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.cfg.JsonNodeFeature;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class FioStatementParser {

    private static final ZoneId BANK_TIME_ZONE = ZoneId.of("Europe/Prague");
    private static final Pattern DATE_WITH_OPTIONAL_OFFSET = Pattern.compile("(\\d{4}-\\d{2}-\\d{2})(Z|[+-]\\d{2}:?\\d{2})?");
    private static final Pattern EPOCH_MILLISECONDS = Pattern.compile("-?\\d{1,18}");
    private static final Pattern COLUMN_KEY = Pattern.compile("column(\\d{1,9})");

    private final JsonMapper mapper = JsonMapper.builder()
            .enable(JsonNodeFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();

    FioStatement parse(String json) {
        JsonNode statement = readTree(json).path("accountStatement");
        if (!statement.isObject()) {
            throw new MalformedStatementException("The body has no accountStatement object");
        }
        return new FioStatement(
                info(statement.path("info")),
                transactions(statement.path("transactionList").path("transaction")));
    }

    private JsonNode readTree(String json) {
        try {
            return mapper.readTree(json);
        } catch (JacksonException e) {
            throw new MalformedStatementException("The body is not valid JSON", e);
        }
    }

    private FioAccountInfo info(JsonNode info) {
        if (!info.isObject()) {
            throw new MalformedStatementException("The statement has no info object");
        }
        Function<String, RawValue> field = name -> new RawValue("info." + name, textOf(info.get(name)));
        return new FioAccountInfo(
                field.apply("accountId").requiredText(),
                field.apply("bankId").optionalText(),
                field.apply("currency").requiredText(),
                field.apply("iban").requiredText(),
                field.apply("bic").requiredText(),
                field.apply("openingBalance").requiredDecimal(),
                field.apply("closingBalance").requiredDecimal(),
                field.apply("dateStart").optionalDate(),
                field.apply("dateEnd").optionalDate(),
                field.apply("idFrom").optionalLong(),
                field.apply("idTo").optionalLong(),
                field.apply("idLastDownload").optionalLong());
    }

    private List<FioTransaction> transactions(JsonNode transactions) {
        if (transactions.isMissingNode() || transactions.isNull()) {
            return List.of();
        }
        if (!transactions.isArray()) {
            throw new MalformedStatementException("transactionList.transaction is not an array");
        }
        List<FioTransaction> parsed = new ArrayList<>();
        for (JsonNode transaction : transactions) {
            parsed.add(transaction(transaction));
        }
        return parsed;
    }

    private FioTransaction transaction(JsonNode transaction) {
        if (!transaction.isObject()) {
            throw new MalformedStatementException("A transaction is not an object");
        }
        Map<Integer, FioColumn> columns = columns(transaction);
        Function<Column, RawValue> column = known -> known.valueIn(columns);
        return new FioTransaction(
                column.apply(Column.MOVEMENT_ID).requiredLong(),
                column.apply(Column.DATE).requiredDate(),
                column.apply(Column.AMOUNT).requiredDecimal(),
                column.apply(Column.CURRENCY).requiredText(),
                column.apply(Column.COUNTERPARTY_ACCOUNT).optionalText(),
                column.apply(Column.COUNTERPARTY_BANK_CODE).optionalText(),
                column.apply(Column.COUNTERPARTY_BANK_NAME).optionalText(),
                column.apply(Column.COUNTERPARTY_NAME).optionalText(),
                column.apply(Column.CONSTANT_SYMBOL).optionalText(),
                column.apply(Column.VARIABLE_SYMBOL).optionalText(),
                column.apply(Column.SPECIFIC_SYMBOL).optionalText(),
                column.apply(Column.USER_IDENTIFICATION).optionalText(),
                column.apply(Column.TYPE).requiredText(),
                column.apply(Column.EXECUTED_BY).optionalText(),
                column.apply(Column.MESSAGE_FOR_RECIPIENT).optionalText(),
                column.apply(Column.INSTRUCTION_ID).optionalLong(),
                column.apply(Column.DETAIL).optionalText(),
                column.apply(Column.COMMENT).optionalText(),
                column.apply(Column.BIC).optionalText(),
                column.apply(Column.PAYER_REFERENCE).optionalText(),
                columns);
    }

    private static Map<Integer, FioColumn> columns(JsonNode transaction) {
        Map<Integer, FioColumn> columns = new TreeMap<>();
        for (Map.Entry<String, JsonNode> property : transaction.properties()) {
            JsonNode column = property.getValue();
            Integer id = column.isObject() ? columnId(property.getKey(), column) : null;
            if (id != null) {
                columns.put(id, new FioColumn(id, textOf(column.get("name")), textOf(column.get("value"))));
            }
        }
        return columns;
    }

    private static Integer columnId(String key, JsonNode column) {
        JsonNode id = column.get("id");
        if (id != null && id.isIntegralNumber() && id.canConvertToInt()) {
            return id.intValue();
        }
        Matcher matcher = COLUMN_KEY.matcher(key);
        return matcher.matches() ? Integer.valueOf(matcher.group(1)) : null;
    }

    private static String textOf(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        if (node.isString()) {
            return node.stringValue();
        }
        if (node.isNumber()) {
            return node.decimalValue().toPlainString();
        }
        return node.toString();
    }

    private enum Column {
        DATE(0, "Datum"),
        AMOUNT(1, "Objem"),
        COUNTERPARTY_ACCOUNT(2, "Protiúčet"),
        COUNTERPARTY_BANK_CODE(3, "Kód banky"),
        CONSTANT_SYMBOL(4, "KS"),
        VARIABLE_SYMBOL(5, "VS"),
        SPECIFIC_SYMBOL(6, "SS"),
        USER_IDENTIFICATION(7, "Uživatelská identifikace"),
        TYPE(8, "Typ"),
        EXECUTED_BY(9, "Provedl"),
        COUNTERPARTY_NAME(10, "Název protiúčtu"),
        COUNTERPARTY_BANK_NAME(12, "Název banky"),
        CURRENCY(14, "Měna"),
        MESSAGE_FOR_RECIPIENT(16, "Zpráva pro příjemce"),
        INSTRUCTION_ID(17, "ID pokynu"),
        DETAIL(18, "Upřesnění"),
        MOVEMENT_ID(22, "ID pohybu"),
        COMMENT(25, "Komentář"),
        BIC(26, "BIC"),
        PAYER_REFERENCE(27, "Reference plátce");

        private final int id;
        private final String documentedName;

        Column(int id, String documentedName) {
            this.id = id;
            this.documentedName = documentedName;
        }

        RawValue valueIn(Map<Integer, FioColumn> columns) {
            FioColumn column = columns.get(id);
            return new RawValue("column " + id + " (" + documentedName + ")", column == null ? null : column.value());
        }
    }

    private record RawValue(String label, String text) {

        String optionalText() {
            return text == null || text.isBlank() ? null : text;
        }

        String requiredText() {
            String value = optionalText();
            if (value == null) {
                throw new MalformedStatementException(label + " is missing");
            }
            return value;
        }

        BigDecimal requiredDecimal() {
            return converted(requiredText(), BigDecimal::new, "a decimal number");
        }

        long requiredLong() {
            return converted(requiredText(), Long::valueOf, "a whole number");
        }

        Long optionalLong() {
            String value = optionalText();
            return value == null ? null : converted(value, Long::valueOf, "a whole number");
        }

        LocalDate requiredDate() {
            return converted(requiredText(), RawValue::toDate, "a date");
        }

        LocalDate optionalDate() {
            String value = optionalText();
            return value == null ? null : converted(value, RawValue::toDate, "a date");
        }

        private static LocalDate toDate(String value) {
            Matcher date = DATE_WITH_OPTIONAL_OFFSET.matcher(value);
            if (date.matches()) {
                return LocalDate.parse(date.group(1));
            }
            if (EPOCH_MILLISECONDS.matcher(value).matches()) {
                return Instant.ofEpochMilli(Long.parseLong(value)).atZone(BANK_TIME_ZONE).toLocalDate();
            }
            throw new DateTimeException("Unknown date format");
        }

        private <T> T converted(String value, Function<String, T> conversion, String expected) {
            try {
                return conversion.apply(value);
            } catch (NumberFormatException | DateTimeException e) {
                throw new MalformedStatementException(label + " is not " + expected + ": '" + value + "'", e);
            }
        }
    }
}
