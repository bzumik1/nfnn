package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.SetupCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ConsoleSetupCodeAnnouncerTest {

    @Test
    @DisplayName("Given a code, when it is announced, then the console shows it in groups with a Czech instruction")
    void should_print_code_when_announced_given_code() {
        ByteArrayOutputStream console = new ByteArrayOutputStream();

        new ConsoleSetupCodeAnnouncer(new PrintStream(console, true, StandardCharsets.UTF_8)).announce(new SetupCode("K7QM2XPA9TRD"));

        assertThat(console.toString(StandardCharsets.UTF_8)).contains("K7QM-2XPA-9TRD", "První nastavení webu", "domácí sítě");
    }
}
