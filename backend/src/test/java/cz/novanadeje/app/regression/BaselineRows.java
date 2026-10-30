package cz.novanadeje.app.regression;

import cz.novanadeje.app.support.DatabaseCleaner;
import cz.novanadeje.app.support.MutableClock;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

public final class BaselineRows {

    public static final String DESCRIPTION = "The rows hold only the columns the computation reads: a runner fills every other column with any valid value. "
            + "A donor is a donor_record row (registeredAt and erasedAt instants); a payment a bank_payment row (bookedOn, amountMinor, and unpairedByAdminAt, the instant an administrator unpaired it or null); "
            + "a donation a donation row of a donor, with the payment it was paired from (a bank transfer) or none (MANUAL), status RECEIVED or REFUNDED "
            + "and purpose GENERAL or ACCOUNT_VERIFICATION. A payment no donation points to is unpaired. now is the server clock; the foundation's calendar is Prague's.";
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final String UNPAIRED_BY_ADMIN_AT = "T13:00:00Z";
    private static final long ID_HIGH = 0x0190a000_0000_7000L;
    private static final long ID_LOW = 0x8000_0000_0000_0000L;
    private static final int ADMINISTRATOR = 0x999;

    private final String now;
    private final List<Donor> donors = new ArrayList<>();
    private final List<Payment> payments = new ArrayList<>();
    private final List<Gift> donations = new ArrayList<>();
    private final Map<String, UUID> ids = new LinkedHashMap<>();

    private BaselineRows(String now) {
        this.now = now;
    }

    public static BaselineRows at(String now) {
        return new BaselineRows(now);
    }

    public static BaselineRows fromJson(JsonNode input) {
        BaselineRows rows = new BaselineRows(input.get("now").asString());
        input.get("donors").forEach(donor -> rows.donors.add(new Donor(donor.get("alias").asString(), donor.get("registeredAt").asString(),
                optional(donor.get("erasedAt")))));
        input.get("payments").forEach(payment -> rows.payments.add(new Payment(payment.get("alias").asString(), payment.get("bookedOn").asString(),
                payment.get("amountMinor").asLong(), optional(payment.get("unpairedByAdminAt")))));
        input.get("donations").forEach(gift -> rows.donations.add(new Gift(gift.get("donor").asString(), optional(gift.get("payment")),
                gift.get("receivedOn").asString(), gift.get("amountMinor").asLong(), gift.get("status").asString(), gift.get("source").asString(),
                gift.get("purpose").asString())));
        return rows;
    }

    private static Optional<String> optional(JsonNode value) {
        return value == null || value.isNull() ? Optional.empty() : Optional.of(value.asString());
    }

    public BaselineRows now(String instant) {
        BaselineRows moved = new BaselineRows(instant);
        moved.donors.addAll(donors);
        moved.payments.addAll(payments);
        moved.donations.addAll(donations);
        return moved;
    }

    public BaselineRows donor(String alias, String registeredAt) {
        donors.add(new Donor(alias, registeredAt, Optional.empty()));
        return this;
    }

    public BaselineRows erasedDonor(String alias, String registeredAt, String erasedAt) {
        donors.add(new Donor(alias, registeredAt, Optional.of(erasedAt)));
        return this;
    }

    public BaselineRows gift(String donor, String day, long amountMinor) {
        return bankDonation(donor, day, amountMinor, "RECEIVED", "GENERAL");
    }

    public BaselineRows refunded(String donor, String day, long amountMinor) {
        return bankDonation(donor, day, amountMinor, "REFUNDED", "GENERAL");
    }

    public BaselineRows verification(String donor, String day, long amountMinor) {
        return bankDonation(donor, day, amountMinor, "RECEIVED", "ACCOUNT_VERIFICATION");
    }

    public BaselineRows manual(String donor, String day, long amountMinor) {
        donations.add(new Gift(donor, Optional.empty(), day, amountMinor, "RECEIVED", "MANUAL", "GENERAL"));
        return this;
    }

    public BaselineRows unpaired(String day, long amountMinor) {
        payments.add(new Payment("p" + (payments.size() + 1), day, amountMinor, Optional.empty()));
        return this;
    }

    public BaselineRows unpairedByAdmin(String day, long amountMinor) {
        payments.add(new Payment("p" + (payments.size() + 1), day, amountMinor, Optional.of(day + UNPAIRED_BY_ADMIN_AT)));
        return this;
    }

    private BaselineRows bankDonation(String donor, String day, long amountMinor, String status, String purpose) {
        Payment payment = new Payment("p" + (payments.size() + 1), day, amountMinor, Optional.empty());
        payments.add(payment);
        donations.add(new Gift(donor, Optional.of(payment.alias()), day, amountMinor, status, "BANK_TRANSFER", purpose));
        return this;
    }

    public UUID donorId(String alias) {
        return ids.get("donor:" + alias);
    }

    public static UUID administratorId() {
        return new UUID(ID_HIGH, ID_LOW + ADMINISTRATOR);
    }

    public void write(JdbcClient jdbc, MutableClock clock) {
        new DatabaseCleaner(jdbc).emptyAllTables();
        clock.set(Instant.parse(now));
        ids.clear();
        int sequence = 0;
        for (Donor donor : donors) {
            UUID id = id("donor:" + donor.alias(), ++sequence);
            jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, "
                            + "preferred_locale, registered_at, updated_at, erased_at) values (:id, 'PERSON', :name, null, 'Dlouhá 12', 'Ústí nad Labem', "
                            + "'400 01', :symbol, 'cs', :registered, :registered, :erased)")
                    .param("id", id)
                    .param("name", "Dárce " + donor.alias())
                    .param("symbol", Long.toString(4000000000L + sequence))
                    .param("registered", timestamp(donor.registeredAt()))
                    .param("erased", donor.erasedAt().map(BaselineRows::timestamp).orElse(null))
                    .update();
        }
        for (Payment payment : payments) {
            UUID id = id("payment:" + payment.alias(), ++sequence);
            jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                            + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                            + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) values (:id, :transaction, :booked, "
                            + ":amount, 'CZK', '2900233333', '2010', '2900233333', '2010', null, null, null, null, null, null, 'Bezhotovostní příjem', :imported, :unpairedAt)")
                    .param("id", id)
                    .param("transaction", 26000000000L + sequence)
                    .param("booked", LocalDate.parse(payment.bookedOn()))
                    .param("amount", payment.amountMinor())
                    .param("imported", timestamp(payment.bookedOn() + "T12:00:00Z"))
                    .param("unpairedAt", payment.unpairedByAdminAt().map(BaselineRows::timestamp).orElse(null))
                    .update();
        }
        for (Gift gift : donations) {
            UUID id = id("donation:" + (++sequence), sequence);
            jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by, "
                            + "recorded_at, sender_account_id, purpose, symbol_claim_id) values (:id, :donor, :payment, :received, :amount, 'CZK', :source, "
                            + ":status, :pairedBy, :recorded, null, :purpose, null)")
                    .param("id", id)
                    .param("donor", donorId(gift.donor()))
                    .param("payment", gift.payment().map(alias -> ids.get("payment:" + alias)).orElse(null))
                    .param("received", LocalDate.parse(gift.receivedOn()))
                    .param("amount", gift.amountMinor())
                    .param("source", gift.source())
                    .param("status", gift.status())
                    .param("pairedBy", gift.payment().isPresent() ? "VARIABLE_SYMBOL" : null)
                    .param("recorded", timestamp(gift.receivedOn() + "T12:00:00Z"))
                    .param("purpose", gift.purpose())
                    .update();
        }
    }

    public ObjectNode toJson() {
        ObjectNode input = NODES.objectNode();
        input.put("now", now);
        input.set("donors", array(donors, donor -> {
            ObjectNode node = NODES.objectNode();
            node.put("alias", donor.alias());
            node.put("registeredAt", donor.registeredAt());
            donor.erasedAt().ifPresentOrElse(at -> node.put("erasedAt", at), () -> node.putNull("erasedAt"));
            return node;
        }));
        input.set("payments", array(payments, payment -> {
            ObjectNode node = NODES.objectNode();
            node.put("alias", payment.alias());
            node.put("bookedOn", payment.bookedOn());
            node.put("amountMinor", payment.amountMinor());
            payment.unpairedByAdminAt().ifPresentOrElse(at -> node.put("unpairedByAdminAt", at), () -> node.putNull("unpairedByAdminAt"));
            return node;
        }));
        input.set("donations", array(donations, gift -> {
            ObjectNode node = NODES.objectNode();
            node.put("donor", gift.donor());
            gift.payment().ifPresentOrElse(alias -> node.put("payment", alias), () -> node.putNull("payment"));
            node.put("receivedOn", gift.receivedOn());
            node.put("amountMinor", gift.amountMinor());
            node.put("status", gift.status());
            node.put("source", gift.source());
            node.put("purpose", gift.purpose());
            return node;
        }));
        return input;
    }

    public static Timestamp timestamp(String instant) {
        return Timestamp.from(Instant.parse(instant));
    }

    private UUID id(String key, int sequence) {
        UUID id = new UUID(ID_HIGH, ID_LOW + sequence);
        ids.put(key, id);
        return id;
    }

    private static <T> ArrayNode array(List<T> items, Function<T, ObjectNode> mapper) {
        ArrayNode array = NODES.arrayNode();
        items.stream().map(mapper).forEach(array::add);
        return array;
    }

    private record Donor(String alias, String registeredAt, Optional<String> erasedAt) {
    }

    private record Payment(String alias, String bookedOn, long amountMinor, Optional<String> unpairedByAdminAt) {
    }

    private record Gift(String donor, Optional<String> payment, String receivedOn, long amountMinor, String status, String source, String purpose) {
    }
}
