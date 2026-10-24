package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.donors.domain.Totp;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Component
@ScenarioScope
public class TotpCodes {

    private final Clock clock;
    private final Map<String, Long> lastUsedSteps = new HashMap<>();

    public TotpCodes(Clock clock) {
        this.clock = clock;
    }

    public String currentCode(String secret) {
        return Totp.codeAt(new TotpSecret(secret), Totp.stepAt(clock.instant()));
    }

    public String freshCode(String secret) {
        long current = Totp.stepAt(clock.instant());
        Long lastUsed = lastUsedSteps.get(secret);
        long step = lastUsed == null || lastUsed < current ? current : lastUsed + 1;
        if (step > current + 1) {
            if (!(clock instanceof MutableClock mutable)) {
                throw new IllegalStateException("Every code of the current window was used; let time pass in the scenario");
            }
            mutable.advance(Duration.ofSeconds(Totp.STEP_SECONDS));
            return freshCode(secret);
        }
        lastUsedSteps.put(secret, step);
        return Totp.codeAt(new TotpSecret(secret), step);
    }
}
