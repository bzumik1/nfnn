package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.SetupCodeAnnouncer;
import cz.novanadeje.app.operations.domain.settings.SetupCode;
import org.springframework.stereotype.Component;

import java.io.PrintStream;

@Component
class ConsoleSetupCodeAnnouncer implements SetupCodeAnnouncer {

    private final PrintStream console;

    ConsoleSetupCodeAnnouncer() {
        this(System.out);
    }

    ConsoleSetupCodeAnnouncer(PrintStream console) {
        this.console = console;
    }

    @Override
    public void announce(SetupCode code) {
        console.println("""

                ============================================================
                 První nastavení webu / First setup
                 Otevřete web z domácí sítě, nebo zadejte tento kód:
                 Open the site from the home network, or enter this code:

                     %s

                 Kód platí do dokončení nastavení nebo do restartu.
                 The code is valid until the setup is done or a restart.
                ============================================================
                """.formatted(code.display()));
        console.flush();
    }
}
