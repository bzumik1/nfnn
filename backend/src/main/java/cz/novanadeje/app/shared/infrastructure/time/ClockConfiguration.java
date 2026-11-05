package cz.novanadeje.app.shared.infrastructure.time;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;

@Configuration(proxyBeanMethods = false)
class ClockConfiguration {

    static final Duration STORED_PRECISION = Duration.ofNanos(1_000);

    @Bean
    Clock clock() {
        return Clock.tick(Clock.systemUTC(), STORED_PRECISION);
    }
}
