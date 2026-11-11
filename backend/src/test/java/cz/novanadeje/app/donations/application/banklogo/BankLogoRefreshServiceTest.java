package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoRefreshServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-11T04:50:00Z");
    private static final BankCode CSAS = new BankCode("0800");
    private static final BankCode KB = new BankCode("0100");
    private static final BankLogoSource CSAS_ARTWORK = new BankLogoSource(CSAS, "https://is1-ssl.mzstatic.com/a/512x512bb.jpg");
    private static final BankLogoSource CSAS_SITE = new BankLogoSource(CSAS, "https://www.csas.cz/icon.png");
    private static final BankLogoSource KB_ARTWORK = new BankLogoSource(KB, "https://is2-ssl.mzstatic.com/b/512x512bb.jpg");
    private static final byte[] OLD_WEBP = {1, 2, 3};
    private static final byte[] NEW_WEBP = {4, 5, 6};
    private static final StoredBankLogoImage OLD_IMAGE = new StoredBankLogoImage(new BankLogoImageId(UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-001122334455")),
            FetchedBankLogo.of(OLD_WEBP).sha256());

    private final InMemoryBankLogoRepository logos = new InMemoryBankLogoRepository();
    private final BankLogoAdminServiceTest.Transactions transactions = new BankLogoAdminServiceTest.Transactions();
    private final BankLogoAdminServiceTest.FakeImages images = new BankLogoAdminServiceTest.FakeImages(transactions);
    private final BankLogoRefreshService service = new BankLogoRefreshService(logos, images, new TransactionTemplate(transactions),
            new MutableClock(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given a logo never fetched, one checked 8 days ago and one checked today, when the due logos are listed, then the first two are due")
    void should_list_never_fetched_and_week_old_when_due_given_three_logos() {
        logos.put(BankLogo.from(KB_ARTWORK));
        logos.put(BankLogo.from(CSAS_ARTWORK).fetched(OLD_IMAGE, NOW.minus(Duration.ofDays(8))));
        logos.put(BankLogo.from(new BankLogoSource(new BankCode("2010"), "https://www.fio.cz/icon.png"))
                .fetched(new StoredBankLogoImage(new BankLogoImageId(UUID.randomUUID()), "b".repeat(64)), NOW.minus(Duration.ofHours(1))));

        assertThat(service.due()).containsExactly(KB, CSAS);
    }

    @Test
    @DisplayName("Given a due logo whose source now serves another picture, when it is refreshed, then the new image replaces the old one outside any transaction for the fetch")
    void should_replace_image_when_refreshed_given_changed_picture() {
        storeOld();
        images.answer(NEW_WEBP);

        assertThat(service.refresh(CSAS)).isEqualTo(BankLogoCheck.FETCHED);

        assertThat(images.fetchedInsideTransaction()).containsExactly(false);
        assertThat(logos.find(CSAS).orElseThrow().holds(FetchedBankLogo.of(NEW_WEBP).sha256())).isTrue();
        assertThat(logos.images()).hasSize(1).doesNotContainKey(OLD_IMAGE.id());
    }

    @Test
    @DisplayName("Given a due logo whose source serves the same picture, when it is refreshed, then only the check time moves")
    void should_move_check_time_when_refreshed_given_same_picture() {
        storeOld();
        images.answer(OLD_WEBP);

        assertThat(service.refresh(CSAS)).isEqualTo(BankLogoCheck.UNCHANGED);

        BankLogo checked = logos.find(CSAS).orElseThrow();
        assertThat(checked.checkedAt()).contains(NOW);
        assertThat(checked.fetchedAt()).contains(NOW.minus(Duration.ofDays(8)));
    }

    @Test
    @DisplayName("Given a due logo whose source fails, when it is refreshed, then the failure is recorded, the image and check time stay and the failure is raised")
    void should_record_failure_and_keep_image_when_refreshed_given_failing_source() {
        storeOld();
        images.failWith(BankLogoFailure.TIMEOUT);

        assertThatThrownBy(() -> service.refresh(CSAS)).isInstanceOf(BankLogoUnavailable.class);

        BankLogo failed = logos.find(CSAS).orElseThrow();
        assertThat(failed.image()).contains(OLD_IMAGE);
        assertThat(failed.checkedAt()).contains(NOW.minus(Duration.ofDays(8)));
        assertThat(failed.lastFailure()).contains(BankLogoFailure.TIMEOUT);
    }

    @Test
    @DisplayName("Given an administrator changes the source while the job fetches, when the job writes, then it leaves the new source alone")
    void should_skip_when_refreshed_given_source_changed_meanwhile() {
        storeOld();
        images.answer(NEW_WEBP);
        images.whileFetching(() -> logos.put(BankLogo.from(CSAS_SITE)));

        assertThat(service.refresh(CSAS)).isEqualTo(BankLogoCheck.SKIPPED);

        assertThat(logos.find(CSAS)).contains(BankLogo.from(CSAS_SITE));
    }

    @Test
    @DisplayName("Given an administrator changes the source while the job's fetch fails, when the job records the failure, then the new source keeps no failure")
    void should_not_record_failure_when_refreshed_given_source_changed_meanwhile() {
        storeOld();
        images.failWith(BankLogoFailure.STATUS);
        images.whileFetching(() -> logos.put(BankLogo.from(CSAS_SITE)));

        assertThatThrownBy(() -> service.refresh(CSAS)).isInstanceOf(BankLogoUnavailable.class);

        assertThat(logos.find(CSAS).orElseThrow().lastFailure()).isEmpty();
    }

    private void storeOld() {
        logos.put(BankLogo.from(CSAS_ARTWORK).fetched(OLD_IMAGE, NOW.minus(Duration.ofDays(8))));
        logos.putImage(OLD_IMAGE.id(), OLD_WEBP);
    }
}
