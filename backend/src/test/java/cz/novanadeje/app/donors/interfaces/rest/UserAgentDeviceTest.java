package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class UserAgentDeviceTest {

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', textBlock = """
            Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1 | IPHONE | SAFARI
            Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1 | IPHONE | CHROME
            Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1 | IPAD | SAFARI
            Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 | ANDROID | CHROME
            Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 EdgA/142.0 | ANDROID | EDGE
            Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15 | MAC | SAFARI
            Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0 | MAC | FIREFOX
            Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0 | WINDOWS | EDGE
            Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 | WINDOWS | CHROME
            Mozilla/5.0 (X11; CrOS x86_64 16328.55.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 | CHROMEBOOK | CHROME
            Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0 | LINUX | FIREFOX
            curl/8.17.0 | OTHER | OTHER
            """)
    @DisplayName("Given a browser's User-Agent, when it is read, then it names the platform and the browser")
    void should_name_platform_and_browser_when_read_given_user_agent(String userAgent, DevicePlatform platform, DeviceBrowser browser) {
        assertThat(UserAgentDevice.of(userAgent)).isEqualTo(new DeviceDescription(platform, browser));
    }

    @Test
    @DisplayName("Given no User-Agent, when it is read, then the device is unknown")
    void should_be_unknown_when_read_given_no_user_agent() {
        assertThat(UserAgentDevice.of((String) null)).isEqualTo(DeviceDescription.UNKNOWN);
        assertThat(UserAgentDevice.of(" ")).isEqualTo(DeviceDescription.UNKNOWN);
    }

    @Test
    @DisplayName("Given a User-Agent naming its platform only after the first 512 characters, when it is read, then the rest is not read")
    void should_read_only_first_characters_when_read_given_long_user_agent() {
        String userAgent = "x".repeat(512) + " (iPhone) Safari/604.1";

        assertThat(UserAgentDevice.of(userAgent)).isEqualTo(DeviceDescription.UNKNOWN);
    }
}
