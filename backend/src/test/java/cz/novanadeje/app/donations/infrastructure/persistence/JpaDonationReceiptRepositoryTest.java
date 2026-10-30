package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptId;
import cz.novanadeje.app.donations.domain.receipt.DonationReceiptRepository;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptFingerprint;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.donations.domain.receipt.ReceiptStatus;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.donations.domain.receipt.ReceiptVerification;
import cz.novanadeje.app.donations.domain.receipt.ReplacedReceipt;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.proof.ReceiptProof;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptImage;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptResources;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaDonationReceiptRepositoryTest {

    private static final Optional<SenderAccount> ACCOUNT = Optional.of(new SenderAccount("2900233333", "2010"));
    private static final LocalDate ISSUED_ON = LocalDate.of(2026, 10, 17);
    private static final Year YEAR_2025 = Year.of(2025);
    private static final Year YEAR_2026 = Year.of(2026);
    private static final ReceiptFingerprint FINGERPRINT = new ReceiptFingerprint("0123456789abcdef".repeat(4));
    private static final ReceiptSigningKeyId KEY_ID = new ReceiptSigningKeyId("21fe31df");
    private static final FoundationIdentity FOUNDATION = new FoundationIdentity("Nová naděje - nadační fond", "27278794",
            new PostalAddress("Jiráskova 436", "Nový Bor", "473 01"), "Krajský soud v Ústí nad Labem", "N 78", "5544332217/2010",
            "V Novém Boru", "Nový Bor");
    private static final ReceiptParty JANA_PARTY = new ReceiptParty(DonorType.PERSON, "Jana Nováková",
            new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), Optional.empty(), new VariableSymbol("4821937560"));
    private static final Signatory SIGNATORY = new Signatory("Petr Vzorový", "předseda správní rady");
    private static final ReceiptTextSet CZECH = ReceiptTextSet.czechOnly(Map.of("receipt.title.single", "Potvrzení o přijetí daru"));
    private static final ReceiptTextSet BILINGUAL = ReceiptTextSet.bilingual(Map.of("receipt.title.single", "Potvrzení o přijetí daru"),
            Map.of("receipt.title.single", "Confirmation of a donation received"));
    private static final ReceiptImage SIGNATURE = new ReceiptImage(new byte[] {(byte) 0x89, 'P', 'N', 'G', 2}, "image/png");
    private static final ReceiptImage OTHER_SIGNATURE = new ReceiptImage(new byte[] {(byte) 0x89, 'P', 'N', 'G', 3}, "image/png");

    @Autowired
    private DonationReceiptRepository receipts;
    @Autowired
    private ReceiptImageRepository images;
    @Autowired
    private DonationRepository donations;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private ReceiptResources resources;

    private long transactionIds = 5000;

    @BeforeEach
    void storeSignatureImagesAndTheSigningKey() {
        resources.storeImage(SIGNATURE.digest(), SIGNATURE, NOW);
        resources.storeImage(OTHER_SIGNATURE.digest(), OTHER_SIGNATURE, NOW);
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values (?, ?, ?, 'active', 'seal')")
                .params(KEY_ID.value(), new byte[32], Timestamp.from(NOW)).update();
    }

    @Test
    @DisplayName("Given a signed single receipt in English, when it is saved and its donation's active receipt is read, then every field and the whole frozen receipt survive")
    void should_keep_every_field_and_frozen_receipt_when_saved_and_read_given_single_receipt() {
        DonorReference jana = storedDonor("4821937560");
        Donation donation = storedDonation(jana, LocalDate.of(2026, 3, 15));
        DonationReceipt receipt = single(jana, donation, "2026-000001");

        receipts.save(receipt);
        flushAndClear();

        assertThat(receipts.findActiveForDonation(donation.id())).hasValueSatisfying(stored -> {
            assertThat(stored.id()).isEqualTo(receipt.id());
            assertThat(stored.donor()).isEqualTo(jana);
            assertThat(stored.kind()).isEqualTo(ReceiptKind.SINGLE);
            assertThat(stored.donation()).contains(donation.id());
            assertThat(stored.year()).isEmpty();
            assertThat(stored.number()).isEqualTo(new ReceiptNumber("2026-000001"));
            assertThat(stored.issuedOn()).isEqualTo(ISSUED_ON);
            assertThat(stored.issuedAt()).isEqualTo(NOW);
            assertThat(stored.locale()).isEqualTo(LocaleCode.EN);
            assertThat(stored.fingerprint()).isEqualTo(FINGERPRINT);
            assertThat(stored.status()).isEqualTo(ReceiptStatus.ACTIVE);
            assertThat(stored.frozen()).isEqualTo(receipt.frozen());
            assertThat(stored.frozen().signatureImage()).contains(SIGNATURE.digest());
            assertThat(stored.supersedes()).isEmpty();
            assertThat(stored.supersededAt()).isEmpty();
        });
        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).isEmpty();
    }

    @Test
    @DisplayName("Given a saved receipt, when its columns are read, then they repeat the frozen data, the key id, the whole proof and its status digest")
    void should_store_columns_of_frozen_data_when_saved_given_receipt() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt receipt = yearly(jana, YEAR_2025, "2026-000002", Optional.empty());

        receipts.save(receipt);
        flushAndClear();

        Map<String, Object> row = jdbc.sql("select kind, receipt_year, number, locale, status, schema_version, signing_key_id, proof,"
                + " status_sha256, signature_image_sha256 from issued_receipt where id = ?").param(receipt.id().value()).query().singleRow();
        assertThat(row).containsEntry("kind", "YEARLY").containsEntry("receipt_year", 2025).containsEntry("number", "2026-000002")
                .containsEntry("locale", "cs").containsEntry("status", "ACTIVE")
                .containsEntry("signing_key_id", KEY_ID.value())
                .containsEntry("status_sha256", receipt.frozen().statusDigest().value())
                .containsEntry("signature_image_sha256", null);
        assertThat(((Number) row.get("schema_version")).intValue()).isEqualTo(1);
        assertThat((byte[]) row.get("proof")).isEqualTo(receipt.frozen().verification().proof().bytes());
        assertThat(jdbc.sql("select frozen from issued_receipt where id = ?").param(receipt.id().value()).query(String.class).single())
                .contains("\"schemaVersion\":1", "\"number\":\"2026-000002\"", "\"name\":\"Petr Vzorový\"", "\"cs\":{\"receipt.title.single\"");
    }

    @Test
    @DisplayName("Given a stored receipt, when it is read by its id, then it comes back, and an unknown id finds nothing")
    void should_find_by_id_when_read_given_stored_receipt() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt receipt = yearly(jana, YEAR_2025, "2026-000003", Optional.empty());
        receipts.save(receipt);
        flushAndClear();

        assertThat(receipts.findById(receipt.id())).hasValueSatisfying(stored -> assertThat(stored.number()).isEqualTo(receipt.number()));
        assertThat(receipts.findById(DonationReceiptId.newId(NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a yearly receipt, when it is saved and the donor's active receipt of that year is read, then it comes back with its year")
    void should_find_yearly_receipt_when_read_given_saved_for_year() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt receipt = yearly(jana, YEAR_2025, "2026-000002", Optional.empty());

        receipts.save(receipt);
        flushAndClear();

        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).hasValueSatisfying(stored -> {
            assertThat(stored.kind()).isEqualTo(ReceiptKind.YEARLY);
            assertThat(stored.year()).contains(YEAR_2025);
            assertThat(stored.donation()).isEmpty();
            assertThat(stored.number()).isEqualTo(new ReceiptNumber("2026-000002"));
        });
        assertThat(receipts.findActiveForYear(jana, Year.of(2024))).isEmpty();
        assertThat(receipts.findActiveForYear(storedDonor("7310945528"), YEAR_2025)).isEmpty();
    }

    @Test
    @DisplayName("Given a receipt replaced by a newer one, when the active receipt is read, then the replaced one is left out and keeps its status and time")
    void should_leave_out_replaced_receipt_when_active_read_given_replacement() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt first = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(first);
        Instant replacedAt = NOW.plusSeconds(3600);
        first.markSuperseded(replacedAt);
        receipts.save(first);
        DonationReceipt second = yearly(jana, YEAR_2025, "2026-000002", Optional.of(first.id()));
        receipts.save(second);
        flushAndClear();

        assertThat(receipts.findActiveForYear(jana, YEAR_2025)).hasValueSatisfying(stored -> {
            assertThat(stored.id()).isEqualTo(second.id());
            assertThat(stored.supersedes()).contains(first.id());
        });
        assertThat(receipts.findById(first.id())).hasValueSatisfying(stored -> {
            assertThat(stored.status()).isEqualTo(ReceiptStatus.REPLACED);
            assertThat(stored.supersededAt()).contains(replacedAt);
        });
    }

    @Test
    @DisplayName("Given a stored receipt, when a replaced copy of it with other frozen data is saved, then only the status and superseded_at change")
    void should_change_only_status_when_saved_given_stored_receipt() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt stored = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(stored);
        flushAndClear();
        String frozenBefore = frozenColumn(stored);
        Instant replacedAt = NOW.plusSeconds(3600);
        FrozenReceipt other = new FrozenReceipt(stored.frozen().document(), CZECH, Optional.of(OTHER_SIGNATURE.digest()),
                stored.frozen().verification());
        DonationReceipt copy = DonationReceipt.reconstitute(stored.id(), jana, NOW, FINGERPRINT, other, Optional.empty(), ReceiptStatus.REPLACED,
                Optional.of(replacedAt));

        receipts.save(copy);
        flushAndClear();

        assertThat(frozenColumn(stored)).isEqualTo(frozenBefore);
        assertThat(jdbc.sql("select signature_image_sha256 from issued_receipt where id = ?").param(stored.id().value()).query().singleColumn())
                .containsOnlyNulls();
        assertThat(jdbc.sql("select status from issued_receipt where id = ?").param(stored.id().value()).query(String.class).single())
                .isEqualTo("REPLACED");
        assertThat(jdbc.sql("select superseded_at from issued_receipt where id = ?").param(stored.id().value()).query(Instant.class).single())
                .isEqualTo(replacedAt);
    }

    @Test
    @DisplayName("Given single, yearly, replaced and other donors' receipts, when the donor's single numbers are read, then only their active single ones come")
    void should_map_active_single_numbers_when_read_given_mixed_receipts() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        Donation march = storedDonation(jana, LocalDate.of(2026, 3, 15));
        Donation june = storedDonation(jana, LocalDate.of(2026, 6, 1));
        Donation petrs = storedDonation(petr, LocalDate.of(2026, 4, 1));
        DonationReceipt replaced = single(jana, march, "2026-000001");
        receipts.save(replaced);
        replaced.markSuperseded(NOW.plusSeconds(60));
        receipts.save(replaced);
        receipts.save(single(jana, march, "2026-000002"));
        receipts.save(single(jana, june, "2026-000003"));
        receipts.save(single(petr, petrs, "2026-000004"));
        receipts.save(yearly(jana, YEAR_2025, "2026-000005", Optional.empty()));
        flushAndClear();

        Map<DonationId, ReceiptNumber> numbers = receipts.findActiveSingleNumbersFor(jana);

        assertThat(numbers).containsExactlyInAnyOrderEntriesOf(Map.of(
                march.id(), new ReceiptNumber("2026-000002"),
                june.id(), new ReceiptNumber("2026-000003")));
        assertThat(receipts.findActiveSingleNumbersFor(storedDonor("1111111111"))).isEmpty();
    }

    @Test
    @DisplayName("Given the receipt number sequence, when two serials are taken, then the second is one more than the first")
    void should_increment_when_next_serial_taken_given_sequence() {
        long first = receipts.nextSerial();
        long second = receipts.nextSerial();

        assertThat(first).isPositive();
        assertThat(second).isEqualTo(first + 1);
    }

    @Test
    @DisplayName("Given a committed donor, when the donor is locked for issuing, then another transaction cannot lock the same row")
    void should_hold_donor_row_lock_when_locked_given_committed_donor() {
        TestTransaction.end();
        TransactionTemplate separately = new TransactionTemplate(transactionManager);
        separately.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        DonorReference jana = separately.execute(status -> storedDonor("5555555555"));
        try {
            separately.executeWithoutResult(status -> {
                receipts.lockDonor(jana);

                assertThatThrownBy(() -> separately.executeWithoutResult(other -> jdbc
                        .sql("select donor_id from donor_record where donor_id = ? for update nowait").param(jana.value()).query().listOfRows()))
                        .isInstanceOf(DataAccessException.class)
                        .hasMessageContaining("could not obtain lock on row");
            });
        } finally {
            separately.executeWithoutResult(status -> jdbc.sql("delete from donor_record where donor_id = ?").param(jana.value()).update());
        }
    }

    @Test
    @DisplayName("Given no donor record, when the donor is locked for issuing, then the lock does not fail")
    void should_not_fail_when_locked_given_unknown_donor() {
        DonorReference unknown = new DonorReference(UuidV7.generate(NOW));

        assertThatCode(() -> receipts.lockDonor(unknown)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Given the schema, when a single receipt without a donation is inserted, then the shape check refuses it")
    void should_refuse_when_inserted_given_single_receipt_without_donation() {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> insert(jana, "'SINGLE'", "2025", "'ACTIVE'", "null", "1", 65)).hasMessageContaining("ck_issued_receipt_shape");
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', textBlock = """
            a status the receipt cannot have          | LOST     | null  | 1 | 65 | ck_issued_receipt_status
            a replaced receipt without its time       | REPLACED | null  | 1 | 65 | ck_issued_receipt_superseded
            an active receipt with a supersede time   | ACTIVE   | now() | 1 | 65 | ck_issued_receipt_superseded
            another schema version                    | ACTIVE   | null  | 2 | 65 | ck_issued_receipt_schema_version
            a proof no longer than its signature      | ACTIVE   | null  | 1 | 64 | ck_issued_receipt_proof
            """)
    @DisplayName("Given the schema, when a receipt breaking a check is inserted, then the check refuses it")
    void should_refuse_when_inserted_given_receipt_breaking_a_check(String broken, String status, String supersededAt, String schemaVersion,
                                                                    int proofBytes, String check) {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> insert(jana, "'YEARLY'", "2025", "'" + status + "'", supersededAt, schemaVersion, proofBytes))
                .as(broken).hasMessageContaining(check);
    }

    @Test
    @DisplayName("Given an active receipt of a donation, when a second active receipt of it is saved, then the partial unique index refuses it")
    void should_refuse_when_saved_given_second_active_receipt_of_donation() {
        DonorReference jana = storedDonor("4821937560");
        Donation donation = storedDonation(jana, LocalDate.of(2026, 3, 15));
        receipts.save(single(jana, donation, "2026-000001"));
        flushAndClear();

        assertThatThrownBy(() -> receipts.save(single(jana, donation, "2026-000002")))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_issued_receipt_active_donation");
    }

    @Test
    @DisplayName("Given an active yearly receipt, when a second active receipt of the same donor and year is saved, then the partial unique index refuses it")
    void should_refuse_when_saved_given_second_active_receipt_of_year() {
        DonorReference jana = storedDonor("4821937560");
        receipts.save(yearly(jana, YEAR_2025, "2026-000001", Optional.empty()));
        flushAndClear();

        assertThatThrownBy(() -> receipts.save(yearly(jana, YEAR_2025, "2026-000002", Optional.empty())))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_issued_receipt_active_year");
    }

    @Test
    @DisplayName("Given a stored receipt, when another receipt with the same proof is saved, then the unique status digest refuses it")
    void should_refuse_when_saved_given_same_proof_twice() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt first = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(first);
        flushAndClear();
        ReceiptDocument document = yearlyDocument(YEAR_2026, "2026-000002", Optional.empty());
        DonationReceipt copied = DonationReceipt.issue(DonationReceiptId.newId(NOW), jana, NOW, FINGERPRINT,
                new FrozenReceipt(document, CZECH, Optional.empty(), first.frozen().verification()), Optional.empty());

        assertThatThrownBy(() -> receipts.save(copied))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_issued_receipt_status_sha256");
    }

    @Test
    @DisplayName("Given a frozen receipt signed by a key that is not registered, when it is saved, then the foreign key refuses it")
    void should_refuse_when_saved_given_unregistered_signing_key() {
        DonorReference jana = storedDonor("4821937560");
        ReceiptDocument document = yearlyDocument(YEAR_2025, "2026-000013", Optional.empty());
        ReceiptVerification unregistered = new ReceiptVerification(new ReceiptSigningKeyId("0a0b0c0d"), verificationOf("2026-000013").proof());
        DonationReceipt receipt = DonationReceipt.issue(DonationReceiptId.newId(NOW), jana, NOW, FINGERPRINT,
                new FrozenReceipt(document, CZECH, Optional.empty(), unregistered), Optional.empty());

        assertThatThrownBy(() -> receipts.save(receipt))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_issued_receipt_signing_key");
    }

    @Test
    @DisplayName("Given a frozen receipt naming a signature image that is not stored, when it is saved, then the foreign key refuses it")
    void should_refuse_when_saved_given_unknown_signature_image() {
        DonorReference jana = storedDonor("4821937560");
        ReceiptDocument document = yearlyDocument(YEAR_2025, "2026-000012", Optional.empty());
        DonationReceipt receipt = DonationReceipt.issue(DonationReceiptId.newId(NOW), jana, NOW, FINGERPRINT,
                new FrozenReceipt(document, CZECH, Optional.of(new ContentDigest("f".repeat(64))), verificationOf("2026-000012")), Optional.empty());

        assertThatThrownBy(() -> receipts.save(receipt))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_issued_receipt_signature_image");
    }

    @Test
    @DisplayName("Given a stored receipt whose number column was changed behind the frozen data, when it is read, then reading fails instead of trusting either")
    void should_fail_when_read_given_columns_disagreeing_with_frozen_data() {
        DonorReference jana = storedDonor("4821937560");
        DonationReceipt receipt = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(receipt);
        flushAndClear();
        jdbc.sql("update issued_receipt set number = '2026-000099' where id = ?").param(receipt.id().value()).update();

        assertThatThrownBy(() -> receipts.findById(receipt.id()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("disagrees with its frozen data");
    }

    @Test
    @DisplayName("Given single receipts, one of them replaced, when donations with a receipt are asked for, then every donation ever receipted is named")
    void should_name_receipted_donations_when_asked_given_active_and_replaced_receipts() {
        DonorReference jana = storedDonor("4821937560");
        Donation receipted = storedDonation(jana, LocalDate.of(2026, 3, 15));
        Donation replaced = storedDonation(jana, LocalDate.of(2026, 4, 15));
        Donation bare = storedDonation(jana, LocalDate.of(2026, 5, 15));
        DonationReceipt old = single(jana, replaced, "2026-000001");
        receipts.save(old);
        receipts.save(single(jana, receipted, "2026-000002"));
        old.markSuperseded(NOW.plusSeconds(60));
        receipts.save(old);
        flushAndClear();

        assertThat(receipts.existsForDonation(receipted.id())).isTrue();
        assertThat(receipts.existsForDonation(replaced.id())).isTrue();
        assertThat(receipts.existsForDonation(bare.id())).isFalse();
        assertThat(receipts.findDonationsWithReceipt(List.of(receipted.id(), replaced.id(), bare.id())))
                .containsExactlyInAnyOrder(receipted.id(), replaced.id());
        assertThat(receipts.findDonationsWithReceipt(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given a replaced and an active yearly receipt of a year, when asked whether a yearly receipt of that donor and year was issued since a time, then the replaced one counts too, and another year, donor or a later time does not")
    void should_find_yearly_receipt_issued_since_when_asked_given_replaced_and_active_receipts() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        DonationReceipt first = yearly(jana, YEAR_2025, "2026-000001", Optional.empty());
        receipts.save(first);
        first.markSuperseded(NOW.plusSeconds(1));
        receipts.save(first);
        receipts.save(yearly(jana, YEAR_2025, "2026-000002", Optional.of(first.id())));
        flushAndClear();

        assertThat(receipts.existsYearlyIssuedSince(jana, YEAR_2025, NOW)).isTrue();
        assertThat(receipts.existsYearlyIssuedSince(jana, YEAR_2025, NOW.minusSeconds(60))).isTrue();
        assertThat(receipts.existsYearlyIssuedSince(jana, YEAR_2025, NOW.plusSeconds(1))).isFalse();
        assertThat(receipts.existsYearlyIssuedSince(jana, YEAR_2026, NOW)).isFalse();
        assertThat(receipts.existsYearlyIssuedSince(petr, YEAR_2025, NOW)).isFalse();
    }

    @Test
    @DisplayName("Given single, yearly, replaced and other donors' receipts, when the donor's receipts are listed, then all of the donor's come, newest issue first")
    void should_list_all_donor_receipts_newest_first_when_listed_given_mixed_receipts() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        Donation march = storedDonation(jana, LocalDate.of(2026, 3, 15));
        Donation petrs = storedDonation(petr, LocalDate.of(2026, 4, 1));
        DonationReceipt replaced = single(jana, march, "2026-000001");
        receipts.save(replaced);
        replaced.markSuperseded(NOW.plusSeconds(60));
        receipts.save(replaced);
        receipts.save(issued(jana, NOW.plusSeconds(30), yearlyDocument(YEAR_2025, "2026-000002", Optional.empty()), Optional.empty()));
        receipts.save(single(petr, petrs, "2026-000003"));
        receipts.save(issued(jana, NOW.plusSeconds(120), singleDocument(march, "2026-000004",
                Optional.of(new ReplacedReceipt(new ReceiptNumber("2026-000001"), ISSUED_ON))), Optional.of(replaced.id())));
        flushAndClear();

        assertThat(receipts.findByDonorNewestFirst(jana)).extracting(receipt -> receipt.number().value())
                .containsExactly("2026-000004", "2026-000002", "2026-000001");
        assertThat(receipts.findByDonorNewestFirst(jana)).filteredOn(receipt -> receipt.number().value().equals("2026-000001"))
                .singleElement().satisfies(receipt -> assertThat(receipt.isActive()).isFalse());
        assertThat(receipts.findByDonorNewestFirst(petr)).hasSize(1);
    }

    @Test
    @DisplayName("Given a donor's receipts issued at the same instant, when the donor's receipts are listed, then the higher number comes first")
    void should_list_higher_number_first_when_listed_given_receipts_issued_at_same_instant() {
        DonorReference jana = storedDonor("4821937560");
        receipts.save(issued(jana, NOW, yearlyDocument(Year.of(2023), "2026-000002", Optional.empty()), Optional.empty()));
        receipts.save(issued(jana, NOW, yearlyDocument(Year.of(2022), "2026-000001", Optional.empty()), Optional.empty()));
        receipts.save(issued(jana, NOW, yearlyDocument(Year.of(2024), "2026-000003", Optional.empty()), Optional.empty()));
        flushAndClear();

        assertThat(receipts.findByDonorNewestFirst(jana)).extracting(receipt -> receipt.number().value())
                .containsExactly("2026-000003", "2026-000002", "2026-000001");
    }

    @Test
    @DisplayName("Given a donor whose replaced receipt shows a signature image, when asked whether a receipt of theirs shows an image, then that image does and another image or donor does not")
    void should_tell_whether_donor_receipt_shows_image_when_asked_given_replaced_signed_receipt() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        Donation march = storedDonation(jana, LocalDate.of(2026, 3, 15));
        DonationReceipt replaced = single(jana, march, "2026-000001");
        receipts.save(replaced);
        replaced.markSuperseded(NOW.plusSeconds(60));
        receipts.save(replaced);
        flushAndClear();

        assertThat(receipts.showsSignatureImage(jana, SIGNATURE.digest())).isTrue();
        assertThat(receipts.showsSignatureImage(jana, OTHER_SIGNATURE.digest())).isFalse();
        assertThat(receipts.showsSignatureImage(petr, SIGNATURE.digest())).isFalse();
    }

    @Test
    @DisplayName("Given a stored receipt image, when it is found by its digest, then its bytes and media type come back, and an unknown digest finds nothing")
    void should_find_stored_image_when_found_given_digest() {
        assertThat(images.find(SIGNATURE.digest())).hasValueSatisfying(image -> {
            assertThat(image.content()).isEqualTo(SIGNATURE.bytes());
            assertThat(image.mediaType()).isEqualTo("image/png");
            assertThat(image.digest()).isEqualTo(SIGNATURE.digest());
        });
        assertThat(images.find(new ContentDigest("e".repeat(64)))).isEmpty();
    }

    @Test
    @DisplayName("Given a stored image, when it is stored again, then nothing changes and it reads back unchanged")
    void should_keep_first_copy_when_stored_again_given_stored_image() {
        resources.storeImage(SIGNATURE.digest(), SIGNATURE, NOW.plusSeconds(60));
        flushAndClear();

        assertThat(resources.image(SIGNATURE.digest())).hasValueSatisfying(image -> {
            assertThat(image.bytes()).isEqualTo(SIGNATURE.bytes());
            assertThat(image.mediaType()).isEqualTo("image/png");
        });
        assertThat(jdbc.sql("select first_used_at from receipt_image where sha256 = ?").param(SIGNATURE.digest().value()).query(Instant.class).single())
                .isEqualTo(NOW);
        assertThat(resources.image(new ContentDigest("e".repeat(64)))).isEmpty();
    }

    private DonationReceipt single(DonorReference donor, Donation donation, String number) {
        return issued(donor, NOW, singleDocument(donation, number, Optional.empty()), Optional.empty());
    }

    private DonationReceipt yearly(DonorReference donor, Year year, String number, Optional<DonationReceiptId> supersedes) {
        Optional<ReplacedReceipt> replaces = supersedes.map(id -> new ReplacedReceipt(new ReceiptNumber("2026-000001"), ISSUED_ON));
        return issued(donor, NOW, yearlyDocument(year, number, replaces), supersedes);
    }

    private DonationReceipt issued(DonorReference donor, Instant at, ReceiptDocument document, Optional<DonationReceiptId> supersedes) {
        boolean english = document.locale() == LocaleCode.EN;
        FrozenReceipt frozen = new FrozenReceipt(document, english ? BILINGUAL : CZECH, english ? Optional.of(SIGNATURE.digest()) : Optional.empty(),
                verificationOf(document.number().value()));
        return DonationReceipt.issue(DonationReceiptId.newId(at), donor, at, FINGERPRINT, frozen, supersedes);
    }

    private static ReceiptDocument singleDocument(Donation donation, String number, Optional<ReplacedReceipt> replaces) {
        return new ReceiptDocument(ReceiptKind.SINGLE, new ReceiptNumber(number), ISSUED_ON, LocaleCode.EN, FOUNDATION, JANA_PARTY,
                List.of(new ReceiptLine(donation.id(), donation.receivedOn(), donation.amount(), DonationSource.BANK_TRANSFER)),
                donation.amount(), Optional.empty(), SIGNATORY, replaces);
    }

    private static ReceiptDocument yearlyDocument(Year year, String number, Optional<ReplacedReceipt> replaces) {
        Money amount = Money.czk(50000);
        return new ReceiptDocument(ReceiptKind.YEARLY, new ReceiptNumber(number), ISSUED_ON, LocaleCode.CS, FOUNDATION, JANA_PARTY,
                List.of(new ReceiptLine(DonationId.newId(NOW), year.atDay(1), amount, DonationSource.BANK_TRANSFER)), amount, Optional.of(year),
                SIGNATORY, replaces);
    }

    private static ReceiptVerification verificationOf(String number) {
        byte[] signature = new byte[ReceiptProof.SIGNATURE_BYTES];
        signature[0] = 7;
        return new ReceiptVerification(KEY_ID, new ReceiptProof(("proof of " + number).getBytes(StandardCharsets.UTF_8), signature));
    }

    private int insert(DonorReference donor, String kind, String year, String status, String supersededAt, String schemaVersion, int proofBytes) {
        return jdbc.sql("insert into issued_receipt (id, donor_id, kind, receipt_year, number, issued_on, issued_at, locale, fingerprint, status,"
                        + " schema_version, frozen, signing_key_id, proof, status_sha256, superseded_at)"
                        + " values (?, ?, " + kind + ", " + year + ", '2026-000009', current_date, now(), 'cs', ?, " + status + ", " + schemaVersion
                        + ", '{}', ?, ?, ?, " + supersededAt + ")")
                .params(UuidV7.generate(NOW), donor.value(), FINGERPRINT.value(), KEY_ID.value(), new byte[proofBytes], "a".repeat(64)).update();
    }

    private String frozenColumn(DonationReceipt receipt) {
        return jdbc.sql("select frozen from issued_receipt where id = ?").param(receipt.id().value()).query(String.class).single();
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private Donation storedDonation(DonorReference donor, LocalDate receivedOn) {
        BankPayment payment = payment(transactionIds++, receivedOn, Money.czk(50000), ACCOUNT, null);
        payments.saveAll(List.of(payment));
        Donation donation = Donation.fromBankPayment(DonationId.newId(NOW), donor, payment, PairingMethod.VARIABLE_SYMBOL, NOW);
        donations.save(donation);
        return donation;
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
