package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageNotFound;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PublicBankLogoServiceTest {

    private static final BankLogoImageId IMAGE_ID = new BankLogoImageId(UUID.fromString("0192f4d2-1a6b-7c3d-9e8f-001122334455"));

    private final InMemoryBankLogoRepository logos = new InMemoryBankLogoRepository();
    private final PublicBankLogoService service = new PublicBankLogoService(logos);

    @Test
    @DisplayName("Given a fetched logo and one never fetched, when the published logos are read, then only the fetched one comes, with its code and image id")
    void should_publish_only_fetched_logos_when_read_given_one_never_fetched() {
        logos.put(BankLogo.from(new BankLogoSource(new BankCode("0800"), "https://is1-ssl.mzstatic.com/a.jpg"))
                .fetched(new StoredBankLogoImage(IMAGE_ID, "a".repeat(64)), Instant.parse("2026-11-11T04:50:00Z")));
        logos.put(BankLogo.from(new BankLogoSource(new BankCode("0100"), "https://is1-ssl.mzstatic.com/b.jpg")));

        assertThat(service.published()).containsExactly(new PublishedBankLogo("0800", IMAGE_ID.value()));
    }

    @Test
    @DisplayName("Given a fetched logo whose stored source the allow-list no longer admits, when the published logos are read, then it is left out")
    void should_leave_out_logo_when_read_given_source_no_longer_allowed() {
        logos.put(BankLogo.from(BankLogoSource.stored(new BankCode("0800"), "https://www.example.com/old-icon.png"))
                .fetched(new StoredBankLogoImage(IMAGE_ID, "a".repeat(64)), Instant.parse("2026-11-11T04:50:00Z")));

        assertThat(service.published()).isEmpty();
    }

    @Test
    @DisplayName("Given a stored image, when it is asked by its id, then its WebP bytes come, and an unknown id is not found")
    void should_serve_bytes_when_asked_given_stored_image() {
        logos.putImage(IMAGE_ID, new byte[]{1, 2});

        assertThat(service.image(IMAGE_ID)).containsExactly(1, 2);
        assertThatThrownBy(() -> service.image(new BankLogoImageId(UUID.randomUUID()))).isInstanceOf(BankLogoImageNotFound.class);
    }
}
