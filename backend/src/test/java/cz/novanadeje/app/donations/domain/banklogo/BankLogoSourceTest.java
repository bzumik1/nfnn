package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoSourceTest {

    private static final String ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/87/04/b8/AppIcon/512x512bb.jpg";

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
            "0800, https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/87/04/b8/AppIcon/512x512bb.jpg",
            "9999, https://is5-ssl.mzstatic.com/image/thumb/x/512x512bb.jpg",
            "0800, https://www.csas.cz/content/dam/icon.png",
            "0800, https://cdn.erstegroup.com/content/dam/cz/csas/icon.png",
            "0300, https://www.csob.cz/icon.png",
            "0100, https://www.kb.cz/icon.png",
            "0600, https://www.moneta.cz/icon.png",
            "2010, https://www.fio.cz:443/icon.png",
            "3030, https://www.airbank.cz/icon.png",
            "5500, https://www.rb.cz/icon.png",
            "2700, https://www.unicreditbank.cz/icon.png",
            "6210, https://www.mbank.cz/icon.png"})
    @DisplayName("Given an https address on the App Store artwork hosts or the bank's own site, when it is taken as the bank's logo source, then it is kept with its host")
    void should_accept_source_when_taken_given_an_allowed_host(String code, String url) {
        BankLogoSource source = new BankLogoSource(new BankCode(code), url);

        assertThat(source.url()).isEqualTo(url);
        assertThat(source.host()).isEqualTo(java.net.URI.create(url).getHost());
    }

    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
            "0300, https://www.csas.cz/icon.png",
            "0800, https://www.kb.cz/icon.png",
            "9999, https://www.fio.cz/icon.png",
            "2010, https://cdn.erstegroup.com/icon.png"})
    @DisplayName("Given the site of another bank, when it is taken as a bank's logo source, then it is refused")
    void should_refuse_source_when_taken_given_another_banks_host(String code, String url) {
        assertThatThrownBy(() -> new BankLogoSource(new BankCode(code), url)).isInstanceOf(BankLogoSourceInvalid.class);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "http://is1-ssl.mzstatic.com/icon.jpg",
            "https://is6-ssl.mzstatic.com/icon.jpg",
            "https://is1-ssl.mzstatic.com:8443/icon.jpg",
            "https://user@is1-ssl.mzstatic.com/icon.jpg",
            "https://is1-ssl.mzstatic.com/icon.jpg?size=512",
            "https://is1-ssl.mzstatic.com/icon.jpg#top",
            "https://IS1-SSL.mzstatic.com/icon.jpg",
            "https://is1-ssl.mzstatic.com.evil.example/icon.jpg",
            "https://evil.example/is1-ssl.mzstatic.com/icon.jpg",
            "https://is1-ssl.mzstatic.com./icon.jpg",
            "https://mzstatic.com/icon.jpg",
            "https://127.0.0.1/icon.jpg",
            "https://[::1]/icon.jpg",
            "https://is1-ssl.mzstatic.com/ icon.jpg",
            "https://is1-ssl.mzstatic.com/icon\u0007.jpg",
            "https://is1-ssl.mzst\u00e4tic.com/x",
            "https://xn--is1-ssl-xxx.mzstatic.com/x",
            "https://is1-ssl.mzstatic.com\\@evil.example/",
            "https://is1-ssl.mzstatic%2Ecom/x",
            "https://is1-ssl.mzstatic.com;evil.example/",
            "https://is1-ssl.mzstatic.com@evil.example/",
            "https://is1-ssl.mzstatic.com:+443/x",
            "https://is1-ssl.mzstatic.com:65979/x",
            "https://is1-ssl.mzstatic.com:4294967739/x",
            " https://is1-ssl.mzstatic.com/icon.jpg",
            "ftp://is1-ssl.mzstatic.com/icon.jpg",
            "https:is1-ssl.mzstatic.com",
            "https://",
            ""})
    @DisplayName("Given an address that is not plain https on an allowed host, when it is taken as a logo source, then it is refused")
    void should_refuse_source_when_taken_given_a_disallowed_address(String url) {
        assertThatThrownBy(() -> new BankLogoSource(new BankCode("0800"), url)).isInstanceOf(BankLogoSourceInvalid.class);
    }

    @Test
    @DisplayName("Given an address longer than 500 characters, when it is taken as a logo source, then it is refused")
    void should_refuse_source_when_taken_given_too_long() {
        String url = "https://is1-ssl.mzstatic.com/" + "a".repeat(BankLogoSource.MAX_LENGTH);

        assertThatThrownBy(() -> new BankLogoSource(new BankCode("0800"), url)).isInstanceOf(BankLogoSourceInvalid.class);
    }

    @Test
    @DisplayName("Given a stored address the allow-list no longer admits, when it is read back as stored, then it keeps its address and is marked as no longer allowed")
    void should_mark_not_allowed_when_read_back_given_stored_address_off_the_allow_list() {
        BankLogoSource stored = BankLogoSource.stored(new BankCode("0800"), "https://www.example.com/old-icon.png");

        assertThat(stored.url()).isEqualTo("https://www.example.com/old-icon.png");
        assertThat(stored.bank()).isEqualTo(new BankCode("0800"));
        assertThat(stored.allowed()).isFalse();
    }

    @Test
    @DisplayName("Given a stored address the allow-list still admits, when it is read back as stored, then it is allowed and equals the same address taken anew")
    void should_be_allowed_when_read_back_given_stored_address_on_the_allow_list() {
        BankLogoSource stored = BankLogoSource.stored(new BankCode("0800"), ARTWORK);

        assertThat(stored.allowed()).isTrue();
        assertThat(stored).isEqualTo(new BankLogoSource(new BankCode("0800"), ARTWORK));
    }

    @Test
    @DisplayName("Given no address or no bank, when a logo source is made, then it is refused")
    void should_refuse_source_when_made_given_nothing() {
        assertThatThrownBy(() -> new BankLogoSource(new BankCode("0800"), null)).isInstanceOf(BankLogoSourceInvalid.class);
        assertThatThrownBy(() -> new BankLogoSource(null, ARTWORK)).isInstanceOf(IllegalArgumentException.class);
    }
}
