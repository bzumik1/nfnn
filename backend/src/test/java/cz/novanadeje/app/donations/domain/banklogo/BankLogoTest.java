package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoTest {

    private static final BankCode CSAS = new BankCode("0800");
    private static final BankLogoSource ARTWORK = new BankLogoSource(CSAS, "https://is1-ssl.mzstatic.com/a/512x512bb.jpg");
    private static final BankLogoSource OTHER_ARTWORK = new BankLogoSource(CSAS, "https://is2-ssl.mzstatic.com/b/512x512bb.jpg");
    private static final Instant FETCHED = Instant.parse("2026-11-04T04:50:00Z");
    private static final StoredBankLogoImage IMAGE = new StoredBankLogoImage(new BankLogoImageId(UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-001122334455")),
            "a".repeat(64));

    @Test
    @DisplayName("Given a new source, when the logo is made, then it holds no image and is due at once")
    void should_be_due_without_image_when_made_given_new_source() {
        BankLogo logo = BankLogo.from(ARTWORK);

        assertThat(logo.image()).isEmpty();
        assertThat(logo.isDue(FETCHED)).isTrue();
    }

    @Test
    @DisplayName("Given a logo whose stored source the allow-list no longer admits, when it is checked, then it is never due, fetched or not")
    void should_never_be_due_when_checked_given_source_no_longer_allowed() {
        BankLogoSource offList = BankLogoSource.stored(CSAS, "https://www.example.com/old-icon.png");

        assertThat(BankLogo.from(offList).isDue(FETCHED)).isFalse();
        assertThat(BankLogo.from(offList).fetched(IMAGE, FETCHED).isDue(FETCHED.plus(Duration.ofDays(30)))).isFalse();
    }

    @Test
    @DisplayName("Given a logo fetched now, when it is checked within 7 days, then it is not due, and after 7 days it is")
    void should_be_due_only_after_seven_days_when_checked_given_fetched_logo() {
        BankLogo logo = BankLogo.from(ARTWORK).fetched(IMAGE, FETCHED);

        assertThat(logo.isDue(FETCHED.plus(Duration.ofDays(7)))).isFalse();
        assertThat(logo.isDue(FETCHED.plus(Duration.ofDays(7)).plusSeconds(1))).isTrue();
    }

    @Test
    @DisplayName("Given a failed check, when it is recorded, then the image and the check time stay and the failure is named until the next fetch")
    void should_keep_image_and_check_time_when_failed_given_fetched_logo() {
        BankLogo failed = BankLogo.from(ARTWORK).fetched(IMAGE, FETCHED).failed(BankLogoFailure.TIMEOUT);

        assertThat(failed.image()).contains(IMAGE);
        assertThat(failed.checkedAt()).contains(FETCHED);
        assertThat(failed.lastFailure()).contains(BankLogoFailure.TIMEOUT);
        assertThat(failed.fetched(IMAGE, FETCHED.plusSeconds(60)).lastFailure()).isEmpty();
    }

    @Test
    @DisplayName("Given an unchanged image, when it is recorded, then the fetch time stays and the check time moves")
    void should_move_only_check_time_when_unchanged_given_fetched_logo() {
        BankLogo unchanged = BankLogo.from(ARTWORK).fetched(IMAGE, FETCHED).failed(BankLogoFailure.STATUS).unchanged(FETCHED.plusSeconds(60));

        assertThat(unchanged.fetchedAt()).contains(FETCHED);
        assertThat(unchanged.checkedAt()).contains(FETCHED.plusSeconds(60));
        assertThat(unchanged.lastFailure()).isEmpty();
        assertThat(unchanged.holds(IMAGE.sha256())).isTrue();
        assertThat(unchanged.holds("b".repeat(64))).isFalse();
    }

    @Test
    @DisplayName("Given another source of the same bank, when the logo is pointed at it with a new image, then both change together")
    void should_replace_source_and_image_when_pointed_given_new_source() {
        StoredBankLogoImage newer = new StoredBankLogoImage(new BankLogoImageId(UUID.randomUUID()), "b".repeat(64));

        BankLogo moved = BankLogo.from(ARTWORK).fetched(IMAGE, FETCHED).from(OTHER_ARTWORK, newer, FETCHED.plusSeconds(60));

        assertThat(moved.source()).isEqualTo(OTHER_ARTWORK);
        assertThat(moved.image()).contains(newer);
        assertThat(moved.fetchedAt()).contains(FETCHED.plusSeconds(60));
    }

    @Test
    @DisplayName("Given a source of another bank, when a logo is pointed at it, then it is refused")
    void should_refuse_when_pointed_given_source_of_another_bank() {
        BankLogoSource kb = new BankLogoSource(new BankCode("0100"), "https://www.kb.cz/icon.png");

        assertThatThrownBy(() -> BankLogo.from(ARTWORK).from(kb, IMAGE, FETCHED)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given an image without its fetch time, when a logo is made, then it is refused")
    void should_refuse_when_made_given_image_without_fetch_time() {
        assertThatThrownBy(() -> new BankLogo(CSAS, ARTWORK, Optional.of(IMAGE), Optional.empty(), Optional.of(FETCHED), Optional.empty()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a sha-256 that is not 64 lowercase hex characters, when a stored image is named, then it is refused")
    void should_refuse_stored_image_when_named_given_malformed_digest() {
        assertThatThrownBy(() -> new StoredBankLogoImage(IMAGE.id(), "A".repeat(64))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new StoredBankLogoImage(IMAGE.id(), "a".repeat(63))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given every failure, when its word is read, then it is a short lowercase word the table admits and it reads back")
    void should_read_back_word_when_named_given_every_failure() {
        for (BankLogoFailure failure : BankLogoFailure.values()) {
            assertThat(failure.word()).matches("[a-z-]{1,32}");
            assertThat(BankLogoFailure.ofWord(failure.word())).isEqualTo(failure);
        }
    }
}
