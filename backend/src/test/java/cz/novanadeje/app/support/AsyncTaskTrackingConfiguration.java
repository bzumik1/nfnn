package cz.novanadeje.app.support;

import org.springframework.boot.task.ThreadPoolTaskExecutorCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

@TestConfiguration(proxyBeanMethods = false)
public class AsyncTaskTrackingConfiguration {

    @Bean
    public AsyncTaskTracker asyncTaskTracker() {
        return new AsyncTaskTracker();
    }

    @Bean
    public ThreadPoolTaskExecutorCustomizer trackApplicationTasks(AsyncTaskTracker tracker) {
        return executor -> executor.setTaskDecorator(tracker.decorator());
    }
}
