package cz.novanadeje.app.donations.application.banklogo;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FetchedBankLogoTest {

    private static final byte[] WEBP = "RIFF-webp-logo".getBytes();

    @Test
    @DisplayName("Given WebP bytes, when a fetched bank logo is made of them, then it keeps a copy, hands out copies and names their SHA-256")
    void should_keep_copy_and_digest_when_made_given_webp_bytes() {
        byte[] bytes = WEBP.clone();

        FetchedBankLogo logo = FetchedBankLogo.of(bytes);
        bytes[0] = 0;
        logo.webp()[1] = 0;

        assertThat(logo.webp()).isEqualTo(WEBP);
        assertThat(logo.sha256()).hasSize(64).isEqualTo(FetchedBankLogo.of(WEBP).sha256());
    }

    @Test
    @DisplayName("Given two fetched bank logos of the same bytes, when compared, then they are equal, and different bytes make them differ")
    void should_be_equal_when_compared_given_same_bytes() {
        assertThat(FetchedBankLogo.of(WEBP)).isEqualTo(FetchedBankLogo.of(WEBP.clone())).hasSameHashCodeAs(FetchedBankLogo.of(WEBP.clone()));
        assertThat(FetchedBankLogo.of(WEBP)).isNotEqualTo(FetchedBankLogo.of("RIFF-webp-other".getBytes()));
    }

    @Test
    @DisplayName("Given a fetched bank logo, when printed, then its length and digest show and its bytes do not")
    void should_print_length_and_digest_when_printed_given_fetched_bank_logo() {
        FetchedBankLogo logo = FetchedBankLogo.of(WEBP);

        assertThat(logo).hasToString("FetchedBankLogo[" + WEBP.length + " bytes, sha256 " + logo.sha256() + "]");
    }

    @Test
    @DisplayName("Given no bytes or more than 64 KiB, when a fetched bank logo is made, then it is refused")
    void should_refuse_when_made_given_no_bytes_or_too_many() {
        assertThatThrownBy(() -> FetchedBankLogo.of(new byte[0])).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> FetchedBankLogo.of(new byte[FetchedBankLogo.MAX_BYTES + 1])).isInstanceOf(IllegalArgumentException.class);
    }
}
