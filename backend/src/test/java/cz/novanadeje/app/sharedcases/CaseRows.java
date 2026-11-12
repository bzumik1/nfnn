package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.shared.domain.ErasedPersonalData;
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
import java.util.function.Consumer;
import java.util.function.Function;

public final class CaseRows {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final long ID_HIGH = 0x0190a000_0000_7000L;
    private static final long ID_LOW = 0x8000_0000_0000_0000L;
    private static final int ADMINISTRATOR = 0x999;
    private static final String ADMINISTRATOR_ALIAS = "administrator";
    private static final String DEFAULT_ACCOUNT = "2900233333/2010";

    private final String now;
    private final List<Donor> donors = new ArrayList<>();
    private final List<Payment> payments = new ArrayList<>();
    private final List<Gift> donations = new ArrayList<>();
    private final List<Link> links = new ArrayList<>();
    private final List<Claim> claims = new ArrayList<>();
    private final List<Receipt> receipts = new ArrayList<>();
    private final Map<String, UUID> ids = new LinkedHashMap<>();

    private CaseRows(String now) {
        this.now = now;
    }

    public static CaseRows fromJson(JsonNode input) {
        CaseRows rows = new CaseRows(input.get("now").asString());
        input.get("donors").forEach(donor -> rows.donors.add(new Donor(donor.get("alias").asString(), donor.get("registeredAt").asString(),
                optional(donor.get("erasedAt")), optional(donor.get("name")), optional(donor.get("type")), optional(donor.get("companyIdentifier")),
                optional(donor.get("variableSymbol")), Optional.ofNullable(donor.get("account")).filter(account -> !account.isNull()).map(Account::of))));
        input.get("payments").forEach(payment -> rows.payments.add(new Payment(payment.get("alias").asString(), payment.get("bookedOn").asString(),
                payment.get("amountMinor").asLong(), optional(payment.get("unpairedByAdminAt")), optional(payment.get("variableSymbol")),
                optional(payment.get("counterpartyAccount")), optional(payment.get("counterpartyName")), optional(payment.get("messageForRecipient")))));
        input.get("donations").forEach(gift -> rows.donations.add(new Gift(gift.get("donor").asString(), optional(gift.get("payment")),
                gift.get("receivedOn").asString(), gift.get("amountMinor").asLong(), gift.get("status").asString(), gift.get("source").asString(),
                gift.get("purpose").asString(), optional(gift.get("pairedBy")), optional(gift.get("bankAccount")), optional(gift.get("symbolClaim")),
                optional(gift.get("recordedAt")))));
        each(input.get("links"), link -> rows.links.add(new Link(link.get("alias").asString(), link.get("donor").asString(),
                link.get("accountNumber").asString(), link.get("status").asString(), link.get("learnedFrom").asString(), link.get("learnedAt").asString(),
                link.get("validFrom").asString(), optional(link.get("validTo")))));
        each(input.get("symbolClaims"), claim -> rows.claims.add(new Claim(claim.get("alias").asString(), claim.get("donor").asString(),
                claim.get("accountNumber").asString(), claim.get("variableSymbol").asString(), claim.get("answer").asString(),
                claim.get("answeredAt").asString())));
        each(input.get("receipts"), receipt -> rows.receipts.add(new Receipt(receipt.get("alias").asString(), receipt.get("donor").asString(),
                receipt.get("kind").asString(), Optional.ofNullable(receipt.get("year")).map(JsonNode::asInt),
                Optional.ofNullable(receipt.get("donation")).map(JsonNode::asInt), receipt.get("issuedAt").asString())));
        rows.assignIds();
        return rows;
    }

    private void assignIds() {
        ids.clear();
        int sequence = 0;
        for (Donor donor : donors) {
            id("donor:" + donor.alias(), ++sequence);
        }
        for (Payment payment : payments) {
            id("payment:" + payment.alias(), ++sequence);
        }
        for (int position = 1; position <= donations.size(); position++) {
            id("donation:" + position, ++sequence);
        }
        for (Link link : links) {
            id("link:" + link.alias(), ++sequence);
        }
        for (Claim claim : claims) {
            id("claim:" + claim.alias(), ++sequence);
        }
    }

    private static void each(JsonNode list, Consumer<JsonNode> row) {
        if (list != null && !list.isNull()) {
            list.forEach(row);
        }
    }

    static Optional<String> optional(JsonNode value) {
        return value == null || value.isNull() ? Optional.empty() : Optional.of(value.asString());
    }

    public UUID donorId(String alias) {
        return ids.get("donor:" + alias);
    }

    public UUID donationId(int position) {
        return ids.get("donation:" + position);
    }

    public List<ReceiptToIssue> receiptsToIssue() {
        return receipts.stream().map(receipt -> new ReceiptToIssue(receipt.alias(), donorId(receipt.donor()), receipt.kind().equals("YEARLY"),
                receipt.year(), receipt.donation().map(this::donationId), Instant.parse(receipt.issuedAt()))).toList();
    }

    public void issued(ReceiptToIssue receipt, UUID id) {
        ids.put("receipt:" + receipt.alias(), id);
    }

    public Instant now() {
        return Instant.parse(now);
    }

    public JsonNode aliased(JsonNode answer) {
        Map<String, String> aliases = new LinkedHashMap<>();
        ids.forEach((alias, id) -> aliases.put(id.toString(), alias));
        aliases.put(administratorId().toString(), ADMINISTRATOR_ALIAS);
        return aliased(answer, aliases);
    }

    private static JsonNode aliased(JsonNode node, Map<String, String> aliases) {
        if (node.isString()) {
            return NODES.stringNode(aliases.getOrDefault(node.asString(), node.asString()));
        }
        if (node.isArray()) {
            ArrayNode array = NODES.arrayNode();
            node.forEach(element -> array.add(aliased(element, aliases)));
            return array;
        }
        if (node.isObject()) {
            ObjectNode object = NODES.objectNode();
            node.properties().forEach(field -> object.set(field.getKey(), aliased(field.getValue(), aliases)));
            return object;
        }
        return node;
    }

    public static UUID administratorId() {
        return new UUID(ID_HIGH, ID_LOW + ADMINISTRATOR);
    }

    public void writeAdministrator(JdbcClient jdbc) {
        jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                        + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, 'PERSON', 'Správce případů', null, 'Dlouhá 12', "
                        + "'Ústí nad Labem', '400 01', 'spravce@example.cz', null, '3999999999', 'cs', :at, :at, null)")
                .param("id", administratorId())
                .param("at", timestamp(now))
                .update();
        jdbc.sql("insert into donor_role (donor_id, role) values (:id, 'ADMIN')").param("id", administratorId()).update();
    }

    public void write(JdbcClient jdbc, MutableClock clock) {
        new DatabaseCleaner(jdbc).emptyAllTables();
        clock.set(Instant.parse(now));
        int sequence = 0;
        for (Donor donor : donors) {
            UUID id = donorId(donor.alias());
            ++sequence;
            String name = donor.erasedAt().isPresent() ? ErasedPersonalData.NAME : donor.name().orElse("Dárce " + donor.alias());
            String street = donor.erasedAt().isPresent() ? ErasedPersonalData.ADDRESS.street() : "Dlouhá 12";
            String city = donor.erasedAt().isPresent() ? ErasedPersonalData.ADDRESS.city() : "Ústí nad Labem";
            String postalCode = donor.erasedAt().isPresent() ? ErasedPersonalData.ADDRESS.postalCode() : "400 01";
            String type = donor.type().orElse("PERSON");
            String companyIdentifier = donor.erasedAt().isPresent() ? null : donor.companyIdentifier().orElse(null);
            String symbol = donor.variableSymbol().orElse(Long.toString(4000000000L + sequence));
            jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, "
                            + "preferred_locale, registered_at, updated_at, erased_at) values (:id, :type, :name, :companyIdentifier, :street, :city, "
                            + ":postalCode, :symbol, 'cs', :registered, :registered, :erased)")
                    .param("id", id)
                    .param("type", type)
                    .param("name", name)
                    .param("companyIdentifier", companyIdentifier)
                    .param("street", street)
                    .param("city", city)
                    .param("postalCode", postalCode)
                    .param("symbol", symbol)
                    .param("registered", timestamp(donor.registeredAt()))
                    .param("erased", donor.erasedAt().map(CaseRows::timestamp).orElse(null))
                    .update();
            if (donor.account().isPresent()) {
                Account account = donor.account().get();
                jdbc.sql("insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol, "
                                + "preferred_locale, registered_at, email_verified_at, erased_at) values (:id, :type, :name, :companyIdentifier, :street, "
                                + ":city, :postalCode, :email, null, :symbol, 'cs', :registered, :verified, :erased)")
                        .param("id", id)
                        .param("type", type)
                        .param("name", name)
                        .param("companyIdentifier", companyIdentifier)
                        .param("street", street)
                        .param("city", city)
                        .param("postalCode", postalCode)
                        .param("email", account.email())
                        .param("symbol", symbol)
                        .param("registered", timestamp(donor.registeredAt()))
                        .param("verified", account.emailVerified() ? timestamp(donor.registeredAt()) : null)
                        .param("erased", donor.erasedAt().map(CaseRows::timestamp).orElse(null))
                        .update();
            }
        }
        for (Payment payment : payments) {
            UUID id = ids.get("payment:" + payment.alias());
            ++sequence;
            jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                            + "counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol, matching_variable_symbol, constant_symbol, "
                            + "specific_symbol, message_for_recipient, transaction_type, imported_at, unpaired_by_admin_at) values (:id, :transaction, :booked, "
                            + ":amount, 'CZK', :account, :bankCode, :account, :bankCode, :name, :symbol, :symbol, null, null, :message, 'Bezhotovostní příjem', "
                            + ":imported, :unpairedAt)")
                    .param("id", id)
                    .param("account", accountNumberOf(payment.counterpartyAccount().orElse(DEFAULT_ACCOUNT)))
                    .param("bankCode", bankCodeOf(payment.counterpartyAccount().orElse(DEFAULT_ACCOUNT)))
                    .param("name", payment.counterpartyName().orElse(null))
                    .param("symbol", payment.variableSymbol().orElse(null))
                    .param("message", payment.messageForRecipient().orElse(null))
                    .param("transaction", 26000000000L + sequence)
                    .param("booked", LocalDate.parse(payment.bookedOn()))
                    .param("amount", payment.amountMinor())
                    .param("imported", timestamp(payment.bookedOn() + "T12:00:00Z"))
                    .param("unpairedAt", payment.unpairedByAdminAt().map(CaseRows::timestamp).orElse(null))
                    .update();
        }
        for (Link link : links) {
            jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, "
                            + "valid_to, created_at, disconnected_at) values (:id, :donor, :account, :bankCode, :payment, :learnedAt, :status, :validFrom, "
                            + ":validTo, :learnedAt, :disconnectedAt)")
                    .param("id", ids.get("link:" + link.alias()))
                    .param("donor", donorId(link.donor()))
                    .param("account", accountNumberOf(link.accountNumber()))
                    .param("bankCode", bankCodeOf(link.accountNumber()))
                    .param("payment", ids.get("payment:" + link.learnedFrom()))
                    .param("learnedAt", timestamp(link.learnedAt()))
                    .param("status", link.status())
                    .param("validFrom", LocalDate.parse(link.validFrom()))
                    .param("validTo", link.validTo().map(LocalDate::parse).orElse(null))
                    .param("disconnectedAt", link.validTo().map(day -> timestamp(day + "T12:00:00Z")).orElse(null))
                    .update();
        }
        for (Claim claim : claims) {
            jdbc.sql("insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at) "
                            + "values (:id, :donor, :account, :bankCode, :symbol, :answer, :answeredAt)")
                    .param("id", ids.get("claim:" + claim.alias()))
                    .param("donor", donorId(claim.donor()))
                    .param("account", accountNumberOf(claim.accountNumber()))
                    .param("bankCode", bankCodeOf(claim.accountNumber()))
                    .param("symbol", claim.variableSymbol())
                    .param("answer", claim.answer())
                    .param("answeredAt", timestamp(claim.answeredAt()))
                    .update();
        }
        int position = 0;
        for (Gift gift : donations) {
            UUID id = ids.get("donation:" + (++position));
            jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by, "
                            + "recorded_at, sender_account_id, purpose, symbol_claim_id) values (:id, :donor, :payment, :received, :amount, 'CZK', :source, "
                            + ":status, :pairedBy, :recorded, :link, :purpose, :claim)")
                    .param("id", id)
                    .param("donor", donorId(gift.donor()))
                    .param("payment", gift.payment().map(alias -> ids.get("payment:" + alias)).orElse(null))
                    .param("received", LocalDate.parse(gift.receivedOn()))
                    .param("amount", gift.amountMinor())
                    .param("source", gift.source())
                    .param("status", gift.status())
                    .param("pairedBy", gift.pairedBy().orElse(gift.payment().isPresent() ? "VARIABLE_SYMBOL" : null))
                    .param("link", gift.bankAccount().map(alias -> ids.get("link:" + alias)).orElse(null))
                    .param("claim", gift.symbolClaim().map(alias -> ids.get("claim:" + alias)).orElse(null))
                    .param("recorded", timestamp(gift.recordedAt().orElse(gift.receivedOn() + "T12:00:00Z")))
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
            donor.name().ifPresent(name -> node.put("name", name));
            donor.type().ifPresent(type -> node.put("type", type));
            donor.companyIdentifier().ifPresent(identifier -> node.put("companyIdentifier", identifier));
            donor.variableSymbol().ifPresent(symbol -> node.put("variableSymbol", symbol));
            donor.account().ifPresent(account -> node.set("account", NODES.objectNode().put("email", account.email())
                    .put("emailVerified", account.emailVerified())));
            return node;
        }));
        input.set("payments", array(payments, payment -> {
            ObjectNode node = NODES.objectNode();
            node.put("alias", payment.alias());
            node.put("bookedOn", payment.bookedOn());
            node.put("amountMinor", payment.amountMinor());
            payment.unpairedByAdminAt().ifPresentOrElse(at -> node.put("unpairedByAdminAt", at), () -> node.putNull("unpairedByAdminAt"));
            payment.variableSymbol().ifPresent(symbol -> node.put("variableSymbol", symbol));
            payment.counterpartyAccount().ifPresent(account -> node.put("counterpartyAccount", account));
            payment.counterpartyName().ifPresent(name -> node.put("counterpartyName", name));
            payment.messageForRecipient().ifPresent(message -> node.put("messageForRecipient", message));
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
            gift.pairedBy().ifPresent(method -> node.put("pairedBy", method));
            gift.bankAccount().ifPresent(alias -> node.put("bankAccount", alias));
            gift.symbolClaim().ifPresent(alias -> node.put("symbolClaim", alias));
            gift.recordedAt().ifPresent(at -> node.put("recordedAt", at));
            return node;
        }));
        if (!links.isEmpty()) {
            input.set("links", array(links, link -> {
                ObjectNode node = NODES.objectNode();
                node.put("alias", link.alias());
                node.put("donor", link.donor());
                node.put("accountNumber", link.accountNumber());
                node.put("status", link.status());
                node.put("learnedFrom", link.learnedFrom());
                node.put("learnedAt", link.learnedAt());
                node.put("validFrom", link.validFrom());
                link.validTo().ifPresentOrElse(day -> node.put("validTo", day), () -> node.putNull("validTo"));
                return node;
            }));
        }
        if (!claims.isEmpty()) {
            input.set("symbolClaims", array(claims, claim -> {
                ObjectNode node = NODES.objectNode();
                node.put("alias", claim.alias());
                node.put("donor", claim.donor());
                node.put("accountNumber", claim.accountNumber());
                node.put("variableSymbol", claim.variableSymbol());
                node.put("answer", claim.answer());
                node.put("answeredAt", claim.answeredAt());
                return node;
            }));
        }
        if (!receipts.isEmpty()) {
            input.set("receipts", array(receipts, receipt -> {
                ObjectNode node = NODES.objectNode();
                node.put("alias", receipt.alias());
                node.put("donor", receipt.donor());
                node.put("kind", receipt.kind());
                receipt.year().ifPresent(year -> node.put("year", year));
                receipt.donation().ifPresent(position -> node.put("donation", position));
                node.put("issuedAt", receipt.issuedAt());
                return node;
            }));
        }
        return input;
    }

    public static Timestamp timestamp(String instant) {
        return Timestamp.from(Instant.parse(instant));
    }

    private void id(String key, int sequence) {
        ids.put(key, new UUID(ID_HIGH, ID_LOW + sequence));
    }

    private static <T> ArrayNode array(List<T> items, Function<T, ObjectNode> mapper) {
        ArrayNode array = NODES.arrayNode();
        items.stream().map(mapper).forEach(array::add);
        return array;
    }

    private static String accountNumberOf(String account) {
        return account.substring(0, account.indexOf('/'));
    }

    private static String bankCodeOf(String account) {
        return account.substring(account.indexOf('/') + 1);
    }

    private record Donor(String alias, String registeredAt, Optional<String> erasedAt, Optional<String> name, Optional<String> type,
                         Optional<String> companyIdentifier, Optional<String> variableSymbol, Optional<Account> account) {
    }

    private record Account(String email, boolean emailVerified) {

        static Account of(JsonNode account) {
            return new Account(account.get("email").asString(), account.get("emailVerified").asBoolean());
        }
    }

    private record Payment(String alias, String bookedOn, long amountMinor, Optional<String> unpairedByAdminAt, Optional<String> variableSymbol,
                           Optional<String> counterpartyAccount, Optional<String> counterpartyName, Optional<String> messageForRecipient) {
    }

    private record Gift(String donor, Optional<String> payment, String receivedOn, long amountMinor, String status, String source, String purpose,
                        Optional<String> pairedBy, Optional<String> bankAccount, Optional<String> symbolClaim, Optional<String> recordedAt) {
    }

    private record Link(String alias, String donor, String accountNumber, String status, String learnedFrom, String learnedAt, String validFrom,
                        Optional<String> validTo) {
    }

    private record Claim(String alias, String donor, String accountNumber, String variableSymbol, String answer, String answeredAt) {
    }

    private record Receipt(String alias, String donor, String kind, Optional<Integer> year, Optional<Integer> donation, String issuedAt) {
    }

    public record ReceiptToIssue(String alias, UUID donor, boolean yearly, Optional<Integer> year, Optional<UUID> donation, Instant issuedAt) {
    }
}
