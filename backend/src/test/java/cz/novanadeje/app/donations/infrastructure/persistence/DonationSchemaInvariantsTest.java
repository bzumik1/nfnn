package cz.novanadeje.app.donations.infrastructure.persistence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class DonationSchemaInvariantsTest {

    private static final UUID JANA = UUID.fromString("0190a000-0000-7000-8000-000000000101");
    private static final UUID PETR = UUID.fromString("0190a000-0000-7000-8000-000000000102");
    private static final UUID PAYMENT = UUID.fromString("0190a000-0000-7000-8000-000000000103");
    private static final UUID JANAS_LINK = UUID.fromString("0190a000-0000-7000-8000-000000000104");
    private static final UUID PETRS_LINK = UUID.fromString("0190a000-0000-7000-8000-000000000105");
    private static final UUID JANAS_CLAIM = UUID.fromString("0190a000-0000-7000-8000-000000000106");
    private static final UUID PETRS_CLAIM = UUID.fromString("0190a000-0000-7000-8000-000000000107");
    private static final UUID DONATION = UUID.fromString("0190a000-0000-7000-8000-000000000108");
    private static final LocalDate BOOKED_ON = LocalDate.of(2026, 3, 15);
    private static final long AMOUNT = 50_000;

    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void storeTwoDonorsAPaymentAndTheirLinksAndClaims() {
        insertDonorRecord(JANA, "PERSON", null, "4821937560", "cs", null);
        insertDonorRecord(PETR, "PERSON", null, "7700112233", "en", null);
        insertPayment(PAYMENT, "4821937560", "4821937560", "CZK");
        insertLink(JANAS_LINK, JANA);
        insertLink(PETRS_LINK, PETR);
        insertClaim(JANAS_CLAIM, JANA);
        insertClaim(PETRS_CLAIM, PETR);
    }

    @ParameterizedTest(name = "{0} = {1}")
    @CsvSource(delimiter = '|', textBlock = """
            status   | BOGUS  | ck_donation_status
            status   | paid   | ck_donation_status
            source   | GIFT   | ck_donation_source
            currency | EUR    | ck_donation_currency
            """)
    @DisplayName("Given a donor and a payment, when a donation is written with a status, source or currency the application never writes, then the database refuses it")
    void should_refuse_donation_when_written_given_unknown_status_source_or_currency(String column, String value, String constraint) {
        String status = column.equals("status") ? value : "RECEIVED";
        String source = column.equals("source") ? value : "MANUAL";
        String currency = column.equals("currency") ? value : "CZK";

        assertThatThrownBy(() -> insertDonation(DONATION, JANA, null, BOOKED_ON, AMOUNT, currency, source, status, null, null, null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"" + constraint + "\"");
    }

    @ParameterizedTest(name = "{0}, {1}")
    @CsvSource(delimiter = '|', textBlock = """
            RECEIVED | BANK_TRANSFER
            REFUNDED | BANK_TRANSFER
            RECEIVED | MANUAL
            REFUNDED | MANUAL
            """)
    @DisplayName("Given a donor and a payment, when a donation is written with each status and source the application knows, then the database takes it")
    void should_take_donation_when_written_given_known_status_and_source(String status, String source) {
        boolean fromBank = source.equals("BANK_TRANSFER");

        insertDonation(DONATION, JANA, fromBank ? PAYMENT : null, BOOKED_ON, AMOUNT, "CZK", source, status, fromBank ? "VARIABLE_SYMBOL" : null,
                null, null);

        assertThat(count("select count(*) from donation where id = '" + DONATION + "'")).isOne();
    }

    @Test
    @DisplayName("Given a payment in CZK, when another payment is written in EUR, then the database refuses it")
    void should_refuse_payment_when_written_given_other_currency() {
        assertThatThrownBy(() -> insertPayment(UUID.randomUUID(), null, null, "EUR"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"ck_bank_payment_currency\"");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"0558", "0", "abc", "12 34", ""})
    @DisplayName("Given the import's matching form of a variable symbol, when a payment is written with a matching symbol not in that form, then the database refuses it")
    void should_refuse_payment_when_written_given_matching_symbol_not_normalised(String matching) {
        assertThatThrownBy(() -> insertPayment(UUID.randomUUID(), "0558", matching, "CZK"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"ck_bank_payment_matching_symbol\"");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"558", "1", "9999999999"})
    @DisplayName("Given the import's matching form of a variable symbol, when a payment is written with a matching symbol in that form, then the database takes it")
    void should_take_payment_when_written_given_normalised_matching_symbol(String matching) {
        insertPayment(UUID.randomUUID(), "0" + matching, matching, "CZK");

        assertThat(count("select count(*) from bank_payment where matching_variable_symbol = '" + matching + "'")).isOne();
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', nullValues = "null", textBlock = """
            ALIEN   | null     | 1100000001 | cs | null                 | ck_donor_record_type
            PERSON  | null     | abc        | cs | null                 | ck_donor_record_variable_symbol
            PERSON  | null     | 0123456789 | cs | null                 | ck_donor_record_variable_symbol
            PERSON  | null     | 1100000001 | zz | null                 | ck_donor_record_preferred_locale
            PERSON  | null     | 1100000001 | CS | null                 | ck_donor_record_preferred_locale
            PERSON  | 12345678 | 1100000001 | cs | null                 | ck_donor_record_company_identifier
            COMPANY | null     | 1100000001 | cs | null                 | ck_donor_record_company_identifier
            COMPANY | 1234567x | 1100000001 | cs | null                 | ck_donor_record_company_identifier
            COMPANY | 1234567  | 1100000001 | cs | null                 | ck_donor_record_company_identifier
            PERSON  | 12345678 | 1100000001 | cs | 2026-10-01T10:00:00Z | ck_donor_record_company_identifier
            """)
    @DisplayName("Given the donor types, symbols and languages the application writes, when a donor record is written with another value or a company identifier its type does not have, then the database refuses it")
    void should_refuse_donor_record_when_written_given_value_the_application_never_writes(String type, String companyIdentifier, String symbol,
                                                                                         String locale, String erasedAt, String constraint) {
        assertThatThrownBy(() -> insertDonorRecord(UUID.randomUUID(), type, companyIdentifier, symbol, locale, erasedAt))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"" + constraint + "\"");
    }

    @ParameterizedTest(name = "{0} {1} {2}")
    @CsvSource(delimiter = '|', nullValues = "null", textBlock = """
            PERSON  | null     | 1100000001 | cs | null
            PERSON  | null     | 7          | en | null
            COMPANY | 12345678 | 1100000001 | cs | null
            COMPANY | null     | 1100000001 | cs | 2026-10-01T10:00:00Z
            PERSON  | null     | 1100000001 | en | 2026-10-01T10:00:00Z
            """)
    @DisplayName("Given the donor types, symbols and languages the application writes, when a donor record is written with them, an erased company without its identifier included, then the database takes it")
    void should_take_donor_record_when_written_given_values_the_application_writes(String type, String companyIdentifier, String symbol, String locale,
                                                                                  String erasedAt) {
        UUID donor = UUID.randomUUID();

        insertDonorRecord(donor, type, companyIdentifier, symbol, locale, erasedAt);

        assertThat(count("select count(*) from donor_record where donor_id = '" + donor + "'")).isOne();
    }

    @Test
    @DisplayName("Given Jana's payment, when her donation is paired through Petr's account link, then the database refuses it")
    void should_refuse_donation_when_paired_given_another_donors_account_link() {
        assertThatThrownBy(() -> insertDonation(DONATION, JANA, PAYMENT, BOOKED_ON, AMOUNT, "CZK", "BANK_TRANSFER", "RECEIVED", "SENDER_ACCOUNT",
                PETRS_LINK, null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"fk_donation_sender_account_of_donor\"");
    }

    @Test
    @DisplayName("Given Jana's payment, when her donation is paired through her own link and Petr's symbol claim, then the database refuses it")
    void should_refuse_donation_when_paired_given_another_donors_symbol_claim() {
        assertThatThrownBy(() -> insertDonation(DONATION, JANA, PAYMENT, BOOKED_ON, AMOUNT, "CZK", "BANK_TRANSFER", "RECEIVED", "CONFIRMED_SYMBOL",
                JANAS_LINK, PETRS_CLAIM))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"fk_donation_symbol_claim_of_donor\"");
    }

    @Test
    @DisplayName("Given Jana's payment, her link and her claim, when her donation is paired through them, then the database takes it")
    void should_take_donation_when_paired_given_the_donors_own_link_and_claim() {
        insertDonation(DONATION, JANA, PAYMENT, BOOKED_ON, AMOUNT, "CZK", "BANK_TRANSFER", "RECEIVED", "CONFIRMED_SYMBOL", JANAS_LINK, JANAS_CLAIM);

        assertThat(count("select count(*) from donation where id = '" + DONATION + "'")).isOne();
    }

    @Test
    @DisplayName("Given Jana's donation paired through her link and claim, when her erasure clears both from the donation and deletes them, then the database takes it")
    void should_take_erasure_when_link_and_claim_cleared_and_deleted_given_paired_donation() {
        insertDonation(DONATION, JANA, PAYMENT, BOOKED_ON, AMOUNT, "CZK", "BANK_TRANSFER", "RECEIVED", "CONFIRMED_SYMBOL", JANAS_LINK, JANAS_CLAIM);

        assertThatCode(() -> {
            jdbc.sql("update donation set sender_account_id = null, symbol_claim_id = null where id = ?").param(DONATION).update();
            jdbc.sql("delete from donor_sender_account where donor_id = ?").param(JANA).update();
            jdbc.sql("delete from donor_symbol_claim where donor_id = ?").param(JANA).update();
        }).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', textBlock = """
            another amount       | 2026-03-15 | 99999999
            another day          | 2019-01-01 | 50000
            """)
    @DisplayName("Given a payment of 500 Kč booked on 15 March, when a donation of it is written with another amount or day, then the database refuses it")
    void should_refuse_donation_when_written_given_terms_other_than_its_payments(String what, LocalDate receivedOn, long amount) {
        assertThatThrownBy(() -> insertDonation(DONATION, JANA, PAYMENT, receivedOn, amount, "CZK", "BANK_TRANSFER", "RECEIVED", "VARIABLE_SYMBOL",
                null, null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"fk_donation_bank_payment_terms\"");
    }

    @Test
    @DisplayName("Given a donation of a payment, when the payment's amount is changed under it, then the database refuses it")
    void should_refuse_payment_change_when_its_amount_changes_given_a_donation_of_it() {
        insertDonation(DONATION, JANA, PAYMENT, BOOKED_ON, AMOUNT, "CZK", "BANK_TRANSFER", "RECEIVED", "VARIABLE_SYMBOL", null, null);

        assertThatThrownBy(() -> jdbc.sql("update bank_payment set amount_minor = 1 where id = ?").param(PAYMENT).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"fk_donation_bank_payment_terms\"");
    }

    @Test
    @DisplayName("Given a manual donation without a payment, when its amount is corrected, then the database takes it")
    void should_take_corrected_amount_when_changed_given_manual_donation() {
        insertDonation(DONATION, JANA, null, BOOKED_ON, AMOUNT, "CZK", "MANUAL", "RECEIVED", null, null, null);

        jdbc.sql("update donation set amount_minor = 12345, received_on = '2026-01-02' where id = ?").param(DONATION).update();

        assertThat(count("select amount_minor from donation where id = '" + DONATION + "'")).isEqualTo(12345L);
    }

    @Test
    @DisplayName("Given an issued receipt, when its language is written as one the application has no texts for, then the database refuses it")
    void should_refuse_receipt_when_written_given_unknown_locale() {
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values ('0a1b2c3d', ?, now(), 'active', 'seal')")
                .param(new byte[32]).update();

        assertThatThrownBy(() -> jdbc.sql("insert into issued_receipt (id, donor_id, kind, donation_id, receipt_year, number, issued_on, issued_at, locale, "
                        + "fingerprint, status, schema_version, frozen, signing_key_id, proof, status_sha256) values (?, ?, 'YEARLY', null, 2025, '2026-000001', "
                        + "'2026-01-09', now(), 'de', repeat('5', 64), 'ACTIVE', 1, '{}', '0a1b2c3d', ?, repeat('6', 64))")
                .params(UUID.randomUUID(), JANA, new byte[65]).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("\"ck_issued_receipt_locale\"");
    }

    private void insertDonorRecord(UUID id, String type, String companyIdentifier, String symbol, String locale, String erasedAt) {
        jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, "
                        + "registered_at, updated_at, erased_at) values (?, ?, 'Dárce', ?, 'Dlouhá 12', 'Ústí nad Labem', '400 01', ?, ?, now(), now(), "
                        + "cast(? as timestamptz))")
                .params(id, type, companyIdentifier, symbol, locale, erasedAt)
                .update();
    }

    private void insertPayment(UUID id, String variableSymbol, String matchingSymbol, String currency) {
        jdbc.sql("insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code, "
                        + "variable_symbol, matching_variable_symbol, transaction_type, imported_at) "
                        + "values (?, (select coalesce(max(bank_transaction_id), 0) + 1 from bank_payment), ?, ?, ?, '2900233333', '2010', ?, ?, "
                        + "'Bezhotovostní příjem', now())")
                .params(id, BOOKED_ON, AMOUNT, currency, variableSymbol, matchingSymbol)
                .update();
    }

    private void insertLink(UUID id, UUID donor) {
        jdbc.sql("insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status, valid_from, "
                        + "valid_to, created_at, disconnected_at) values (?, ?, '2900233333', '2010', ?, now(), 'ACTIVE', null, null, now(), null)")
                .params(id, donor, PAYMENT)
                .update();
    }

    private void insertClaim(UUID id, UUID donor) {
        jdbc.sql("insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at) "
                        + "values (?, ?, '2900233333', '2010', '777', 'CONFIRMED', now())")
                .params(id, donor)
                .update();
    }

    private void insertDonation(UUID id, UUID donor, UUID payment, LocalDate receivedOn, long amount, String currency, String source, String status,
                                String pairedBy, UUID link, UUID claim) {
        jdbc.sql("insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by, recorded_at, "
                        + "sender_account_id, purpose, symbol_claim_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), ?, 'GENERAL', ?)")
                .params(id, donor, payment, receivedOn, amount, currency, source, status, pairedBy, link, claim)
                .update();
    }

    private long count(String query) {
        return jdbc.sql(query).query(Long.class).single();
    }
}
