package cz.novanadeje.app.shared.infrastructure.live;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("app.live")
public record LiveProperties(Duration heartbeat, int streamsPerDonor, int streams, int streamsReservedForAdministrators) {

    public LiveProperties {
        if (heartbeat == null || heartbeat.isNegative() || heartbeat.isZero()) {
            throw new IllegalArgumentException("app.live.heartbeat must be positive");
        }
        if (streamsPerDonor < 1) {
            throw new IllegalArgumentException("app.live.streams-per-donor must be at least 1");
        }
        if (streamsReservedForAdministrators < 0 || streamsReservedForAdministrators >= streams) {
            throw new IllegalArgumentException("app.live.streams-reserved-for-administrators must be at least 0 and below app.live.streams");
        }
    }

    int streamsForDonors() {
        return streams - streamsReservedForAdministrators;
    }
}
