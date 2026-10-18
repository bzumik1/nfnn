package cz.novanadeje.app.donations.infrastructure.fio;

import io.github.bzumik1.fio.FioClient;
import io.github.bzumik1.fio.FioToken;
import io.github.bzumik1.fio.RateLimit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
class FioImportConfiguration {

    @Bean
    FioClient fioClient(FioImportProperties properties, Clock clock) {
        if (!properties.hasToken()) {
            return new DisabledFioClient();
        }
        return FioClient.builder(FioToken.of(properties.token()))
                .baseUri(properties.baseUri())
                .clock(clock)
                .requestTimeout(properties.requestTimeout())
                .rateLimit(RateLimit.failFast())
                .build();
    }
}
