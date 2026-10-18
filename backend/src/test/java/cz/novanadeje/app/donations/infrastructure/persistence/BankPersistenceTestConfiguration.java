package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.support.MutableClock;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.time.ZoneId;

@TestConfiguration(proxyBeanMethods = false)
@Import({TestcontainersConfiguration.class, JpaBankPaymentRepository.class, JpaBankImportStateRepository.class, JpaDonorRecordRepository.class,
        JpaDonationRepository.class, JpaDonationReceiptRepository.class})
class BankPersistenceTestConfiguration {

    static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");

    @Bean
    MutableClock mutableClock() {
        return new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    }
}
