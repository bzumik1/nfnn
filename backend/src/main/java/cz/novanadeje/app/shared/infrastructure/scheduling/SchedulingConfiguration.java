package cz.novanadeje.app.shared.infrastructure.scheduling;

import org.springframework.boot.task.ThreadPoolTaskSchedulerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfiguration {

    @Bean
    ThreadPoolTaskSchedulerCustomizer dropDelayedTasksOnShutdown() {
        return scheduler -> scheduler.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
    }
}
