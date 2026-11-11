package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.ChangedMeanwhile;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoNotFound;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoAdminServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-11T09:00:00Z");
    private static final UUID ADMIN = UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-00112233aaaa");
    private static final BankCode CSAS = new BankCode("0800");
    private static final BankLogoSource ARTWORK = new BankLogoSource(CSAS, "https://is1-ssl.mzstatic.com/image/thumb/a/512x512bb.jpg");
    private static final BankLogoSource SITE = new BankLogoSource(CSAS, "https://www.csas.cz/content/icon.png");
    private static final byte[] OLD_WEBP = {1, 2, 3};
    private static final byte[] NEW_WEBP = {4, 5, 6};
    private static final StoredBankLogoImage OLD_IMAGE = new StoredBankLogoImage(new BankLogoImageId(UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-001122334455")),
            FetchedBankLogo.of(OLD_WEBP).sha256());

    private final InMemoryBankLogoRepository logos = new InMemoryBankLogoRepository();
    private final Transactions transactions = new Transactions();
    private final FakeImages images = new FakeImages(transactions);
    private final List<Object> events = new ArrayList<>();
    private final ApplicationEventPublisher publisher = events::add;
    private final BankLogoVersions versions = new BankLogoVersions(rows -> Integer.toHexString(rows.toString().hashCode()));
    private final BankLogoAdminService service = new BankLogoAdminService(logos, new Banks(), images, versions, publisher,
            new TransactionTemplate(transactions), new MutableClock(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given no logo of a bank, when an administrator sets its source as a new one, then the image is fetched outside any transaction, stored and audited once with the code, the host and the image's digest")
    void should_fetch_outside_transaction_and_store_when_set_given_new_code() {
        images.answer(NEW_WEBP);

        BankLogoAdminRow row = service.set(ADMIN, ARTWORK, BankLogoPrecondition.absent());

        assertThat(images.fetchedInsideTransaction()).containsExactly(false);
        BankLogo stored = logos.find(CSAS).orElseThrow();
        assertThat(stored.source()).isEqualTo(ARTWORK);
        assertThat(stored.image()).map(StoredBankLogoImage::sha256).contains(FetchedBankLogo.of(NEW_WEBP).sha256());
        assertThat(logos.images()).hasSize(1);
        assertThat(row.bankName()).isEqualTo("Česká spořitelna, a.s.");
        assertThat(row.version()).isEqualTo(versions.of(stored));
        assertThat(events).singleElement().isInstanceOfSatisfying(AdminActionPerformed.class, event -> {
            assertThat(event.action()).isEqualTo("SET_BANK_LOGO_SOURCE");
            assertThat(event.adminId()).isEqualTo(ADMIN);
            assertThat(event.details()).isEqualTo("Logo banky 0800 nastaveno z is1-ssl.mzstatic.com, obrázek " + FetchedBankLogo.of(NEW_WEBP).sha256())
                    .doesNotContain("512x512bb");
        });
    }

    @Test
    @DisplayName("Given a stored logo, when a new source cannot be fetched, then nothing is written or audited and the old image stays")
    void should_write_nothing_when_set_given_failing_fetch() {
        storeOldLogo();
        images.failWith(BankLogoFailure.REDIRECTED);

        assertThatThrownBy(() -> service.set(ADMIN, SITE, BankLogoPrecondition.anything()))
                .isInstanceOfSatisfying(BankLogoUnavailable.class, unavailable -> assertThat(unavailable.failure()).isEqualTo(BankLogoFailure.REDIRECTED));

        assertThat(logos.find(CSAS).orElseThrow().source()).isEqualTo(ARTWORK);
        assertThat(logos.images()).containsOnlyKeys(OLD_IMAGE.id());
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("Given a stored logo, when a browser names the version it read, then the new image replaces the old one, whose row is deleted")
    void should_replace_and_delete_old_image_when_set_given_current_version() {
        BankLogo old = storeOldLogo();
        images.answer(NEW_WEBP);

        service.set(ADMIN, SITE, BankLogoPrecondition.matching(ExpectedVersion.of(versions.of(old))));

        BankLogo stored = logos.find(CSAS).orElseThrow();
        assertThat(stored.source()).isEqualTo(SITE);
        assertThat(logos.images()).hasSize(1).doesNotContainKey(OLD_IMAGE.id());
        assertThat(events).hasSize(1);
    }

    @Test
    @DisplayName("Given a stored logo, when a stale version or a creation is named, then nothing changes and the refusal carries the current version and row")
    void should_refuse_when_set_given_stale_version_or_creation_of_existing() {
        BankLogo old = storeOldLogo();
        images.answer(NEW_WEBP);

        for (BankLogoPrecondition stale : List.of(BankLogoPrecondition.matching(ExpectedVersion.of("0123456789abcdef")), BankLogoPrecondition.absent())) {
            assertThatThrownBy(() -> service.set(ADMIN, SITE, stale)).isInstanceOfSatisfying(ChangedMeanwhile.class, refused -> {
                assertThat(refused.extensions()).containsEntry("version", versions.of(old));
                assertThat(refused.extensions().get("current")).isInstanceOf(BankLogoAdminRow.class);
            });
        }

        assertThat(images.fetchedInsideTransaction()).isEmpty();
        assertThat(logos.find(CSAS)).contains(old);
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("Given another administrator creates the same bank's logo between the check and the insert, when a creation is written, then it is refused instead of overwriting theirs")
    void should_refuse_creation_when_written_given_concurrent_creation() {
        BankLogo theirs = BankLogo.from(SITE);
        InMemoryBankLogoRepository racing = new InMemoryBankLogoRepository() {
            @Override
            public boolean insertIfAbsent(BankLogoSource source) {
                put(theirs);
                return false;
            }
        };
        BankLogoAdminService racingService = new BankLogoAdminService(racing, new Banks(), images, versions, publisher,
                new TransactionTemplate(transactions), new MutableClock(NOW, ZoneOffset.UTC));
        images.answer(NEW_WEBP);

        assertThatThrownBy(() -> racingService.set(ADMIN, ARTWORK, BankLogoPrecondition.absent())).isInstanceOf(ChangedMeanwhile.class);

        assertThat(racing.find(CSAS)).contains(theirs);
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("Given no logo of a bank, when a version is named for it, then it is not found and nothing is fetched")
    void should_be_not_found_when_set_given_version_of_absent_logo() {
        assertThatThrownBy(() -> service.set(ADMIN, ARTWORK, BankLogoPrecondition.matching(ExpectedVersion.of("0123456789abcdef"))))
                .isInstanceOf(BankLogoNotFound.class);

        assertThat(images.fetchedInsideTransaction()).isEmpty();
        assertThat(logos.find(CSAS)).isEmpty();
    }

    @Test
    @DisplayName("Given a stored logo, when a connection names no version, then the change applies to the logo as it is")
    void should_apply_when_set_given_connection_without_version() {
        storeOldLogo();
        images.answer(NEW_WEBP);

        service.set(ADMIN, SITE, BankLogoPrecondition.anything());

        assertThat(logos.find(CSAS).orElseThrow().source()).isEqualTo(SITE);
    }

    @Test
    @DisplayName("Given a stored logo whose source still serves the same picture, when it is refreshed, then the image stays, the check moves and the refresh is audited")
    void should_keep_image_and_audit_when_refreshed_given_unchanged_picture() {
        storeOldLogo();
        images.answer(OLD_WEBP);

        BankLogoAdminRow row = service.refresh(ADMIN, CSAS);

        assertThat(row.checkedAt()).isEqualTo(NOW);
        assertThat(logos.images()).containsOnlyKeys(OLD_IMAGE.id());
        assertThat(events).singleElement().isInstanceOfSatisfying(AdminActionPerformed.class, event -> {
            assertThat(event.action()).isEqualTo("REFRESH_BANK_LOGO");
            assertThat(event.details()).isEqualTo("Logo banky 0800 znovu staženo z is1-ssl.mzstatic.com, obrázek " + OLD_IMAGE.sha256());
        });
    }

    @Test
    @DisplayName("Given no logo of a bank, when it is refreshed, then it is not found and nothing is fetched")
    void should_be_not_found_when_refreshed_given_no_logo() {
        assertThatThrownBy(() -> service.refresh(ADMIN, CSAS)).isInstanceOf(BankLogoNotFound.class);

        assertThat(images.fetchedInsideTransaction()).isEmpty();
    }

    @Test
    @DisplayName("Given a stored logo, when it is removed with its version, then the logo and its image are gone and the removal is audited; with a stale version nothing goes")
    void should_remove_logo_and_image_when_removed_given_current_version() {
        BankLogo old = storeOldLogo();

        assertThatThrownBy(() -> service.remove(ADMIN, CSAS, ExpectedVersion.of("0123456789abcdef"))).isInstanceOf(ChangedMeanwhile.class);
        assertThat(logos.find(CSAS)).isPresent();

        service.remove(ADMIN, CSAS, ExpectedVersion.of(versions.of(old)));

        assertThat(logos.find(CSAS)).isEmpty();
        assertThat(logos.images()).isEmpty();
        assertThat(events).singleElement().isInstanceOfSatisfying(AdminActionPerformed.class, event -> {
            assertThat(event.action()).isEqualTo("REMOVE_BANK_LOGO");
            assertThat(event.details()).isEqualTo("Logo banky 0800 odebráno");
        });
    }

    @Test
    @DisplayName("Given logos of a listed and an unlisted bank, when they are listed, then each carries the ČNB name where there is one and its version")
    void should_name_banks_when_listed_given_codes_on_and_off_the_cnb_list() {
        BankLogo old = storeOldLogo();
        logos.put(BankLogo.from(new BankLogoSource(new BankCode("9999"), "https://is3-ssl.mzstatic.com/x.jpg")));

        List<BankLogoAdminRow> rows = service.list();

        assertThat(rows).extracting(BankLogoAdminRow::code).containsExactly("0800", "9999");
        assertThat(rows.getFirst().bankName()).isEqualTo("Česká spořitelna, a.s.");
        assertThat(rows.getFirst().version()).isEqualTo(versions.of(old));
        assertThat(rows.getFirst().imageSha256()).isEqualTo(OLD_IMAGE.sha256());
        assertThat(rows.getLast().bankName()).isNull();
        assertThat(rows.getLast().imageId()).isNull();
    }

    private BankLogo storeOldLogo() {
        BankLogo old = BankLogo.from(ARTWORK).fetched(OLD_IMAGE, NOW.minusSeconds(3600));
        logos.put(old);
        logos.putImage(OLD_IMAGE.id(), OLD_WEBP);
        return old;
    }

    static final class Transactions implements PlatformTransactionManager {

        private int open;

        boolean isOpen() {
            return open > 0;
        }

        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            open++;
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
            open--;
        }

        @Override
        public void rollback(TransactionStatus status) {
            open--;
        }
    }

    static final class FakeImages implements BankLogoImages {

        private final Transactions transactions;
        private final List<Boolean> insideTransaction = new ArrayList<>();
        private byte[] webp;
        private BankLogoFailure failure;
        private Runnable duringFetch = () -> {
        };

        FakeImages(Transactions transactions) {
            this.transactions = transactions;
        }

        void answer(byte[] answer) {
            webp = answer;
            failure = null;
        }

        void failWith(BankLogoFailure refusal) {
            failure = refusal;
        }

        void whileFetching(Runnable work) {
            duringFetch = work;
        }

        List<Boolean> fetchedInsideTransaction() {
            return insideTransaction;
        }

        @Override
        public FetchedBankLogo fetch(BankLogoSource source) {
            insideTransaction.add(transactions.isOpen());
            duringFetch.run();
            if (failure != null) {
                throw new BankLogoUnavailable(failure);
            }
            return FetchedBankLogo.of(webp);
        }
    }

    private static final class Banks implements BankCodeRepository {

        @Override
        public List<CzechBank> findAll() {
            return List.of(new CzechBank(new BankCode("0800"), new BankName("Česká spořitelna, a.s.")));
        }

        @Override
        public BankCodeListState state() {
            return BankCodeListState.none();
        }

        @Override
        public void store(BankCodeList list, BankCodeListState state) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void save(BankCodeListState state) {
            throw new UnsupportedOperationException();
        }
    }
}
