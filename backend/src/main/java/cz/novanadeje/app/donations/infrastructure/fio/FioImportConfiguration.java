package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.fio.FioClient;
import cz.novanadeje.fio.FioToken;
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
                .build();
    }
}
