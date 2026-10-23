package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;

@Component
class ExitingApplicationRestarter implements ApplicationRestarter {

    private static final Duration DELAY = Duration.ofSeconds(2);

    private static final Logger log = LoggerFactory.getLogger(ExitingApplicationRestarter.class);

    private final ConfigurableApplicationContext context;

    ExitingApplicationRestarter(ConfigurableApplicationContext context) {
        this.context = context;
    }

    @Override
    public void restartAfterCommit() {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            scheduleExit();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                scheduleExit();
            }
        });
    }

    private void scheduleExit() {
        Thread.ofPlatform().name("settings-restart").start(() -> {
            try {
                Thread.sleep(DELAY);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            log.info("Stopping the backend to apply the changed settings; Docker starts it again");
            System.exit(SpringApplication.exit(context, () -> 0));
        });
    }
}
