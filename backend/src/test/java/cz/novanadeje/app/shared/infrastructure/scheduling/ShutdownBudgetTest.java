package cz.novanadeje.app.shared.infrastructure.scheduling;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.core.io.ClassPathResource;

import java.time.Duration;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

class ShutdownBudgetTest {

    private static final Duration STOP_GRACE_PERIOD = Duration.ofSeconds(75);
    private static final Duration DEFAULT_PHASE_TIMEOUT = Duration.ofSeconds(30);

    @Test
    @DisplayName("Given the configuration, when the backend stops, then the request drain, the wait for running async work and the wait for a running scheduled job fit together inside the stop grace period")
    void should_fit_every_shutdown_wait_inside_the_grace_period_when_stopped_given_application_yml() {
        Properties properties = applicationYml();
        Duration phase = duration(properties, "spring.lifecycle.timeout-per-shutdown-phase", DEFAULT_PHASE_TIMEOUT);
        Duration scheduledJob = duration(properties, "spring.task.scheduling.shutdown.await-termination-period", Duration.ZERO);
        Duration requestDrain = phase;
        Duration runningAsyncWork = phase;

        assertThat(properties.getProperty("spring.task.scheduling.shutdown.await-termination")).isEqualTo("true");
        assertThat(requestDrain.plus(runningAsyncWork).plus(scheduledJob)).isLessThan(STOP_GRACE_PERIOD);
    }

    private static Properties applicationYml() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        return yaml.getObject();
    }

    private static Duration duration(Properties properties, String name, Duration absent) {
        String value = properties.getProperty(name);
        return value == null ? absent : DurationStyle.detectAndParse(value);
    }
}
