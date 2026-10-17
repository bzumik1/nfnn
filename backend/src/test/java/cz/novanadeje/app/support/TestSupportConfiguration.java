package cz.novanadeje.app.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.time.ZoneId;

@TestConfiguration(proxyBeanMethods = false)
public class TestSupportConfiguration {

    @Bean
    @Primary
    public MutableClock mutableClock() {
        return new MutableClock(Instant.now(), ZoneId.of("Europe/Prague"));
    }

    @Bean
    @Primary
    public RecordingMailSender recordingMailSender() {
        return new RecordingMailSender();
    }

    @Bean
    public DatabaseCleaner databaseCleaner(JdbcClient jdbcClient) {
        return new DatabaseCleaner(jdbcClient);
    }
}
