package cz.novanadeje.app.operations.infrastructure.backup;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;

class BackupWatchScheduleCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String cron = context.getEnvironment().getProperty("app.operations.backups.check-cron");
        return StringUtils.hasText(cron) && !Scheduled.CRON_DISABLED.equals(cron.trim());
    }
}
